import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteRepositoryRepository } from '@/infrastructure/repositories/sqlite-repository.repository.js';
import { SQLiteProjectMindMapRepository } from '@/infrastructure/repositories/sqlite-project-mind-map.repository.js';

describe('Project mind map persistence', () => {
  let db: Database.Database;
  let maps: SQLiteProjectMindMapRepository;
  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    await new SQLiteRepositoryRepository(db).create({
      id: 'repo',
      name: 'Forge',
      path: '/forge',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    maps = new SQLiteProjectMindMapRepository(db);
  });
  afterEach(() => db.close());

  it('allows only one classifier and ignores late output from an expired lease', async () => {
    expect(await maps.claim('repo', 'old', 1000)).toBe(true);
    expect(await maps.claim('repo', 'new', 2000)).toBe(false);
    expect(await maps.claim('repo', 'new', 302000)).toBe(true);
    await maps.save({
      repositoryId: 'repo',
      fingerprint: 'old',
      generatedAt: new Date(),
      topics: [],
    });
    expect((await maps.get('repo'))?.generating).toBe(true);
    expect((await maps.get('repo'))?.map).toBeNull();
    await maps.save({
      repositoryId: 'repo',
      fingerprint: 'new',
      generatedAt: new Date(),
      topics: [{ id: 'weapons', label: 'Armes', featureIds: ['task'] }],
    });
    expect((await maps.get('repo'))?.generating).toBe(false);
    expect((await maps.get('repo'))?.map?.topics[0].label).toBe('Armes');
  });

  it('retains the last good taxonomy when reclassification fails', async () => {
    await maps.claim('repo', 'first', 1000);
    await maps.save({
      repositoryId: 'repo',
      fingerprint: 'first',
      generatedAt: new Date(),
      topics: [{ id: 'world', label: 'Monde', featureIds: ['task'] }],
    });
    await maps.claim('repo', 'second', 2000);
    await maps.fail('repo', 'second', 'Model unavailable');
    const saved = await new SQLiteProjectMindMapRepository(db).get('repo');
    expect(saved?.map?.topics[0].label).toBe('Monde');
    expect(saved?.generating).toBe(false);
    expect(saved?.error).toBe('Model unavailable');
  });
});
