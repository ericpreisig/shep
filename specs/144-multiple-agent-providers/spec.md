## Problem Statement

Only one authentication configuration is retained, and task overrides receive the default provider credential. Multiple providers must coexist.

## Success Criteria

- Keep independent configurations for all supported providers and preserve the existing default.
- Select Codex CLI or OpenRouter per feature using the existing picker.
- Every worker, metadata call, chat boot and model catalog gets only its selected provider configuration.
- Switching the default preserves other providers. Changing a token refreshes the cached executor.
- Browser payloads never include stored provider tokens.
- Validate persistence, isolation and real web configuration, then commit and push.