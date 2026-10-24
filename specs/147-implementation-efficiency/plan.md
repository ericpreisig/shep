## Clean Architecture
Define optional domain contracts in TypeSpec; keep filesystem and Git operations in infrastructure and reuse the existing settings repository.

## RED-GREEN-REFACTOR
## TDD
Each phase first adds failing behavioral tests, implements the smallest change, then refactors shared rules. Cover real Git worktree preparation, settings persistence, bounded/redacted summaries, resume and final validation ordering. Run targeted regressions, typecheck and scoped lint. Validate a real fresh .NET worktree and build the fork.

## Integration
Use optional TypeSpec fields and an additive SQLite migration. Copy explicit untracked paths with exclusive native copies before the existing post-create command. Save successful executor output before phase completion. Completed phase IDs filter handoffs. Only the last sequential batch, or one call after all parallel final tasks, performs full validation.

## Deployment
Stay on main per user preference. Configure the fork assets allowlist and conditional .NET build hook. Restart only the daemon, retaining detached active workers. Existing in-memory workers receive changes on their next launch/resume.
