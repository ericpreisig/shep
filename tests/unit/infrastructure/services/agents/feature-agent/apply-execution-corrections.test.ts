import { describe, expect, it, vi } from 'vitest';
import { applyExecutionCorrections } from '@/infrastructure/services/agents/feature-agent/apply-execution-corrections.js';
import { createMockFeatureRepository } from '@tests/helpers/feature-repository.mock.js';

describe('applyExecutionCorrections', () => {
  it('applies pending changes even when implementation phases were already complete, and then acknowledges them', async () => {
    const features = createMockFeatureRepository({
      findById: vi.fn().mockResolvedValue({
        id: 'task',
        executionCorrections: ['Change colors'],
        executionCorrectionsApplied: 0,
      }),
    });
    const execute = vi.fn().mockResolvedValue({ result: 'Applied' });
    await applyExecutionCorrections('task', features, { execute } as never, { cwd: '/worktree' });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('Change colors'),
      expect.objectContaining({ cwd: '/worktree' })
    );
    expect(features.update).toHaveBeenCalledWith(
      expect.objectContaining({ executionCorrectionsApplied: 1 })
    );
  });
  it('leaves failed corrections pending and skips already applied instructions', async () => {
    const features = createMockFeatureRepository({
      findById: vi.fn().mockResolvedValue({
        id: 'task',
        executionCorrections: ['Fix'],
        executionCorrectionsApplied: 0,
      }),
    });
    const execute = vi.fn().mockRejectedValue(new Error('Disconnected'));
    await expect(
      applyExecutionCorrections('task', features, { execute } as never, {})
    ).rejects.toThrow('Disconnected');
    expect(features.update).not.toHaveBeenCalled();
    features.findById.mockResolvedValue({
      id: 'task',
      executionCorrections: ['Fix'],
      executionCorrectionsApplied: 1,
    });
    execute.mockClear();
    await applyExecutionCorrections('task', features, { execute } as never, {});
    expect(execute).not.toHaveBeenCalled();
  });
});
