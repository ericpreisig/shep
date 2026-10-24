import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'features', 'parent_ids', 'TEXT');
  addColumn(db, 'features', 'execution_corrections', 'TEXT');
  addColumn(db, 'features', 'execution_corrections_applied', 'INTEGER');
  db.exec(
    'UPDATE features SET parent_ids = json_array(parent_id) WHERE parent_ids IS NULL AND parent_id IS NOT NULL'
  );
  db.exec(`CREATE TABLE IF NOT EXISTS project_mind_maps (
    repository_id TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
    data TEXT,
    requested_fingerprint TEXT,
    generating INTEGER NOT NULL DEFAULT 0,
    requested_at INTEGER NOT NULL DEFAULT 0,
    error TEXT
  )`);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive columns retain history and are harmless to earlier releases.
}
