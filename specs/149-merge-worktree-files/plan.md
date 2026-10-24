## Clean Architecture
Expose a merge-files operation through the existing worktree service; implement filesystem operations in infrastructure. Wire it before Maintain in both merge paths and before destructive cleanup. No new domain config or settings migration is needed.

## RED-GREEN-REFACTOR
Write failing real-Git integration tests for ignored files, updates, stale source preservation, conflicts, legacy worktrees, tracked files and symlink escapes. Add merge/cleanup ordering and failure regressions. Extend existing helpers and minimize shared logic. Validate targeted tests, typecheck, lint and build. Verify restored Forge hashes, the live asset API and a headless Godot startup.
