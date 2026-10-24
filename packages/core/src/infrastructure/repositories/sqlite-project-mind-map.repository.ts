import type Database from 'better-sqlite3';
import type { ProjectMindMap, ProjectAnalysisSummary } from '../../domain/generated/output.js';
import type {
  IProjectMindMapRepository,
  ProjectMindMapRecord,
} from '../../application/ports/output/repositories/project-mind-map-repository.interface.js';

export class SQLiteProjectMindMapRepository implements IProjectMindMapRepository {
  constructor(private readonly db: Database.Database) {}
  async get(repositoryId: string): Promise<ProjectMindMapRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM project_mind_maps WHERE repository_id = ?')
      .get(repositoryId) as
      | {
          data: string | null;
          requested_fingerprint: string | null;
          generating: number;
          requested_at: number;
          error: string | null;
          analysis: string | null;
        }
      | undefined;
    return row
      ? {
          map: row.data ? (JSON.parse(row.data) as ProjectMindMap) : null,
          requestedFingerprint: row.requested_fingerprint,
          generating: row.generating === 1,
          attemptedAt: row.requested_at,
          ...(row.error ? { error: row.error } : {}),
          ...(row.analysis ? { analysis: JSON.parse(row.analysis) as ProjectAnalysisSummary } : {}),
        }
      : null;
  }
  async claim(repositoryId: string, fingerprint: string, now: number): Promise<boolean> {
    return (
      this.db
        .prepare(
          `INSERT INTO project_mind_maps
      (repository_id, requested_fingerprint, generating, requested_at) VALUES (@id, @fingerprint, 1, @now)
      ON CONFLICT(repository_id) DO UPDATE SET requested_fingerprint = @fingerprint,
        generating = 1, requested_at = @now, error = NULL
      WHERE project_mind_maps.generating = 0 OR project_mind_maps.requested_at < @expired`
        )
        .run({ id: repositoryId, fingerprint, now, expired: now - 5 * 60 * 1000 }).changes === 1
    );
  }
  async save(map: ProjectMindMap): Promise<void> {
    this.db
      .prepare(
        `UPDATE project_mind_maps SET data = ?, generating = 0, error = NULL
      WHERE repository_id = ? AND requested_fingerprint = ?`
      )
      .run(JSON.stringify(map), map.repositoryId, map.fingerprint);
  }
  async fail(repositoryId: string, fingerprint: string, error: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE project_mind_maps SET generating = 0, error = ?
      WHERE repository_id = ? AND requested_fingerprint = ?`
      )
      .run(error, repositoryId, fingerprint);
  }
  async finishAnalysis(
    repositoryId: string,
    token: string,
    analysis: ProjectAnalysisSummary
  ): Promise<boolean> {
    return (
      this.db
        .prepare(
          `UPDATE project_mind_maps SET analysis = ?, generating = 0, error = NULL
      WHERE repository_id = ? AND requested_fingerprint = ? AND generating = 1`
        )
        .run(JSON.stringify(analysis), repositoryId, token).changes === 1
    );
  }
}
