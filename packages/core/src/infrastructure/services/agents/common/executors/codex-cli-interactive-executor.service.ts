import type { IAgentExecutor } from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import { AgentSessionNotFoundError } from '../../../../../application/ports/output/agents/agent-session-not-found.error.js';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentEvent,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
  ToolResultMessage,
} from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

/** Reuses Codex's authenticated streaming CLI and native conversation resumption. */
export class CodexCliInteractiveExecutor implements IInteractiveAgentExecutor {
  constructor(private readonly executor: IAgentExecutor) {}

  async createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle> {
    return new CodexCliSession(this.executor, options);
  }

  async resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle> {
    return new CodexCliSession(this.executor, options, sessionId);
  }
}

class CodexCliSession implements InteractiveAgentSessionHandle {
  private id: string;
  private closed = false;
  private prompt: string | undefined;
  private abortController: AbortController | undefined;
  private consuming = false;
  private turnDone?: Promise<void>;
  private finishTurn?: () => void;

  constructor(
    private readonly executor: IAgentExecutor,
    private readonly options: InteractiveAgentOptions,
    sessionId?: string
  ) {
    this.id = sessionId ?? '';
  }

  get sessionId(): string {
    return this.id;
  }

  async send(message: string): Promise<void> {
    if (this.closed) throw new Error('Codex chat session is closed');
    if (this.prompt !== undefined || this.consuming) throw new Error('Codex turn is still running');
    this.prompt =
      !this.id && this.options.systemPrompt
        ? `${this.options.systemPrompt}\n\n${message}`
        : message;
    this.abortController = new AbortController();
  }

  async sendToolResult(toolResult: ToolResultMessage): Promise<void> {
    await this.send(JSON.stringify(toolResult));
  }

  async *stream(): AsyncIterable<InteractiveAgentEvent> {
    if (this.prompt === undefined || this.consuming) return;
    const prompt = this.prompt;
    this.prompt = undefined;
    this.consuming = true;
    this.turnDone = new Promise((resolve) => {
      this.finishTurn = resolve;
    });
    let text = '';
    let done: InteractiveAgentEvent | undefined;
    try {
      for await (const event of this.executor.executeStream(prompt, {
        cwd: this.options.cwd,
        model: this.options.model,
        environment: this.options.environment,
        ...(this.id ? { resumeSession: this.id } : {}),
        abortSignal: this.abortController?.signal,
        streamProgress: true,
      })) {
        if (event.sessionId) this.id = event.sessionId;
        if (event.type === 'error') {
          if (
            this.id &&
            /session|thread|conversation/i.test(event.content) &&
            /not found|does not exist|no saved|unable to find/i.test(event.content)
          ) {
            throw new AgentSessionNotFoundError(this.id, event.content);
          }
          yield { type: 'error', content: event.content };
          return;
        }
        if (event.type === 'result') {
          const remaining = event.content.startsWith(text)
            ? event.content.slice(text.length)
            : event.content;
          if (remaining) yield { type: 'delta', content: remaining };
          done = { type: 'done', usage: event.usage };
          continue;
        }
        if (event.kind === 'text') {
          text += event.content;
          yield { type: 'delta', content: event.content };
        } else {
          yield { type: event.kind ?? 'status', content: event.content, label: event.content };
        }
      }
      if (done) {
        yield done;
      } else if (!this.abortController?.signal.aborted) {
        yield { type: 'error', content: 'Codex stopped before completing its response' };
      }
    } catch (error) {
      if (error instanceof AgentSessionNotFoundError) throw error;
      yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
    } finally {
      this.consuming = false;
      this.finishTurn?.();
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.abort();
    this.prompt = undefined;
    await this.turnDone;
  }
}
