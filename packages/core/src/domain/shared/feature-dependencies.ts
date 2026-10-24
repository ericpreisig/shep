import type { Feature } from '../generated/output';

export function featureParentIds(
  feature: Partial<Pick<Feature, 'parentId' | 'parentIds'>>
): string[] {
  return [...new Set(feature.parentIds ?? (feature.parentId ? [feature.parentId] : []))];
}

/** A path-local visiting set accepts shared ancestors while refusing every cycle. */
export async function assertDependencyDag(
  childId: string,
  parentIds: readonly string[],
  loadParents: (id: string) => Promise<readonly string[]>
): Promise<void> {
  const visited = new Set<string>();
  const visiting = new Set<string>([childId]);
  async function visit(id: string): Promise<void> {
    if (visiting.has(id)) throw new Error('Cycle detected in feature dependencies');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of await loadParents(id)) await visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of parentIds) await visit(id);
}
