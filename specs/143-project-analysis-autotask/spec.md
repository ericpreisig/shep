## Problem Statement
Grouping tasks alone misses capabilities already implemented in the source code. New requests also need automatic decomposition and dependencies across the entire catalog.

## Success Criteria
- Analyze code and docs from the mind map to import evidenced implemented features.
- Preserve existing tasks and chats and avoid duplicates on reanalysis.
- Optional AutoTask creates only needed subtasks and selects prerequisites among all existing tasks.
- Validate every dependency and reject cycles or cross-project references.
- Deferred tasks and their subtasks remain deferred until started.
- Persist plans and recover retries without duplicate subtasks.
- Commit and push coherent verified milestones.