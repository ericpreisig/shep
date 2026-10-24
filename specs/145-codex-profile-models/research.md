## Evidence
The installed Codex 0.163.0 supports --profile on exec; the existing deepseek profile completed shell and apply_patch tests through OpenRouter. Shep already reuses one Codex executor for regular and interactive turns.

## Security
Read filenames only. Validate native profile names and use structured subprocess arguments. Never read or return credential contents.

## Performance
Reuse the current TTL for CLI catalog calls; read the small local profile directory for fresh profile choices.
