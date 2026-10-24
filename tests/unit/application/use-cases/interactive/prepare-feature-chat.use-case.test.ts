import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PrepareFeatureChatUseCase } from '@/application/use-cases/interactive/prepare-feature-chat.use-case.js';
import { AgentType, AgentRunStatus, SdlcLifecycle } from '@/domain/generated/output.js';

describe('PrepareFeatureChatUseCase', () => {
  it('stops the background writer before allowing a chat in the feature worktree', async () => {
    const order: string[] = [];
    const features = {
      findById: vi.fn().mockResolvedValue({
        id: 'task',
        agentRunId: 'run',
        branch: 'feat/task',
        repositoryPath: '/repo',
        lifecycle: SdlcLifecycle.Implementation,
      }),
    };
    const runs = { findById: vi.fn().mockResolvedValue({ status: AgentRunStatus.running }) };
    const stop = {
      execute: vi.fn(async () => {
        order.push('stop');
        return { stopped: true };
      }),
    };
    const factory = { supportsInteractive: () => true };
    const settings = { load: async () => ({ agent: { type: AgentType.CodexCli } }) };
    const worktrees = {
      list: vi.fn(async () => {
        order.push('worktree');
        return [{ branch: 'feat/task', path: '/work/task' }];
      }),
    };
    const prepare = new PrepareFeatureChatUseCase(
      features as never,
      runs as never,
      stop as never,
      factory as never,
      settings as never,
      worktrees as never
    );
    expect(await prepare.execute('task')).toBe('/work/task');
    expect(order).toEqual(['stop', 'worktree']);
  });
  it('does not interrupt a task if the selected chat agent is unsupported', async () => {
    const features = { findById: vi.fn().mockResolvedValue({ id: 'task', agentRunId: 'run' }) };
    const stop = { execute: vi.fn() };
    const prepare = new PrepareFeatureChatUseCase(
      features as never,
      {} as never,
      stop as never,
      { supportsInteractive: () => false } as never,
      { load: async () => ({ agent: { type: AgentType.Dev } }) } as never,
      {} as never
    );
    await expect(prepare.execute('task')).rejects.toThrow(/chat|interactive/i);
    expect(stop.execute).not.toHaveBeenCalled();
  });
});
