## Clean Architecture
Keep filename discovery and subprocess routing in infrastructure. Agent resolution, model selection, domain entities and TypeSpec contracts remain unchanged. The existing string model identifier carries an explicit profile selection.

## TDD
RED: add discovery, fallback, cache freshness, native model and profile execution regression tests. GREEN: add a filename-only helper, merge profiles after cached catalog discovery, route the profile at the shared argument builder. REFACTOR: retain one routing function for execute and executeStream.

## Test Coverage
Cover missing directories, filename validation, normal models, unavailable default catalogs, new and removed profiles, initial and resumed execution and interactive reuse. Run affected tests, typecheck, scoped lint and the CLI build. Verify the actual fork UI and perform one real read/edit run through the executor.

## Rollback
Revert the two adapter integrations and helper. Existing stored native model selections remain valid; profile choices must be reselected as native models if the feature is removed.

## Integration Details
Preserve the existing domain-catalog fallback if default CLI discovery fails. Keep profile selections atomic during adaptive task routing. Reuse the selected catalog listing for the existing picker trigger label.
