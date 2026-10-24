import { describe, expect, it, vi } from 'vitest';
import { FeatureContextExecutor } from '@/infrastructure/services/agents/feature-agent/feature-context-executor.js';
import { createMockFeatureRepository } from '@tests/helpers/feature-repository.mock.js';

describe('FeatureContextExecutor', () => {
  it('passes both prerequisite outcomes, their chats and durable corrections to each execution', async () => {
    const rows = [
      { id: 'child', parentIds: ['a', 'b'], executionCorrections: ['Use bronze instead of steel'] },
      { id: 'a', name: 'Equipment', description: 'Inventory contract', branch: 'feat/equipment' },
      { id: 'b', name: 'Combat', description: 'Damage contract', branch: 'feat/combat' },
    ];
    const features = createMockFeatureRepository({
      findById: vi.fn(async (id) => rows.find((row) => row.id === id) ?? null),
    });
    const messages = {
      findByFeatureId: vi.fn(async (id) => [
        { role: 'user', content: `${id}: approved decisions` },
      ]),
    };
    const delegate = { execute: vi.fn().mockResolvedValue({ result: 'Done' }) };
    const executor = new FeatureContextExecutor(
      delegate as never,
      features,
      'child',
      messages as never
    );
    await executor.execute('Implement weapon selection', { cwd: '/child-worktree' });
    const prompt = delegate.execute.mock.calls[0][0];
    for (const expected of [
      'Inventory contract',
      'Damage contract',
      'a: approved decisions',
      'b: approved decisions',
      'Use bronze instead of steel',
    ])
      expect(prompt).toContain(expected);
    expect(delegate.execute.mock.calls[0][1]).toEqual({ cwd: '/child-worktree' });
  });
});
