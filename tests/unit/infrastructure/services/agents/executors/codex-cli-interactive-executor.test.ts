import { describe, expect, it, vi } from 'vitest';
import { CodexCliInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/codex-cli-interactive-executor.service.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { InteractiveAgentSessionHandle } from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import { AgentSessionNotFoundError } from '@/application/ports/output/agents/agent-session-not-found.error.js';

async function turn(handle: InteractiveAgentSessionHandle, message: string) {
  await handle.send(message);
  const events = [];
  for await (const event of handle.stream()) events.push(event);
  return events;
}

describe('CodexCliInteractiveExecutor', () => {
  it('signals a missing native thread so the existing recovery flow can start a new one', async () => {
    const executeStream = vi.fn(async function* () {
      yield { type: 'error', content: 'Conversation thread not found', timestamp: new Date() };
    });
    const handle = await new CodexCliInteractiveExecutor({
      executeStream,
    } as unknown as IAgentExecutor).resumeSession('deleted-thread', { cwd: '/work/feature' });
    await expect(turn(handle, 'Continue')).rejects.toBeInstanceOf(AgentSessionNotFoundError);
  });
  it('preserves the reported conversation across turns and avoids duplicate final text', async () => {
    const executeStream = vi.fn(async function* (
      _prompt: string,
      _options?: AgentExecutionOptions
    ) {
      yield { type: 'progress', kind: 'text', content: 'Hello', timestamp: new Date() };
      yield {
        type: 'result',
        content: 'Hello world',
        sessionId: 'codex-thread',
        timestamp: new Date(),
      };
    });
    const executor = new CodexCliInteractiveExecutor({
      executeStream,
    } as unknown as IAgentExecutor);
    const handle = await executor.createSession({
      cwd: '/work/feature',
      model: 'chosen-model',
      systemPrompt: 'Feature context',
    });
    const events = await turn(handle, 'First instruction');
    expect(
      events
        .filter((e) => e.type === 'delta')
        .map((e) => e.content)
        .join('')
    ).toBe('Hello world');
    expect(events.at(-1)?.type).toBe('done');
    expect(handle.sessionId).toBe('codex-thread');
    await turn(handle, 'Adjust it');
    expect(executeStream.mock.calls[0][0]).toContain('Feature context');
    expect(executeStream.mock.calls[1]).toEqual([
      'Adjust it',
      expect.objectContaining({
        resumeSession: 'codex-thread',
        cwd: '/work/feature',
        model: 'chosen-model',
      }),
    ]);
    await handle.close();
  });

  it('resumes an existing conversation, forwards tool activity, and reports errors', async () => {
    const executeStream = vi.fn(async function* () {
      yield { type: 'progress', kind: 'tool_use', content: 'git status', timestamp: new Date() };
      yield { type: 'error', content: 'Authentication expired', timestamp: new Date() };
    });
    const handle = await new CodexCliInteractiveExecutor({
      executeStream,
    } as unknown as IAgentExecutor).resumeSession('saved-thread', { cwd: '/work/feature' });
    const events = await turn(handle, 'Continue');
    expect(executeStream).toHaveBeenCalledWith(
      'Continue',
      expect.objectContaining({ resumeSession: 'saved-thread' })
    );
    expect(events.map((e) => e.type)).toEqual(['tool_use', 'error']);
    expect(events.at(-1)?.content).toBe('Authentication expired');
  });

  it('aborts a running turn and refuses messages after close', async () => {
    let signal: AbortSignal | undefined;
    const executeStream = vi.fn(async function* (_prompt: string, options?: AgentExecutionOptions) {
      signal = options?.abortSignal;
      yield { type: 'progress', kind: 'text', content: 'Working', timestamp: new Date() };
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true })
      );
    });
    const handle = await new CodexCliInteractiveExecutor({
      executeStream,
    } as unknown as IAgentExecutor).createSession({ cwd: '/work/feature' });
    const consuming = turn(handle, 'Start');
    await vi.waitFor(() => expect(signal).toBeDefined());
    handle.abort();
    expect(signal?.aborted).toBe(true);
    await handle.close();
    await consuming;
    await expect(handle.send('Another turn')).rejects.toThrow(/closed/i);
  });
});
