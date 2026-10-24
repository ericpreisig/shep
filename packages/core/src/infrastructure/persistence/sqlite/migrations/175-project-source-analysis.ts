import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'features', 'discovery', 'TEXT');
  addColumn(db, 'project_mind_maps', 'analysis', 'TEXT');
}
export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive provenance is retained for compatibility with earlier releases.
}
