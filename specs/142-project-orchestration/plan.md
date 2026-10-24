## Status
Phase: Implementation

## Architecture Overview
Web actions -> application use cases -> domain contracts and repository ports <- SQLite and agent infrastructure.

## Implementation Strategy
Keep current single-parent compatibility while centralizing the full parent list. Resolve interactive Codex through the existing factory. Use current lifecycle stop/resume primitives and durable correction prompts. The mind map is a separate, persistent semantic projection using existing graph components.

## Testing Strategy
RED-GREEN-REFACTOR for each executable phase. Unit coverage targets domain validation and executor lifecycle; integration tests verify SQL round trips and migration backfill. UI tests cover editing guards, corrections and collapsed topic visibility. Exercise actual Codex multi-turn chat in isolated data.

## Risk Mitigation
Migration is additive and preserves old parent references. Use separate SHEP_HOME and port for all validation; keep running Forge workers unchanged. Retain the last valid map when AI returns invalid output. Recover stale in-flight generation after server restart.

## Clean Architecture
Domain contracts remain TypeSpec-generated. Application use cases depend on existing output ports; SQLite, native CLI execution and the web UI implement those boundaries. AI classification resolves IAgentExecutorProvider at call time.
