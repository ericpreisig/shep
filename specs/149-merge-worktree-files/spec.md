## Problem Statement
Git ignores local media, so merging resource JSON and deleting the feature worktree can lose required assets. Forge main references missing city and wolf sheets.

## Success Criteria
- Reuse the existing settings.worktree.copyPaths list in both directions; add no configuration.
- Transfer new and changed untracked files to the main checkout after a verified merge and before Maintain or cleanup.
- Keep tracked files under Git control, protect outside paths/symlinks, and detect conflicting edits rather than overwrite them.
- Capture initial content hashes in per-worktree Git metadata so unchanged stale copies do not overwrite concurrent main changes. Legacy worktrees may restore missing files; ambiguous differences preserve the worktree for resolution.
- A transfer failure must retain the branch/worktree and must not announce successful completion.
- Restore Forge main assets byte-for-byte from existing worktrees/Atelier provenance, then validate catalogue, compilation and headless Godot loading.
