## Decisions
Reuse IFileTreeReaderPort, the configured IAgentExecutorProvider and the existing map generation lease. Import evidenced capabilities as completed catalog features without agent runs or worktrees. Keep provenance and stable discovery keys for reanalysis. AutoTask stores a validated durable plan before materializing tasks via existing creation and scheduling use cases. Existing running tasks are never reparented.

## Coverage
Include the full source-file inventory and bounded source excerpts, and expose analyzed coverage. No instructions embedded in repository contents override the analysis task.