## Technical Decisions
Use native fs and SHA-256 with existing Git discovery/path guards. Missing files are added; changes replace only an unchanged original target. Native Git remains responsible for tracked files. Per-worktree metadata is internal state, not another config file. Keep compatibility with old worktrees and preserve them on ambiguous conflicts. Do not remove ignored files on main.

## Validation Evidence
Real-Git tests cover ignored additions, edits, inherited main changes, concurrent conflicts, tracked files, legacy worktrees, custom/adopted worktree files, disabled copying and symlink protection. Merge orchestration returns files after local or PR merge verification and before Maintain/cleanup; failure retains the source. The isolated checkout passes TypeScript, scoped ESLint and CLI/web builds.

## Forge Main Recovery
Restored the exact Atelier gate PNG from a surviving worktree (SHA-256 12f9748efd38b3a50c23c09ea2806fa812da8a2549f9d139f240e521db3747e8), and the two wolf PNGs and three original ZIP exports from Atelier local blobs, verified against existing provenance. All resources now resolve existing asset files. Live /api/assets and /api/maps return HTTP 200. dotnet build succeeds with zero warnings/errors; Godot 4.7.2 imports the three sheets and loads map_0 with 3556 elements in a headless smoke test. Binary media remains ignored/local as prescribed by Forge.

## Existing Worktrees
Reconstructed six internal baselines from matching main files, committed Atelier provenance hashes and sidecars whose only difference was a Godot UID. No project file, source image or user setting was changed by this reconstruction. Existing active workers all have allowMerge=false, so their approval/resume loads the new merge logic.
