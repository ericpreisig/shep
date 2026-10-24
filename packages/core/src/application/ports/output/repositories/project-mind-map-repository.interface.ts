import type { ProjectMindMap } from '../../../../domain/generated/output.js';

export interface ProjectMindMapRecord {
  map: ProjectMindMap | null;
  requestedFingerprint: string | null;
  generating: boolean;
  attemptedAt: number;
  error?: string;
}

export interface IProjectMindMapRepository {
  get(repositoryId: string): Promise<ProjectMindMapRecord | null>;
  /** Cross-process lease; an abandoned generation becomes claimable again. */
  claim(repositoryId: string, fingerprint: string, now: number): Promise<boolean>;
  save(map: ProjectMindMap): Promise<void>;
  fail(repositoryId: string, fingerprint: string, error: string): Promise<void>;
}
