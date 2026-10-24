import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ExpandAutoTaskUseCase } from '@/application/use-cases/features/expand-auto-task.use-case.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';
import { SdlcLifecycle, type Feature } from '@/domain/generated/output.js';

function setup(answer: unknown) {
  const root = {
    id: 'root',
    name: 'Trading system',
    userQuery: 'Implement trading',
    repositoryPath: '/repo',
    lifecycle: SdlcLifecycle.Pending,
    parentIds: ['manual'],
    autoTask: { enabled: true },
    agentRunId: 'run',
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
  } as Feature;
  const rows: Feature[] = [
    root,
    ...['manual', 'existing'].map(
      (id) =>
        ({
          id,
          name: id,
          repositoryPath: '/repo',
          lifecycle: SdlcLifecycle.Maintain,
        }) as Feature
    ),
  ];
  const repo = createMockFeatureRepository({
    findById: vi.fn(async (id) => rows.find((f) => f.id === id) ?? null),
    list: vi.fn(async () => [...rows]),
    claimAutoTaskPlanning: vi.fn().mockResolvedValue(true),
    saveAutoTaskPlan: vi.fn(async (_id, _token, plan) => {
      root.autoTask!.plan = plan;
      return true;
    }),
    failAutoTaskPlanning: vi.fn(),
    updateDependenciesBeforeStart: vi.fn(async (_id, ids) => {
      root.parentIds = ids;
      return true;
    }),
  });
  const create = {
    createRecord: vi.fn(async (input) => {
      const feature = {
        ...root,
        id: input.featureId,
        name: input.name,
        agentRunId: `run-${input.featureId}`,
        parentIds: input.parentIds,
        specPath: '',
        autoTask: { enabled: false, sourceFeatureId: 'root' },
      } as Feature;
      rows.push(feature);
      return { feature, shouldSpawn: false };
    }),
    initializeAndSpawn: vi.fn(async (feature) => {
      feature.specPath = '/spec';
    }),
  };
  const execute = vi.fn().mockResolvedValue({ result: JSON.stringify(answer) });
  const runs = {
    findById: vi.fn().mockResolvedValue({ agentType: 'selected', modelId: 'pinned' }),
    create: vi.fn(),
  };
  const useCase = new ExpandAutoTaskUseCase(
    repo,
    runs as never,
    create as never,
    { getExecutor: vi.fn().mockResolvedValue({ execute }) } as never,
    { load: vi.fn().mockResolvedValue({ models: { default: 'planner' } }) } as never,
    {
      read: vi
        .fn()
        .mockResolvedValue([{ path: 'src/trade.ts', content: 'export const price = 2;' }]),
    }
  );
  return { useCase, repo, root, rows, create, execute };
}

describe('ExpandAutoTaskUseCase', () => {
  const plan = {
    parentIds: ['existing'],
    tasks: [
      {
        key: 'market',
        name: 'Market',
        description: 'Implement the market',
        dependsOn: ['existing'],
      },
      { key: 'trade', name: 'Trade', description: 'Implement trading UI', dependsOn: ['market'] },
    ],
  };
  it('plans against every existing feature and source, persists first, then creates a validated deferred DAG', async () => {
    const { useCase, repo, root, create, execute } = setup(plan);
    await useCase.execute('root');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('export const price'),
      expect.objectContaining({ readOnly: true, model: 'planner' })
    );
    expect(execute.mock.calls[0][0]).toContain('existing');
    const first = create.createRecord.mock.calls[0][0];
    const second = create.createRecord.mock.calls[1][0];
    expect(first).toMatchObject({
      pending: true,
      autoTaskSourceFeatureId: 'root',
      agentType: 'selected',
      model: 'pinned',
    });
    expect(first.parentIds).toEqual(['manual', 'existing']);
    expect(second.parentIds).toEqual(['manual', first.featureId]);
    expect(root.parentIds).toEqual(['manual', 'existing', second.featureId]);
    expect(create.initializeAndSpawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false
    );
    expect(repo.saveAutoTaskPlan.mock.invocationCallOrder[0]).toBeLessThan(
      create.createRecord.mock.invocationCallOrder[0]
    );
    expect(root.autoTask?.plan?.ready).toBe(true);
    await useCase.execute('root');
    expect(create.createRecord).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('retains a saved plan and resumes a partially initialized child without creating duplicates', async () => {
    const { useCase, root, create, execute } = setup(plan);
    create.initializeAndSpawn.mockRejectedValueOnce(new Error('temporary git error'));
    await expect(useCase.execute('root')).rejects.toThrow('temporary git error');
    expect(root.autoTask?.plan?.ready).toBe(false);
    await useCase.execute('root');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(create.createRecord).toHaveBeenCalledTimes(2);
    expect(root.autoTask?.plan?.ready).toBe(true);
  });
  it('refuses unknown prerequisites and cycles before creating any records', async () => {
    for (const invalid of [
      { parentIds: ['missing'], tasks: [] },
      {
        parentIds: [],
        tasks: [
          { key: 'a', name: 'A', description: 'A', dependsOn: ['b'] },
          { key: 'b', name: 'B', description: 'B', dependsOn: ['a'] },
        ],
      },
      { parentIds: ['root'], tasks: [] },
    ]) {
      const { useCase, create, repo } = setup(invalid);
      await expect(useCase.execute('root')).rejects.toThrow();
      expect(create.createRecord).not.toHaveBeenCalled();
      expect(repo.failAutoTaskPlanning).toHaveBeenCalled();
    }
  });
  it('does not force unnecessary subtasks for a small task', async () => {
    const { useCase, create, root } = setup({ parentIds: ['existing'], tasks: [] });
    await useCase.execute('root');
    expect(create.createRecord).not.toHaveBeenCalled();
    expect(root.parentIds).toEqual(['manual', 'existing']);
    expect(root.autoTask?.plan?.ready).toBe(true);
  });
  it('does not plan twice when another process owns the lease', async () => {
    const { useCase, repo, execute } = setup(plan);
    repo.claimAutoTaskPlanning.mockResolvedValue(false);
    await expect(useCase.execute('root')).rejects.toThrow(/progress/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
