# Project analysis and AutoTask verification

Validated in the isolated preview at http://127.0.0.1:4051, using `/home/eric/.shep-fork-preview` and `/tmp/shep-fork-forge-preview`. The real Forge repository and port-4050 installation were not used for these test writes.

- Real Codex source analysis read five files and discovered the implemented crafting capability missing from the catalog. Its evidence points to `src/crafting.js`.
- A second analysis added zero features. All ten catalog entries remained visible and the taxonomy was globally reorganized.
- A deferred AutoTask request for a local market produced exactly two sub-features: price catalog and transactions. It reused the existing inventory and discovered crafting feature as prerequisites.
- Both children remained Pending until the original feature was explicitly started. Start launched their normal workers; the original feature remained Blocked.
- After the first parent merged, the original still had a pending agent run and no start timestamp (`first-parent-complete.json`). After the second landed, it started automatically.
- Both sub-features and the final integration completed and merged in the disposable project (`autotask-complete.json`). The integration branch passed 25 native Node tests.
- The real workflow exposed missing synchronization for local repositories. New real-Git regression cases verify both squashed parents are included from local main with and without a remote, including unpushed merges. Manual starts, automatic unblocking and capacity admission use that base for joins.

Final combined validation with feature 144: 1,616 unit/integration files, 18,219 passing tests and 3 skips; 16 CLI/TUI E2E files, 91 passing tests. Production build, core/web types, changed-file lint, TypeSpec compilation, story coverage and spec validation passed. The web workflow above was tested through the real browser, not a Playwright web-suite run.
