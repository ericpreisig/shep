## TDD
Each phase starts with behavior regressions (RED), adds the minimal implementation (GREEN), and reuses existing helpers (REFACTOR). Validate the real native CLI in a disposable repository before publishing.

## Clean Architecture
The domain catalog and TypeSpec enum describe the provider. Infrastructure implements the existing application ports; presentation reuses catalog-driven pickers and icons. No provider SDK or agent dispatch is introduced in application use cases.
