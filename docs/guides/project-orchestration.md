# Project orchestration in this fork

This fork adds Codex CLI chat, multiple task prerequisites, corrections during execution, and a project mind map. The daemon readiness probe also supplies the existing local authentication token.

## Run the fork locally

Use Node 24 LTS and pnpm 10 for this checkout. The locked native SQLite dependency builds with Node 24; Node 26 is not supported by this lockfile.

```bash
cd ~/Projects/shep
pnpm install --frozen-lockfile
pnpm build:release
SHEP_HOME="$HOME/.shep-fork" node dist/src/presentation/cli/index.js ui --port 4051 --no-open
```

`SHEP_HOME` chooses the database, settings and worktree storage. A separate home is useful for trying the fork alongside another installation. Configure **Settings → Agent** to use **Codex CLI** and authenticate the existing `codex` executable normally. Chat and classification use the configured agent and model.

## Prerequisites

Select multiple **Parent tasks** in the creation drawer. In the task's **Overview**, **Prerequisite tasks** remains editable while the task is Pending or Blocked and its worker has never started. Save the selection to replace its complete prerequisite list.

All selected parents must have completed and landed their work before the child starts. Archiving a completed parent preserves that completion. Cycles and dependencies across repositories are refused, including an atomic cycle check when saving. The execution canvas draws each prerequisite separately; removing one edge preserves the other prerequisites.

Every execution phase receives context from all current parents: names, descriptions, branches, available specification artifacts and bounded conversation excerpts. Durable user corrections accompany later phases too. The legacy `parentId` field represents the first parent for compatibility; `parentIds` is authoritative when present, including an empty array.

## Redirect work

Use **Overview → Correct this task** to supply a correction during execution. Shep stops the current worker, records the instruction and resumes the same worktree and graph thread. A dedicated correction pass runs before checkpoint replay, so completed implementation steps cannot silently swallow the instruction. Existing valid work is preserved. At an approval gate, the same control uses the existing rejection/feedback flow.

Sending a message in a task chat takes over its worktree after stopping its background execution. Resume the task from its existing controls to return to the automated workflow; this closes the chat writer first. Completed or archived tasks can be adjusted from their chat. If the old worktree was cleaned, Shep recreates an isolated checkout on its task branch. Chat adjustments remain on that branch for review; use the normal Git/PR workflow to publish them.

Codex chat uses `codex exec --json` and native thread resumption. Responses and tool activity stream to the existing chat interface. Stopping waits for the CLI process to exit before another writer starts. Native Codex chat does not implement Claude's SDK-specific `AskUserQuestion` tool; ordinary conversation and file changes use Codex's CLI tools.

## Mind map

Choose **Analyze project** to read the repository's code and documentation, discover implemented capabilities and add them to the catalog with source-file evidence. This does not launch implementation tasks. Repeated analysis reuses known capabilities and keeps existing tasks and conversations. The footer records analyzed file coverage and newly added features. Source excerpts have a shared size budget; the full readable-file inventory is also supplied to the model.

Open **Mind map** in the sidebar and select a project. It includes all non-deleted tasks, including completed and archived work, with links to each task and its chat.

The AI receives the entire task catalog and may replace the whole nested taxonomy when new work changes its meaning. Classification runs in the background when task descriptions or membership change; **Reorganize with AI** forces a refresh. Execution dependencies are never used as edges in this view. New or omitted tasks remain visible under **À classer** until assigned to a theme.

Expand/collapse themes individually or together. Search reveals matching tasks inside collapsed branches. Collapse preferences are stored per project in the browser. Classification is persisted in SQLite, uses one recoverable lease per project, and preserves the previous map on failure. While the view is open it checks for updates every five seconds; opening it later catches up with changes made while it was closed.

## AutoTask

Enable **AutoTask** when creating a feature. The configured AI reads source excerpts and the complete task catalog, including active, pending, completed and archived features. It reuses existing prerequisites, creates sub-features only when needed, and keeps the original request as the final integration task. User-selected prerequisites are preserved. Every new dependency is checked for cycles and repository boundaries before records are created.

The task's **Overview → AutoTask** shows planning progress, errors and links to its sub-features. A child links back to its originating task; this grouping is separate from prerequisite edges. Generated tasks inherit the original execution agent, model, effort, approval gates and workflow options. The final task waits for all prerequisites through the existing dependency and capacity gates, and receives their context through the normal feature worker.

**Pending** still defers execution: AutoTask prepares and initializes its plan, but starts no task. Starting the original task later starts eligible children and blocks dependent tasks until their prerequisites land. Plans are saved before materialization with stable child IDs and a recoverable planning lease; **Retry preparation** resumes the draft after an error without duplicating children. A start is refused until planning has finished. In the CLI, use `shep feat new "…" --auto-task`, optionally with `--pending`.
