## Existing behavior

The executor factory and per-feature picker already support Codex CLI and OpenRouter. Auth storage is singular, worker overrides receive settings.agent, and executor caching ignores credential changes. Extend these seams rather than build another execution path.