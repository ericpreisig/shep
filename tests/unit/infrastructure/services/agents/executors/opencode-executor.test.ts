import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeExecutorService } from '@/infrastructure/services/agents/common/executors/opencode-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentFeature, SecurityMode } from '@/domain/generated/output.js';
import { strictConstraints } from './security-constraints.fixture.js';

function setup() {
  const proc = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: 12345,
    kill: vi.fn(),
  });
  const spawn = vi.fn().mockReturnValue(proc) as unknown as SpawnFunction;
  const snapshot = {
    info: {
      id: 'ses_test',
      outcome: 'succeeded',
      cost: 0,
      tokens: { input: 100, output: 50, reasoning: 20, cache: { read: 1000, write: 0 } },
    },
    messages: [],
  };
  const exportSession = vi.fn().mockImplementation(async () => JSON.stringify(snapshot));
  const executor = new OpenCodeExecutorService(spawn, exportSession);
  const emit = (event: object) =>
    proc.stdout.write(`${JSON.stringify({ sessionID: 'ses_test', ...event })}\n`);
  const complete = (text = 'Done') => {
    emit({ type: 'text', part: { text } });
    proc.emit('close', 0, null);
  };
  return { proc, spawn, snapshot, exportSession, executor, emit, complete };
}

afterEach(() => vi.useRealTimers());

describe('OpenCodeExecutorService', () => {
  it('uses the native free model, isolated server and stdin without putting the prompt in argv', async () => {
    const s = setup();
    let input = '';
    s.proc.stdin.on('data', (part) => {
      input += part;
    });
    const result = s.executor.execute('User instruction $() `quoted`', {
      cwd: '/repo',
      silent: true,
    });
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    s.complete('Résumé');
    await expect(result).resolves.toMatchObject({
      result: 'Résumé',
      sessionId: 'ses_test',
      usage: { inputTokens: 1100, outputTokens: 50, cacheReadInputTokens: 1000, costUsd: 0 },
    });
    expect(s.spawn).toHaveBeenCalledWith(
      'opencode',
      [
        'run',
        '--standalone',
        '--format',
        'json',
        '--auto',
        '--model',
        'opencode/deepseek-v4.1-flash-free',
      ],
      expect.objectContaining({ cwd: '/repo' })
    );
    expect(input).toBe('User instruction $() `quoted`');
  });

  it('preserves the Go provider/model and subtracts cumulative usage when resuming', async () => {
    const s = setup();
    s.exportSession.mockResolvedValueOnce(
      JSON.stringify({
        info: { cost: 0.1, tokens: { input: 40, output: 10, cache: { read: 200, write: 0 } } },
      })
    );
    s.snapshot.info.cost = 0.25;
    const result = s.executor.execute('Continue', {
      model: 'opencode-go/deepseek-v4.1-flash',
      resumeSession: 'ses_test',
      silent: true,
    });
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    s.complete();
    await expect(result).resolves.toMatchObject({
      usage: { inputTokens: 860, outputTokens: 40, cacheReadInputTokens: 800, costUsd: 0.15 },
    });
    expect(s.spawn).toHaveBeenCalledWith(
      'opencode',
      expect.arrayContaining([
        '--model',
        'opencode-go/deepseek-v4.1-flash',
        '--session',
        'ses_test',
      ]),
      expect.any(Object)
    );
    expect(s.exportSession).toHaveBeenCalledTimes(2);
  });

  it('streams split UTF-8 JSON and real tool activity without exposing reasoning', async () => {
    const s = setup();
    const collected: unknown[] = [];
    const done = (async () => {
      for await (const event of s.executor.executeStream('Work', { silent: true }))
        collected.push(event);
    })();
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    s.emit({ type: 'reasoning', part: { text: 'private reasoning' } });
    s.emit({
      type: 'tool_use',
      part: {
        tool: 'write',
        state: { status: 'completed', input: { path: 'probe.txt' }, output: 'created' },
      },
    });
    const bytes = Buffer.from(
      `${JSON.stringify({ type: 'text', sessionID: 'ses_test', part: { text: 'Écrit' } })}\n`
    );
    const at = bytes.indexOf(Buffer.from('É')) + 1;
    s.proc.stdout.write(bytes.subarray(0, at));
    s.proc.stdout.write(bytes.subarray(at));
    s.proc.emit('close', 0, null);
    await done;
    expect(collected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'tool_use', content: expect.stringContaining('write') }),
        expect.objectContaining({ kind: 'tool_result', content: 'created' }),
        expect.objectContaining({ type: 'result', content: 'Écrit' }),
      ])
    );
    expect(JSON.stringify(collected)).not.toContain('private reasoning');
  });

  it.each([
    ['nonzero exit', 1, null, 'succeeded'],
    ['signal kill', null, 'SIGTERM', 'succeeded'],
    ['failed saved outcome', 0, null, 'failed'],
    ['unfinished saved outcome', 0, null, 'running'],
  ])('rejects partial text after %s', async (_name, code, signal, outcome) => {
    const s = setup();
    s.snapshot.info.outcome = outcome;
    const result = s.executor.execute('Work', { silent: true });
    const checked = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    s.emit({ type: 'text', part: { text: 'Partial' } });
    s.proc.emit('close', code, signal);
    await checked;
  });

  it('does not convert an error event into success even when the CLI exits zero', async () => {
    const s = setup();
    const result = s.executor.execute('Work', { silent: true });
    const checked = expect(result).rejects.toThrow('quota exceeded');
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    s.emit({ type: 'error', error: { message: 'quota exceeded' } });
    s.complete();
    await checked;
  });

  it('cancels the isolated agent and waits for its close', async () => {
    const s = setup();
    const controller = new AbortController();
    const result = s.executor.execute('Work', { abortSignal: controller.signal, silent: true });
    const checked = expect(result).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(s.spawn).toHaveBeenCalled());
    controller.abort();
    expect(s.proc.kill).toHaveBeenCalled();
    s.proc.emit('close', null, 'SIGTERM');
    await checked;
    expect(s.exportSession).not.toHaveBeenCalled();
  });

  it('enforces the timeout through the same process teardown as cancellation', async () => {
    vi.useFakeTimers();
    const s = setup();
    const result = s.executor.execute('Work', { timeout: 1000, silent: true });
    const checked = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.proc.kill).toHaveBeenCalled();
    s.proc.emit('close', null, 'SIGTERM');
    await checked;
  });

  it('does not launch an already-cancelled request or an invalid native model ID', async () => {
    const s = setup();
    await expect(s.executor.execute('Work', { abortSignal: AbortSignal.abort() })).rejects.toThrow(
      'aborted'
    );
    await expect(s.executor.execute('Work', { model: 'model; shell-command' })).rejects.toThrow(
      'provider/model'
    );
    expect(s.spawn).not.toHaveBeenCalled();
  });

  it('rejects incompatible security before launching and claims only implemented features', async () => {
    const s = setup();
    await expect(
      s.executor.execute('Work', { securityConstraints: strictConstraints(SecurityMode.Enforce) })
    ).rejects.toThrow();
    expect(s.spawn).not.toHaveBeenCalled();
    expect(s.executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    expect(s.executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    expect(s.executor.supportsFeature(AgentFeature.structuredOutput)).toBe(false);
  });
});
