## Technical Decisions
Native Git selects ignored and nonignored untracked paths; tracked destination paths and existing files are preserved. Node exclusive file copies avoid overwrites. Per-phase handoffs are bounded and redacted using existing logging redaction. Final validation uses the same selected executor and model. No new retry policy or provider logic is introduced.

## Validation Evidence
402 affected tests passed under the daemon Node 24 runtime; the final integration/adaptive rerun passed 13 tests including the new validation-failure checkpoint case (403 unique affected tests). TypeScript, scoped ESLint, TypeSpec and CLI/web builds passed. A real fresh Git worktree copied ignored media, built a .NET 10 project through the configured hook and ran successfully with --no-build. Fork settings were reloaded in the French UI. The daemon was restarted on port 4050; all three preexisting worker PIDs remained running.

## Activation
The fork stores copyPaths: [assets] and a conditional root-csproj dotnet build hook. Newly launched/resumed workers load the new implementation prompts; already running workers retain their loaded code. No new retry policy was introduced.
