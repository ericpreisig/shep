# Multiple provider verification

- Independent provider configurations persist in the existing SQLite settings database; legacy `agent` remains the default.
- Unit/integration tests cover credential isolation, default changes and restoration, token rotation/cache invalidation, browser masking and provider persistence.
- Real browser: added OpenRouter while Codex CLI stayed selected; saved a fictitious key, confirmed that the field reset and the default retained no token, then selected OpenRouter and returned to Codex CLI. Both configurations survived.
- A real authenticated GET of `/settings` returned HTTP 200 and contained no fictitious key in its HTML (`browser-masking.json`).
- The creation form also selected OpenRouter in Pending mode while the stored global default stayed Codex CLI (`per-task-provider.json` and `.png`). The form was not submitted.
- Removed the fictitious key after the check. The preview finishes on Codex CLI with session auth, with OpenRouter saved but requiring the user’s real API key (`providers-restored.json`). No authenticated OpenRouter inference was claimed or required to test settings persistence.
- Verified the final browser auth control returns to Session when switching back to Codex; stored provider tokens never cross into another provider.

Validation: full unit/integration run passed 18,219 tests in 1,616 files (3 skips). CLI/TUI E2E passed 91 tests in 16 files. After the final auth-control adjustment, 18 focused web tests passed. Production build, core and web TypeScript checks, changed-file lint/format, TypeSpec, story coverage (392/453, with 61 existing exceptions) and specification validation passed. No web Playwright suite was run; browser checks used the actual application.
