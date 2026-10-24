# Project orchestration data model

TypeSpec is the source of truth; `pnpm generate` produces the TypeScript models.

| Model | Fields | Meaning |
| --- | --- | --- |
| Feature | `parentIds?: UUID[]` | Complete prerequisite set; empty means no prerequisites. Legacy `parentId` mirrors its first member. |
| Feature | `executionCorrections?: string[]` | Append-only user steering, retained across worker restarts. |
| Feature | `executionCorrectionsApplied?: integer` | Count acknowledged by the dedicated correction pass. Failed instructions remain pending. |
| MindMapTopic | `id`, `label`, optional `parentId`, `featureIds` | Semantic hierarchy, independent of execution dependencies. |
| ProjectMindMap | `repositoryId`, `fingerprint`, `topics`, `generatedAt` | Persisted classification of the whole task catalog. |

Migration `174-project-orchestration` adds nullable JSON columns to `features`, backfills legacy parents, and creates `project_mind_maps`. The map table stores the last valid document plus a fingerprint, generation lease timestamp and error. Expired leases can be retried after five minutes. Late results cannot overwrite a newer fingerprint.

Dependency saves and worker-slot claims validate prerequisites in their SQL write. Normalization enforces one semantic membership per real task, removes invalid references, breaks topic cycles and preserves exhaustive coverage through the fallback topic.
