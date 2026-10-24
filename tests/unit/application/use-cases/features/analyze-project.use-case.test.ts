import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { AnalyzeProjectUseCase } from '@/application/use-cases/mind-map/analyze-project.use-case.js';

function setup(existing: unknown[] = []) {
  const features = {
    list: vi.fn(async () => existing),
    create: vi.fn(async (row) => {
      existing.push(row);
    }),
  };
  const maps = {
    claim: vi.fn(),
    get: vi.fn(),
    finishAnalysis: vi.fn().mockResolvedValue(true),
    fail: vi.fn(),
  };
  maps.claim.mockImplementation(async (_id, token) => {
    maps.get.mockResolvedValue({ generating: true, requestedFingerprint: token });
    return true;
  });
  const files = {
    read: vi.fn().mockResolvedValue([
      { path: 'src/combat.ts', content: 'export function damage() { return 12; }' },
      { path: 'README.md', content: 'Combat system' },
    ]),
  };
  const execute = vi.fn().mockResolvedValue({
    result: JSON.stringify({
      features: [
        {
          key: 'combat',
          name: 'Combat',
          description: 'Weapon damage',
          existingFeatureId: null,
          evidencePaths: ['src/combat.ts'],
        },
      ],
    }),
  });
  const regroup = { execute: vi.fn() };
  const useCase = new AnalyzeProjectUseCase(
    { findById: vi.fn().mockResolvedValue({ id: 'repo', path: '/repo', name: 'Forge' }) } as never,
    features as never,
    maps as never,
    files,
    { getExecutor: vi.fn().mockResolvedValue({ execute }) } as never,
    { load: vi.fn().mockResolvedValue({ models: { default: 'chosen' } }) } as never,
    regroup as never
  );
  return { useCase, features, maps, files, execute, regroup };
}

describe('AnalyzeProjectUseCase', () => {
  it('reads actual source, imports evidenced completed capabilities without execution, and rebuilds the whole map', async () => {
    const { useCase, execute, features, maps, regroup } = setup();
    expect((await useCase.execute('repo')).accepted).toBe(true);
    await vi.waitFor(() => expect(regroup.execute).toHaveBeenCalledWith('repo', true));
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('export function damage'),
      expect.objectContaining({ readOnly: true, model: 'chosen' })
    );
    expect(features.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: 'Maintain',
        discovery: expect.objectContaining({ key: 'combat', evidencePaths: ['src/combat.ts'] }),
      })
    );
    expect(features.create.mock.calls[0][0].agentRunId).toBeUndefined();
    expect(maps.finishAnalysis).toHaveBeenCalled();
  });
  it('does not duplicate existing capabilities on a second scan', async () => {
    const { useCase, features, regroup } = setup([
      { id: 'known', name: 'Combat', discovery: { key: 'combat' } },
    ]);
    await useCase.execute('repo');
    await vi.waitFor(() => expect(regroup.execute).toHaveBeenCalled());
    expect(features.create).not.toHaveBeenCalled();
  });
  it('rejects ungrounded discoveries and releases the lease with an error', async () => {
    const { useCase, execute, features, maps } = setup();
    execute.mockResolvedValue({
      result: JSON.stringify({
        features: [
          {
            key: 'magic',
            name: 'Magic',
            description: 'Imaginary',
            existingFeatureId: null,
            evidencePaths: ['missing.ts'],
          },
        ],
      }),
    });
    await useCase.execute('repo');
    await vi.waitFor(() => expect(maps.fail).toHaveBeenCalled());
    expect(features.create).not.toHaveBeenCalled();
  });
  it('does not start a second scan while another generation owns the project lease', async () => {
    const { useCase, maps, execute } = setup();
    maps.claim.mockResolvedValue(false);
    expect((await useCase.execute('repo')).accepted).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
