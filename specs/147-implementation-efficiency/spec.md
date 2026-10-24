## Problem Statement
Fresh worktrees lack ignored local assets and compiled artifacts. Implementation sessions repeat discovery and full validation, including once per final-phase batch.

## Success Criteria
- Explicit relative copy paths hydrate untracked local files before the existing preparation hook.
- Never overwrite tracked or existing worktree files or follow symlinks outside the roots.
- Preparation errors block agent launch; build before using --no-build.
- Intermediate phases and batches verify affected behavior; full required validation runs once after the final changes, including parallel tasks.
- Persist bounded, redacted agent-reported phase handoffs in feature.yaml and reuse them after resume.
- Keep settings-driven executor/model selection and current retry policy.

## Scope
Extend WorktreeConfig, its existing settings surfaces and native hook. Reuse agent results for summaries without a new summarization call. Do not alter active workers, repository files or the unrequested retry policy.
