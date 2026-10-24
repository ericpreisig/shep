## Problem Statement
Codex runs DeepSeek through the existing deepseek profile, but Shep only lists the default Codex model catalog and passes --model. The profile and its OpenRouter provider are never selected.

## Success Criteria
- Offer valid *.config.toml profiles from CODEX_HOME or ~/.codex alongside existing Codex models.
- Selecting deepseek passes --profile deepseek and never sends a profile identifier as --model.
- Support initial, streaming, interactive and resumed execution through the existing executor.
- Keep native model discovery, fallback, caching and GPT execution behavior.
- Do not read, return or copy credentials or parse TOML; Codex resolves its own profile.
- Verify regression tests and the real fork picker plus a real DeepSeek run through Shep's executor.

## Scope
Reuse existing model listing identifiers and the current UI. No new domain model, database, TypeSpec, provider credential, global default or web component is needed. The existing picker displays its catalog label for the selected profile.

## Profile Routing
A native profile is an atomic model/provider selection. Adaptive per-tier model overrides do not replace it with a raw model that loses the native provider.
