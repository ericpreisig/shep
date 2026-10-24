## Clean Architecture

TypeSpec adds Settings.agentProviders using existing AgentConfig. A domain resolver owns provider selection. Settings use cases persist profiles and preserve the legacy default. Infrastructure workers, catalogs and interactive sessions reuse that resolver; the existing settings section hosts provider rows.

## Validation

RED-GREEN-REFACTOR: test independent credentials, default switching, masked browser data, persistence, executor cache refresh, worker overrides and settings form behavior. Run regressions, type checks, lint, production build and real browser checks.