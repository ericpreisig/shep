import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GetProjectMindMapUseCase } from '@/application/use-cases/mind-map/get-project-mind-map.use-case.js';

describe('GetProjectMindMapUseCase', () => {
  it('serves every task immediately, resolves the configured AI and persists a regrouped taxonomy', async () => {
    const maps = {
      get: vi.fn().mockResolvedValue(null),
      claim: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn(),
      finishAnalysis: vi.fn(),
    };
    const features = {
      list: vi.fn().mockResolvedValue([
        {
          id: 'task-a',
          name: 'Armes',
          userQuery: 'Weapons',
          description: '',
          lifecycle: 'Archived',
        },
        { id: 'task-b', name: 'Armures', userQuery: 'Armor', description: '' },
      ]),
    };
    const repos = {
      findById: vi.fn().mockResolvedValue({ id: 'repo', name: 'Forge', path: '/forge' }),
    };
    const execute = vi.fn().mockResolvedValue({
      result: JSON.stringify({
        topics: [
          {
            id: 'equipment',
            label: 'Équipement',
            parentId: null,
            featureIds: ['task-a', 'task-b'],
          },
        ],
      }),
    });
    const provider = { getExecutor: vi.fn().mockResolvedValue({ execute }) };
    const settings = {
      load: vi.fn().mockResolvedValue({ models: { default: 'user-chosen-model' } }),
    };
    const useCase = new GetProjectMindMapUseCase(
      repos as never,
      features as never,
      maps,
      provider as never,
      settings as never
    );
    const result = await useCase.execute('repo');
    expect(features.list).toHaveBeenCalledWith({ repositoryPath: '/forge', includeArchived: true });
    expect(result.map.topics.flatMap((topic) => topic.featureIds)).toEqual(['task-a', 'task-b']);
    expect(result.generating).toBe(true);
    await vi.waitFor(() => expect(maps.save).toHaveBeenCalled());
    expect(provider.getExecutor).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('task-b'),
      expect.objectContaining({ model: 'user-chosen-model' })
    );
    expect(maps.save.mock.calls[0][0].topics[0].label).toBe('Équipement');
  });

  it('keeps the last good map on a model failure and avoids retrying on every poll', async () => {
    const maps = {
      get: vi.fn().mockResolvedValue({
        map: {
          topics: [{ id: 'old', label: 'Existing', featureIds: ['task'] }],
          fingerprint: 'old',
        },
        error: 'Unavailable',
        requestedFingerprint: 'old',
        attemptedAt: Date.now(),
        generating: false,
      }),
      claim: vi.fn(),
      save: vi.fn(),
      fail: vi.fn(),
    };
    const features = { list: vi.fn().mockResolvedValue([{ id: 'task', name: 'Task' }]) };
    const repos = {
      findById: vi.fn().mockResolvedValue({ id: 'repo', name: 'Forge', path: '/forge' }),
    };
    const provider = { getExecutor: vi.fn() };
    const useCase = new GetProjectMindMapUseCase(
      repos as never,
      features as never,
      maps as never,
      provider as never,
      {} as never
    );
    const result = await useCase.execute('repo');
    expect(result.map.topics[0].label).toBe('Existing');
    expect(maps.claim).not.toHaveBeenCalled();
    expect(result.error).toBe('Unavailable');
  });
});
