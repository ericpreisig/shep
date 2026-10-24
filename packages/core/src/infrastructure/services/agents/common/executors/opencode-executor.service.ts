import type { AgentFeature, AgentType } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionUsage,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { ExecFunction } from '../../../git/worktree.service.js';
import { createExecFunction } from '../../../process/exec-function.js';
import type { SpawnFunction } from '../types.js';
import { IS_WINDOWS } from '../../../../platform.js';
import { EventChannel } from '../../streaming/event-channel.js';
import { createExecutorLogger } from './executor-logger.js';
import { validateSecurityConstraints } from './security-constraint-validator.js';
import {
  AGENT_ABORTED_MESSAGE,
  agentTimeoutMessage,
  buildSpawnOptions,
  classifySpawnError,
  createLineAccumulator,
  createStderrTail,
  signalTerminationMessage,
  toolInputLogPreview,
  watchAbortSignal,
  watchProcessIdle,
  writePromptToStdin,
} from './process-stream.js';

import { OPENCODE_FREE_MODEL } from '../../../../../domain/shared/agent-catalog.js';
export const OPENCODE_NOT_FOUND =
  'OpenCode v2 ("opencode") not found. Install it with npm install -g @opencode/cli.';
export type OpenCodeExportSession = (sessionId: string, cwd?: string) => Promise<string>;

interface Snapshot {
  info?: {
    outcome?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      cache?: { read?: number; write?: number };
    };
  };
}

interface OpenCodeEvent {
  type?: string;
  sessionID?: string;
  part?: { text?: string; tool?: string; state?: { input?: unknown; output?: string } };
  error?: { message?: string; data?: { message?: string } };
}

