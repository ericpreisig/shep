import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'agent_providers', 'TEXT');
}
export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Preserve additional provider configurations for earlier-release compatibility.
}
