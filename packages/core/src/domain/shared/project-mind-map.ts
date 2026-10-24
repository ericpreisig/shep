import type { MindMapTopic } from '../generated/output';

/** Model output never decides whether a real project task is visible. */
export function normalizeMindMapTopics(
  raw: unknown,
  featureIds: readonly string[]
): MindMapTopic[] {
  const validFeatures = new Set(featureIds);
  const assigned = new Set<string>();
  const topics: MindMapTopic[] = [];
  const ids = new Set<string>();
  if (Array.isArray(raw))
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const value = item as Record<string, unknown>;
      if (
        typeof value.id !== 'string' ||
        !value.id.trim() ||
        ids.has(value.id) ||
        typeof value.label !== 'string' ||
        !value.label.trim()
      )
        continue;
      ids.add(value.id);
      const members: string[] = [];
      if (Array.isArray(value.featureIds))
        for (const id of value.featureIds) {
          if (typeof id === 'string' && validFeatures.has(id) && !assigned.has(id)) {
            members.push(id);
            assigned.add(id);
          }
        }
      topics.push({
        id: value.id,
        label: value.label.trim().slice(0, 160),
        featureIds: members,
        ...(typeof value.parentId === 'string' && value.parentId
          ? { parentId: value.parentId }
          : {}),
      });
    }
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  for (const topic of topics) {
    const seen = new Set<string>([topic.id]);
    let parentId = topic.parentId;
    while (parentId) {
      if (!byId.has(parentId) || seen.has(parentId)) {
        delete topic.parentId;
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  const missing = featureIds.filter((id) => !assigned.has(id));
  if (missing.length) {
    let id = 'unclassified';
    while (ids.has(id)) id += '-more';
    topics.push({ id, label: 'À classer', featureIds: missing });
  }
  return topics;
}
