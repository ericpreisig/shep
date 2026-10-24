import { describe, expect, it } from 'vitest';
import { normalizeMindMapTopics } from '@/domain/shared/project-mind-map.js';

describe('project mind map normalization', () => {
  it('retains nested themes and includes every task exactly once', () => {
    const topics = normalizeMindMapTopics(
      [
        { id: 'character', label: 'Personnage', featureIds: [] },
        {
          id: 'weapons',
          label: 'Armes',
          parentId: 'character',
          featureIds: ['weapon', 'unknown', 'weapon'],
        },
      ],
      ['weapon', 'archived-task']
    );
    expect(topics.find((topic) => topic.id === 'weapons')?.parentId).toBe('character');
    expect(topics.flatMap((topic) => topic.featureIds).sort()).toEqual(['archived-task', 'weapon']);
  });

  it('cuts thematic cycles and unknown parents without dropping tasks', () => {
    const topics = normalizeMindMapTopics(
      [
        { id: 'a', label: 'A', parentId: 'b', featureIds: ['one'] },
        { id: 'b', label: 'B', parentId: 'a', featureIds: [] },
        { id: 'c', label: 'C', parentId: 'missing', featureIds: ['two'] },
      ],
      ['one', 'two']
    );
    expect(topics.some((topic) => !topic.parentId)).toBe(true);
    expect(topics.find((topic) => topic.id === 'c')?.parentId).toBeUndefined();
    expect(topics.flatMap((topic) => topic.featureIds).sort()).toEqual(['one', 'two']);
  });

  it('allows a completely different taxonomy in the next projection', () => {
    const first = normalizeMindMapTopics(
      [{ id: 'combat', label: 'Combat', featureIds: ['weapon'] }],
      ['weapon']
    );
    const second = normalizeMindMapTopics(
      [{ id: 'equipment', label: 'Équipement', featureIds: ['weapon', 'armor'] }],
      ['weapon', 'armor']
    );
    expect(first[0].label).toBe('Combat');
    expect(second).toHaveLength(1);
    expect(second[0].label).toBe('Équipement');
  });
});