/** JSON output omits the final step's usage; the native saved session is authoritative. */
export function createOpenCodeExportSession(exec: ExecFunction): OpenCodeExportSession {
  return async (sessionId, cwd) => {
    const { stdout } = await exec('opencode', ['session', 'export', sessionId, '--sanitize'], {
      cwd,
      timeout: 15_000,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    return String(stdout);
  };
}

function usageDelta(current: Snapshot, before?: Snapshot): AgentExecutionUsage | undefined {
  const tokens = current.info?.tokens;
  if (!tokens) return undefined;
  const prior = before?.info?.tokens;
  const read = Math.max(0, (tokens.cache?.read ?? 0) - (prior?.cache?.read ?? 0));
  const write = Math.max(0, (tokens.cache?.write ?? 0) - (prior?.cache?.write ?? 0));
  return {
    // OpenCode records uncached input separately from cache reads and writes.
    inputTokens: Math.max(0, (tokens.input ?? 0) - (prior?.input ?? 0)) + read + write,
    outputTokens: Math.max(0, (tokens.output ?? 0) - (prior?.output ?? 0)),
    cacheReadInputTokens: read,
    cacheCreationInputTokens: write,
    ...(typeof current.info?.cost === 'number'
      ? { costUsd: Math.max(0, current.info.cost - (before?.info?.cost ?? 0)) }
      : {}),
  };
}

/** Native OpenCode owns tools, free-client eligibility and Go authentication. */
export class OpenCodeExecutorService implements IAgentExecutor {
  readonly agentType = 'opencode' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly exportSession: OpenCodeExportSession = createOpenCodeExportSession(
      createExecFunction()
    )
  ) {}

  supportsFeature(feature: AgentFeature): boolean {
    return ['streaming', 'session-resume', 'system-prompt'].includes(feature);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    let result: AgentExecutionResult | undefined;
    for await (const event of this.executeStream(prompt, options)) {
      if (event.type === 'error') throw new Error(event.content);
      if (event.type === 'result')
        result = {
          result: event.content,
          sessionId: event.sessionId,
          usage: event.usage,
        };
    }
    if (!result) throw new Error('OpenCode exited without a completed response.');
    return result;
  }

  async *executeStream(
    prompt: string,
    options: AgentExecutionOptions = {}
  ): AsyncIterable<AgentExecutionStreamEvent> {
    if (options.abortSignal?.aborted) throw new Error(AGENT_ABORTED_MESSAGE);
    if (options.model && !/^[\w.-]+\/[\w./:#-]+$/.test(options.model)) {
      throw new Error('OpenCode requires a provider/model identifier from its model list.');
    }
    if (options.resumeSession && !/^[\w.-]+$/.test(options.resumeSession)) {
      throw new Error('Invalid OpenCode session identifier.');
    }
    const log = createExecutorLogger(options.silent);
    const warning = validateSecurityConstraints(options.securityConstraints, {
      requiresPermissiveMode: true,
      executorName: 'opencode',
    });
    if (warning) log(warning);
    const before: Snapshot | undefined = options.resumeSession
      ? (JSON.parse(await this.exportSession(options.resumeSession, options.cwd)) as Snapshot)
      : undefined;
    if (options.abortSignal?.aborted) throw new Error(AGENT_ABORTED_MESSAGE);
    // A private server exits with the process: stopping a task must stop its tools too.
    const args = [
      'run',
      '--standalone',
      '--format',
      'json',
      '--auto',
      '--model',
      options.model ?? OPENCODE_FREE_MODEL,
    ];
    if (options.resumeSession) args.push('--session', options.resumeSession);
    const command = IS_WINDOWS ? 'cmd.exe' : 'opencode';
    const argv = IS_WINDOWS ? ['/d', '/c', 'opencode', ...args] : args;
    log(`Spawn: opencode ${args.join(' ')}`);
    const proc = this.spawn(
      command,
      argv,
      buildSpawnOptions({ cwd: options.cwd, environment: options.environment })
    );
    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    const controller = new AbortController();
    const signal = options.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    let failure: string | undefined;
    let sessionId: string | undefined;
    let text = '';
    let finished = false;
    let closed = false;
    let resolveClosed!: () => void;
    const didClose = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const emit = (event: Omit<AgentExecutionStreamEvent, 'timestamp'>) =>
      channel.push({ ...event, timestamp: new Date() });
    const finishError = (message: string) => {
      if (finished) return;
      finished = true;
      emit({ type: 'error', content: message });
      channel.close();
    };
    const abortWatch = watchAbortSignal(proc, signal, {
      onAbort: () => {
        failure ??= AGENT_ABORTED_MESSAGE;
      },
      onUnreaped: () => {
        resolveClosed();
        finishError(failure ?? AGENT_ABORTED_MESSAGE);
      },
    });
    const timeout = options.timeout
      ? setTimeout(() => {
          failure = agentTimeoutMessage(options.timeout!);
          controller.abort();
        }, options.timeout)
      : undefined;
    const idle = watchProcessIdle(proc, options.idleTimeout, (message) => {
      failure = message;
      controller.abort();
    });
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      idle.stop();
      abortWatch.stop();
    };
    const lines = createLineAccumulator(
      (line) => {
        let event: OpenCodeEvent;
        try {
          const parsed: unknown = JSON.parse(line);
          if (!parsed || typeof parsed !== 'object') return;
          event = parsed as OpenCodeEvent;
        } catch {
          return;
        }
        if (typeof event.sessionID === 'string') sessionId = event.sessionID;
        const part = event.part ?? {};
        if (event.type === 'text' && typeof part.text === 'string') {
          text += part.text;
          emit({ type: 'progress', kind: 'text', content: part.text, sessionId });
        } else if (event.type === 'tool_use') {
          const state = part.state ?? {};
          emit({
            type: 'progress',
            kind: 'tool_use',
            content: `${part.tool ?? 'tool'}: ${toolInputLogPreview(state.input)}`,
            sessionId,
          });
          if (typeof state.output === 'string')
            emit({ type: 'progress', kind: 'tool_result', content: state.output, sessionId });
        } else if (event.type === 'error') {
          failure =
            event.error?.message ??
            event.error?.data?.message ??
            JSON.stringify(event.error ?? event);
        }
      },
      {
        onOverflow: () => {
          failure = 'OpenCode output exceeded the maximum event size.';
          controller.abort();
        },
      }
    );
    proc.stdout?.on('data', (chunk: Buffer | string) => lines.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr.push(chunk);
      log(`stderr: ${String(chunk).trim()}`);
    });
    proc.once('error', (error: Error & { code?: string }) => {
      closed = true;
      resolveClosed();
      cleanup();
      finishError(classifySpawnError(error, OPENCODE_NOT_FOUND).message);
    });
    proc.once('close', (code: number | null, sig: NodeJS.Signals | null) => {
      closed = true;
      resolveClosed();
      cleanup();
      lines.flush();
      void (async () => {
        if (finished) return;
        if (failure) {
          finishError(failure);
          return;
        }
        if (sig || code === null) {
          finishError(signalTerminationMessage(sig, stderr.text()));
          return;
        }
        if (code !== 0) {
          finishError(`OpenCode exited with code ${code}: ${stderr.text().slice(-1000)}`);
          return;
        }
        if (!sessionId || !text.trim()) {
          finishError(
            'OpenCode exited without a completed response — the turn was cut short before it finished.'
          );
          return;
        }
        try {
          const saved = JSON.parse(await this.exportSession(sessionId, options.cwd)) as Snapshot;
          if (saved.info?.outcome !== 'succeeded') {
            finishError(
              `OpenCode session did not complete (${saved.info?.outcome ?? 'unknown outcome'}).`
            );
            return;
          }
          finished = true;
          emit({ type: 'result', content: text, sessionId, usage: usageDelta(saved, before) });
          channel.close();
        } catch (error) {
          finishError(
            `Cannot verify OpenCode result: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })();
    });
    writePromptToStdin(
      proc,
      options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt
    );
    try {
      yield* channel;
    } finally {
      if (!closed) {
        controller.abort();
        await didClose;
      }
      cleanup();
    }
  }
}
