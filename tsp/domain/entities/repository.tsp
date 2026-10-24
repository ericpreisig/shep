/**
 * @module Shep.Domain.Entities.Repository
 *
 * Defines the Repository entity - a first-class domain entity representing
 * a code repository tracked by the Shep platform.
 *
 * Repositories are the organizational unit for Features. Each Feature belongs
 * to exactly one Repository via a repositoryId foreign key.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

/**
 * Repository Entity
 *
 * Represents a code repository tracked by the Shep platform.
 * Features reference repositories by ID, enabling persistence
 * and independent lifecycle management.
 */
@doc("A code repository tracked by the Shep platform")
model Repository extends SoftDeletableEntity {
  @doc("Human-readable name for the repository (typically the directory name)")
  name: string;

  @doc("Absolute file system path to the repository root (unique)")
  path: string;

  @doc("Remote GitHub URL this repository was cloned from (normalized: lowercase, no .git suffix)")
  remoteUrl?: string;

  @doc("Whether this repository was auto-forked by shep because the user lacked push access")
  isFork?: boolean;

  @doc("Original upstream URL when isFork is true (normalized: lowercase, no .git suffix)")
  upstreamUrl?: string;

  @doc("Whether project-bedrock memory integration is enabled for this repository (defaults to false in persistence)")
  bedrockEnabled?: boolean;
}

@doc("A semantic project topic; its hierarchy is independent of task dependencies")
model MindMapTopic {
  id: string;
  label: string;
  parentId?: string;
  featureIds: UUID[];
}

@doc("An exhaustive, AI-organized thematic projection of one repository")
model ProjectMindMap {
  repositoryId: UUID;
  fingerprint: string;
  topics: MindMapTopic[];
  generatedAt: utcDateTime;
}

@doc("Coverage and outcome of the last successful source-code analysis")
model ProjectAnalysisSummary {
  analyzedAt: utcDateTime;
  filesRead: integer;
  filesExcerpted: integer;
  featuresAdded: integer;
}
