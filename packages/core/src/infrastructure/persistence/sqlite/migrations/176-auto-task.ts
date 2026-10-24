import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'features', 'auto_task', 'TEXT');
  addColumn(db, 'features', 'auto_task_lease', 'TEXT');
  addColumn(db, 'features', 'auto_task_lease_at', 'INTEGER');
}
export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Retain additive planning metadata for compatibility with earlier releases.
}
