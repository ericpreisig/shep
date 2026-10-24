/**
 * Feature Parent/Child Repository Integration Tests
 *
 * Tests for migration v19 (parent_id column + index) and the
 * findByParentId repository method added in the feature-dependencies feature.
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  getTableSchema,
  getTableIndexes,
  getSchemaVersion,
} from '../../../helpers/database.helper.js';
import {
  runSQLiteMigrations,
  LATEST_SCHEMA_VERSION,
} from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';

describe('Feature parent_id migration and findByParentId', () => {
  let db: Database.Database;
  let repository: SQLiteFeatureRepository;

  const createTestFeature = (overrides?: Partial<Feature>): Feature => ({
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/home/user/project',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteFeatureRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Migration v19', () => {
    it('should apply migration v19 and reach the latest schema version', () => {
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    });

    it('should add parent_id column to features table', () => {
      const columns = getTableSchema(db, 'features');
      const parentIdCol = columns.find((c) => c.name === 'parent_id');

      expect(parentIdCol).toBeDefined();
      expect(parentIdCol?.type).toBe('TEXT');
      expect(parentIdCol?.notnull).toBe(0); // nullable
      expect(parentIdCol?.dflt_value).toBeNull(); // no default
    });

    it('should create idx_features_parent_id index on features table', () => {
      const indexes = getTableIndexes(db, 'features');
      expect(indexes).toContain('idx_features_parent_id');
    });

    it('should leave existing feature records with parent_id = NULL', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const row = db.prepare('SELECT parent_id FROM features WHERE id = ?').get('feat-1') as {
        parent_id: string | null;
      };
      expect(row.parent_id).toBeNull();
    });
  });

  describe('parentId mapper round-trip', () => {
    it('persists source-analysis provenance without creating an execution', async () => {
      await repository.create(
        createTestFeature({
          discovery: { key: 'combat', evidencePaths: ['src/combat.ts'], analyzedAt: new Date() },
        })
      );
      const found = await repository.findById('feat-1');
      expect(found?.discovery?.key).toBe('combat');
      expect(found?.discovery?.evidencePaths).toEqual(['src/combat.ts']);
      expect(found?.agentRunId).toBeUndefined();
    });
    it('checks all parents atomically when claiming a worker slot', async () => {
      const a = createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Maintain });
      const b = createTestFeature({ id: 'b', slug: 'b', lifecycle: SdlcLifecycle.Implementation });
      await repository.create(a);
      await repository.create(b);
      await repository.create(
        createTestFeature({
          id: 'child',
          slug: 'child',
          lifecycle: SdlcLifecycle.Blocked,
          parentIds: ['a', 'b'],
        })
      );
      const claim = {
        featureId: 'child',
        targetLifecycle: SdlcLifecycle.Started,
        requireLifecycle: SdlcLifecycle.Blocked,
        updatedAt: new Date(),
      };
      expect(await repository.claimForStart(claim)).toBe(false);
      await repository.update({ ...b, lifecycle: SdlcLifecycle.Maintain });
      expect(await repository.claimForStart(claim)).toBe(true);
    });

    it('refuses a cycle inside the dependency write, even when callers validated an older graph', async () => {
      await repository.create(
        createTestFeature({ id: 'a', slug: 'a', lifecycle: SdlcLifecycle.Pending })
      );
      await repository.create(
        createTestFeature({ id: 'b', slug: 'b', lifecycle: SdlcLifecycle.Pending })
      );
      expect(await repository.updateDependenciesBeforeStart('a', ['b'])).toBe(true);
      expect(await repository.updateDependenciesBeforeStart('b', ['a'])).toBe(false);
    });

    it('round-trips multiple parents and finds the child through either parent', async () => {
      await repository.create(createTestFeature({ id: 'a', slug: 'a' }));
      await repository.create(createTestFeature({ id: 'b', slug: 'b' }));
      await repository.create(
        createTestFeature({ id: 'child', slug: 'child', parentIds: ['a', 'b'] })
      );
      expect((await repository.findById('child'))?.parentIds).toEqual(['a', 'b']);
      expect((await repository.findByParentId('a')).map((f) => f.id)).toContain('child');
      expect((await repository.findByParentId('b')).map((f) => f.id)).toContain('child');
    });

    it('refuses dependency edits after the worker started', async () => {
      await repository.create(createTestFeature({ lifecycle: SdlcLifecycle.Implementation }));
      expect(await repository.updateDependenciesBeforeStart('feat-1', ['a'])).toBe(false);
    });

    it('atomically replaces dependencies of a pending task, including clearing them', async () => {
      for (const id of ['a', 'b', 'c'])
        await repository.create(createTestFeature({ id, slug: id }));
      await repository.create(
        createTestFeature({ lifecycle: SdlcLifecycle.Pending, parentIds: ['a'] })
      );
      expect(await repository.updateDependenciesBeforeStart('feat-1', ['b', 'c'])).toBe(true);
      expect((await repository.findById('feat-1'))?.parentIds).toEqual(['b', 'c']);
      expect(await repository.updateDependenciesBeforeStart('feat-1', [])).toBe(true);
      expect((await repository.findById('feat-1'))?.parentId).toBeUndefined();
      expect((await repository.findById('feat-1'))?.parentIds).toEqual([]);
    });

    it('should persist parentId when set on a feature', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child = createTestFeature({ id: 'child-1', slug: 'child', parentId: 'parent-1' });

      await repository.create(parent);
      await repository.create(child);

      const row = db.prepare('SELECT parent_id FROM features WHERE id = ?').get('child-1') as {
        parent_id: string | null;
      };
      expect(row.parent_id).toBe('parent-1');
    });

    it('should hydrate parentId when reading a feature with parent_id set', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child = createTestFeature({ id: 'child-1', slug: 'child', parentId: 'parent-1' });

      await repository.create(parent);
      await repository.create(child);

      const found = await repository.findById('child-1');
      expect(found?.parentId).toBe('parent-1');
    });

    it('should leave parentId undefined when parent_id is NULL', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const found = await repository.findById('feat-1');
      expect(found?.parentId).toBeUndefined();
    });

    it('should persist NULL when updating a feature to remove parentId', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child = createTestFeature({ id: 'child-1', slug: 'child', parentId: 'parent-1' });

      await repository.create(parent);
      await repository.create(child);

      // Update child to remove parentId
      const updatedChild: Feature = { ...child, parentId: undefined };
      await repository.update(updatedChild);

      const found = await repository.findById('child-1');
      expect(found?.parentId).toBeUndefined();
    });
  });

  describe('findByParentId()', () => {
    it('should return all direct children of a parent feature', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child1 = createTestFeature({ id: 'child-1', slug: 'child-1', parentId: 'parent-1' });
      const child2 = createTestFeature({ id: 'child-2', slug: 'child-2', parentId: 'parent-1' });

      await repository.create(parent);
      await repository.create(child1);
      await repository.create(child2);

      const children = await repository.findByParentId('parent-1');

      expect(children).toHaveLength(2);
      const childIds = children.map((c) => c.id);
      expect(childIds).toContain('child-1');
      expect(childIds).toContain('child-2');
    });

    it('should return empty array when feature has no children', async () => {
      const feature = createTestFeature();
      await repository.create(feature);

      const children = await repository.findByParentId('feat-1');

      expect(children).toEqual([]);
    });

    it('should return empty array for a non-existent parent ID', async () => {
      const children = await repository.findByParentId('non-existent');

      expect(children).toEqual([]);
    });

    it('should return fully-hydrated Feature objects (not partial)', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child = createTestFeature({
        id: 'child-1',
        slug: 'child',
        parentId: 'parent-1',
        agentRunId: 'run-abc',
      });

      await repository.create(parent);
      await repository.create(child);

      const children = await repository.findByParentId('parent-1');

      expect(children).toHaveLength(1);
      const found = children[0];
      expect(found.id).toBe('child-1');
      expect(found.name).toBe('Test Feature');
      expect(found.parentId).toBe('parent-1');
      expect(found.agentRunId).toBe('run-abc');
      expect(found.createdAt).toBeInstanceOf(Date);
    });

    it('should only return DIRECT children (not grandchildren)', async () => {
      const grandparent = createTestFeature({ id: 'gp-1', slug: 'grandparent' });
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent', parentId: 'gp-1' });
      const child = createTestFeature({ id: 'child-1', slug: 'child', parentId: 'parent-1' });

      await repository.create(grandparent);
      await repository.create(parent);
      await repository.create(child);

      const gpChildren = await repository.findByParentId('gp-1');
      expect(gpChildren).toHaveLength(1);
      expect(gpChildren[0].id).toBe('parent-1');

      const parentChildren = await repository.findByParentId('parent-1');
      expect(parentChildren).toHaveLength(1);
      expect(parentChildren[0].id).toBe('child-1');
    });

    it('should return children ordered by created_at ascending', async () => {
      const parent = createTestFeature({ id: 'parent-1', slug: 'parent' });
      const child1 = createTestFeature({
        id: 'child-1',
        slug: 'child-1',
        parentId: 'parent-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      const child2 = createTestFeature({
        id: 'child-2',
        slug: 'child-2',
        parentId: 'parent-1',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });

      await repository.create(parent);
      await repository.create(child2); // Insert out of order
      await repository.create(child1);

      const children = await repository.findByParentId('parent-1');

      expect(children[0].id).toBe('child-1');
      expect(children[1].id).toBe('child-2');
    });
  });
});
