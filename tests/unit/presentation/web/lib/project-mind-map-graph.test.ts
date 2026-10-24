import { describe, expect, it } from 'vitest';
import { buildMindMapGraph } from '@/components/features/project-mind-map/build-mind-map-graph';

const topics = [
  { id: 'character', label: 'Personnage', featureIds: [] },
  { id: 'weapons', label: 'Armes', parentId: 'character', featureIds: ['sword'] },
];
const features = [{ id: 'sword', name: 'Épée', lifecycle: 'Maintain' }];

describe('thematic mind map graph', () => {
  it('draws only thematic membership edges and hides collapsed descendants', () => {
    const graph = buildMindMapGraph('Forge', topics, features, new Set(['weapons']), '');
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['project', 'topic:character', 'topic:weapons'])
    );
    expect(graph.nodes.some((node) => node.id === 'feature:sword')).toBe(false);
    expect(graph.edges.every((edge) => !edge.source.startsWith('feature:'))).toBe(true);
    expect(graph.nodes.find((node) => node.id === 'topic:character')?.data.count).toBe(1);
  });
  it('reveals a matching task inside a collapsed theme and exposes all tasks when expanded', () => {
    const filtered = buildMindMapGraph('Forge', topics, features, new Set(['character']), 'épée');
    expect(filtered.nodes.some((node) => node.id === 'feature:sword')).toBe(true);
    const complete = buildMindMapGraph('Forge', topics, features, new Set(), '');
    expect(complete.nodes.filter((node) => node.data.kind === 'feature')).toHaveLength(1);
  });
});
