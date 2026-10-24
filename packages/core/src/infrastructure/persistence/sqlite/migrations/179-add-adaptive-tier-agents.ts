import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  for (const tier of ['high', 'medium', 'low'])
    addColumn(db, 'settings', `model_adaptive_${tier}_agent_type`, 'TEXT');
}
export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Preserve optional provider selections for compatibility with earlier versions.
}
