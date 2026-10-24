import type { Edge, Node } from '@xyflow/react';
import type { MindMapTopic } from '@shepai/core/domain/generated/output';
import { normalizeMindMapTopics } from '@shepai/core/domain/shared/project-mind-map';

export interface MindMapNodeData extends Record<string, unknown> {
  label: string;
  kind: 'project' | 'topic' | 'feature';
  count: number;
  collapsed?: boolean;
  topicId?: string;
  featureId?: string;
  lifecycle?: string;
  onToggle?: (id: string) => void;
}

export function buildMindMapGraph(
  projectName: string,
  sourceTopics: MindMapTopic[],
  features: { id: string; name: string; description?: string; lifecycle: string }[],
  collapsed: ReadonlySet<string>,
  query: string
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const topics = normalizeMindMapTopics(
    sourceTopics,
    features.map((feature) => feature.id)
  );
  const entries = new Map<string, MindMapNodeData>();
  const children = new Map<string, string[]>();
  const parents = new Map<string, string>();
  const attach = (id: string, parent: string, data: MindMapNodeData) => {
    entries.set(id, data);
    parents.set(id, parent);
    children.set(parent, [...(children.get(parent) ?? []), id]);
  };
  entries.set('project', { label: projectName, kind: 'project', count: features.length });
  for (const topic of topics)
    attach(`topic:${topic.id}`, topic.parentId ? `topic:${topic.parentId}` : 'project', {
      label: topic.label,
      kind: 'topic',
      topicId: topic.id,
      collapsed: collapsed.has(topic.id),
      count: 0,
    });
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  for (const topic of topics)
    for (const id of topic.featureIds) {
      const feature = byId.get(id);
      if (feature)
        attach(`feature:${id}`, `topic:${topic.id}`, {
          label: feature.name,
          kind: 'feature',
          featureId: id,
          lifecycle: feature.lifecycle,
          count: 1,
        });
    }
  const count = (id: string): number => {
    const entry = entries.get(id)!;
    if (entry.kind === 'feature') return 1;
    entry.count = (children.get(id) ?? []).reduce((total, child) => total + count(child), 0);
    return entry.count;
  };
  count('project');
  const term = query.trim().toLocaleLowerCase();
  const included = new Set<string>(['project']);
  const includeDescendants = (id: string) => {
    included.add(id);
    for (const child of children.get(id) ?? []) includeDescendants(child);
  };
  for (const [id, entry] of entries) {
    if (!term || entry.label.toLocaleLowerCase().includes(term)) {
      if (entry.kind === 'topic') includeDescendants(id);
      else included.add(id);
      let parent = parents.get(id);
      while (parent) {
        included.add(parent);
        parent = parents.get(parent);
      }
    }
  }
  const nodes: Node<MindMapNodeData>[] = [];
  const edges: Edge[] = [];
  let cursor = 0;
  const visit = (id: string, depth: number): number => {
    const entry = entries.get(id)!;
    const visibleChildren =
      !term && entry.topicId && collapsed.has(entry.topicId)
        ? []
        : (children.get(id) ?? []).filter((child) => included.has(child));
    const positions = visibleChildren.map((child) => {
      const y = visit(child, depth + 1);
      edges.push({
        id: `${id}>${child}`,
        source: id,
        target: child,
        type: 'smoothstep',
        style: { stroke: 'var(--color-muted-foreground)', strokeWidth: 1.5, opacity: 0.65 },
      });
      return y;
    });
    const y = positions.length
      ? (positions[0] + positions[positions.length - 1]) / 2
      : cursor++ * 116;
    nodes.push({
      id,
      type: 'mindMap',
      position: { x: depth * 324, y },
      data: entry,
      draggable: false,
      connectable: false,
      style: { width: 272 },
    });
    return y;
  };
  visit('project', 0);
  return { nodes, edges };
}
