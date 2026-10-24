# Verification — 2026-10-24

Checkout: `feat/142-project-orchestration`, fork `ericpreisig/shep`.
Runtime: Node 24.21.0, pnpm 10.33.0, real authenticated Codex CLI with the configured `gpt-6.1-sol` model.

## Automated checks

| Check | Result |
| --- | --- |
| Unit and integration tests | 1,612 files passed; 18,188 tests passed, 3 existing skips |
| CLI/TUI end-to-end tests against the compiled distribution | 16 files, 91 tests passed |
| `pnpm build:release` | Passed (CLI and production web build) |
| Core and web TypeScript checks | Passed |
| TypeSpec compilation and generated models | Passed |
| ESLint on changed TypeScript files, zero warnings | Passed |
| Prettier on changed source/specification files | Passed |
| Story coverage check | Passed; both new public components have colocated stories |
| Specification validation | Passed |
| `git diff --check` | Passed |

The existing Playwright web suite was not run. Browser checks below used the real production build and real Codex, through the browser automation surface. Build output retains upstream Next.js middleware/tracing warnings.

The full regression run covers all-prerequisite scheduling, dependency saves after start, diamond DAGs and cycles, late initialization, retention of hidden archived parents on the canvas, deletion of individual dependency edges, native chat thread recovery and cancellation, correction acknowledgement/retry, exhaustive topic normalization and classification leases.

## Live browser and runtime checks

All mutation checks used `SHEP_HOME=~/.shep-fork-preview`, port 4051, and the disposable Git repository `/tmp/shep-fork-forge-preview`. The existing Forge installation, its database and its running workers were left in place.

1. **Authenticated health probe:** the compiled probe reached `/api/health`, HTTP 200, `healthy: true`, with container/database checks passing. The token was read internally and never included in the report.
2. **Codex conversation:** sent a first browser message asking Codex to remember `FORGE-CHAT-42`; it answered `ACK`. A second turn recovered the exact code through native thread resumption. A separate direct adapter smoke test also passed two turns.
3. **Completed-task adjustment:** sent a third browser message from the completed task's conversation. Codex wrote `weapon-chat-note.txt` containing exactly `FORGE-CHAT-42\n` in the isolated task worktree, without committing or publishing it. File contents were checked on disk.
4. **Editable prerequisites:** opened a Pending task with two parents, selected a third, and saved from Overview. The UI confirmed the save and the stored prerequisite array retained all three IDs. The selection included completed and archived tasks.
5. **Running correction:** a real Codex worker wrote `weapon-balance.txt` with `damage=5` and started a 120-second wait. Submitted a correction from Overview to use `damage=12` and cancel the wait. The original worker exited, its run became interrupted, and a new worker resumed the same worktree and graph thread. The pending correction was acknowledged once, the file changed to `damage=12\n`, and the resumed run completed successfully. No push or PR occurred.
6. **Mind map:** the initial eight-task catalog produced nested themes including Personnage / Équipement / Armes. Collapsing Équipement hid its three descendant tasks; search revealed an Armes task inside the collapsed branch. Adding the ninth task triggered automatic global reclassification from 12 themes to 6. Expanded view showed 9 of 9 non-deleted tasks, including archived work; persisted membership contained nine distinct task IDs. Thematic edges were visible and contained no task execution dependencies. Task and chat navigation worked.
7. **Final wiring:** the compiled production container resolved `CreateFeatureUseCase`, `CorrectFeatureUseCase` and `GetProjectMindMapUseCase` without cycles.

## Captures

- [Mind map](evidence/mind-map-web.png)
- [Saved prerequisites](evidence/parents-web.png)
- [Codex multi-turn chat](evidence/codex-chat-web.png)
- [Applied running correction](evidence/correction-web.png)

Usage and implementation boundaries are documented in [Project orchestration](../../docs/guides/project-orchestration.md).
