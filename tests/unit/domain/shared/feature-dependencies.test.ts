import { describe, expect, it } from 'vitest';
import { featureParentIds, assertDependencyDag } from '@/domain/shared/feature-dependencies.js';

describe('feature dependencies', () => {
  it('normalizes legacy parents, deduplicates joins, and treats an explicit empty list as authoritative', () => {
    expect(featureParentIds({ parentId: 'old' })).toEqual(['old']);
    expect(featureParentIds({ parentId: 'old', parentIds: ['a', 'b', 'a'] })).toEqual(['a', 'b']);
    expect(featureParentIds({ parentId: 'old', parentIds: [] })).toEqual([]);
  });

  it('accepts a diamond DAG without confusing shared ancestors with a cycle', async () => {
    const graph: Record<string, string[]> = { a: ['shared'], b: ['shared'], shared: [] };
    await expect(
      assertDependencyDag('child', ['a', 'b'], async (id) => graph[id] ?? [])
    ).resolves.toBeUndefined();
  });

  it('refuses a cycle through the second parent', async () => {
    const graph: Record<string, string[]> = { a: [], b: ['child'] };
    await expect(
      assertDependencyDag('child', ['a', 'b'], async (id) => graph[id] ?? [])
    ).rejects.toThrow(/cycle/i);
  });
});
