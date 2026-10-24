/**
 * Sync Feature Branch Use Case
 *
 * Brings a feature branch in sync with its base branch without ever putting
 * work at risk:
 *
 *   commit work in progress → fetch the base branch from the remote →
 *   rebase the feature branch onto it → delegate conflicts to the agent
 *
 * Uncommitted work is COMMITTED, not stashed. `git stash push` ignores
 * untracked files, so a worktree holding only new files was left dirty and
 * the rebase aborted with "working directory has uncommitted changes"; and a
 * stash that fails to pop leaves work stranded outside the branch. A commit
 * always lands on the branch and is undone with `git reset --soft HEAD~1`.
 *
 * Shared by the manual "Rebase on Main" action and by starting a pending
 * feature, so both surfaces get identical semantics.
 */

import { injectable, inject } from 'tsyringe';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IConflictResolutionService } from '../../ports/output/services/conflict-resolution.interface.js';

/** Conventional-commit subject used for Shep's automatic checkpoint commits. */
export const AUTO_COMMIT_SUBJECT = 'chore: auto-commit work in progress before sync';

/** Name of the git remote every Shep repository tracks. */
const REMOTE_NAME = 'origin';

/**
 * Build the message for the automatic checkpoint commit.
 *
 * The branch names live in the body so the subject stays within the
 * conventional-commit length limit regardless of how long a branch name is.
 */
export function buildAutoCommitMessage(branch: string, baseBranch: string): string {
  return (
    `${AUTO_COMMIT_SUBJECT}\n\n` +
    `Shep committed the working tree of '${branch}' before rebasing it onto ` +
    `'${baseBranch}' so that no work is lost.\n` +
    `Undo with \`git reset --soft HEAD~1\`.`
  );
}

export interface SyncFeatureBranchInput {
  /** Absolute path to the repository root. */
  repositoryPath: string;
  /** Feature branch to bring in sync with the base branch. */
  branch: string;
  /**
   * Branch of the feature this one depends on, when it has a parent.
   *
   * A dependent feature must start from its parent's work. Where that work
   * lives depends on whether the parent landed: once merged, it is in the base
   * branch (and the parent branch is often deleted); until then, it exists only
   * on the parent branch. Passing this lets the use case pick the right target
   * instead of every caller re-deriving it.
   */
  parentBranch?: string;
  /** All prerequisites landed locally, including squash merges not yet pushed. */
  useLocalBase?: boolean;
}

export interface SyncFeatureBranchResult {
  /** Directory the git operations ran in — worktree path or repository root. */
  cwd: string;
  /** Repository's base branch. */
  baseBranch: string;
  /** Branch the feature branch was actually rebased onto — base or parent. */
  rebasedOnto: string;
  /** Whether work in progress was committed before the rebase. */
  committed: boolean;
  /** SHA of the automatic checkpoint commit, when one was created. */
  commitSha?: string;
  /** Whether the rebase conflicted and was resolved by the agent. */
  conflictsResolved: boolean;
}

@injectable()
export class SyncFeatureBranchUseCase {
  constructor(
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('IConflictResolutionService')
    private readonly conflictResolutionService: IConflictResolutionService
  ) {}

  async execute(input: SyncFeatureBranchInput): Promise<SyncFeatureBranchResult> {
    const cwd = await this.resolveCwd(input.repositoryPath, input.branch);
    const baseBranch = await this.gitPrService.getDefaultBranch(input.repositoryPath);

    // 1. Checkpoint any work in progress so the rebase cannot lose it and
    //    cannot be refused for a dirty working directory. Hooks are skipped:
    //    a repo's pre-commit linter or commitlint must not block Shep's own
    //    housekeeping commit.
    let committed = false;
    let commitSha: string | undefined;
    if (await this.gitPrService.hasUncommittedChanges(cwd)) {
      commitSha = await this.gitPrService.commitAll(
        cwd,
        buildAutoCommitMessage(input.branch, baseBranch),
        { noVerify: true }
      );
      committed = true;
    }

    // 2. Refresh the base branch from the remote so the rebase target is the
    //    latest upstream state, not a stale local ref.
    const hasRemote = await this.gitPrService.hasRemote(cwd);
    const useLocalBase = input.useLocalBase === true;
    if (hasRemote && !useLocalBase) await this.gitPrService.syncMain(cwd, baseBranch);

    // 3. Decide what to rebase onto — the base branch, or a parent branch whose
    //    work has not reached the base branch yet.
    const rebasedOnto = useLocalBase
      ? baseBranch
      : await this.resolveRebaseTarget(cwd, baseBranch, input.parentBranch);

    // 4. Rebase, delegating any conflicts to agent-powered resolution.
    let conflictsResolved = false;
    try {
      if (rebasedOnto === baseBranch) {
        if (useLocalBase || !hasRemote)
          await this.gitPrService.rebaseOnMain(cwd, input.branch, baseBranch, true);
        else await this.gitPrService.rebaseOnMain(cwd, input.branch, baseBranch);
      } else {
        await this.gitPrService.rebaseOnBranch(cwd, input.branch, rebasedOnto);
      }
    } catch (error) {
      if (error instanceof GitPrError && error.code === GitPrErrorCode.REBASE_CONFLICT) {
        await this.conflictResolutionService.resolve(cwd, input.branch, rebasedOnto);
        conflictsResolved = true;
      } else {
        throw error;
      }
    }

    return {
      cwd,
      baseBranch,
      rebasedOnto,
      committed,
      ...(commitSha ? { commitSha } : {}),
      conflictsResolved,
    };
  }

  /**
   * Pick the branch this feature should be rebased onto.
   *
   * With no parent — or a parent that already landed on the base branch — the
   * base branch carries everything the feature needs, so rebasing onto it is
   * both sufficient and durable (the parent branch may already be deleted).
   * A parent that has NOT landed still holds its work on its own branch, and
   * that branch is the only place the child can pick it up.
   *
   * Must run AFTER `syncMain`, so the ancestry check reads a freshly fetched
   * base ref rather than a stale local one.
   */
  private async resolveRebaseTarget(
    cwd: string,
    baseBranch: string,
    parentBranch?: string
  ): Promise<string> {
    if (!parentBranch || parentBranch === baseBranch) {
      return baseBranch;
    }

    // A parent branch that no longer exists was merged and cleaned up, so its
    // work reaches the child through the base branch. This has to be checked
    // separately: `verifyMerge` reports an unresolvable branch as NOT merged,
    // which would send the rebase at a branch that cannot even be fetched.
    if (!(await this.branchExists(cwd, parentBranch))) {
      return baseBranch;
    }

    // `syncMain` updates origin/<base> rather than the local ref when the base
    // branch is checked out elsewhere, so compare against the remote ref when
    // there is one.
    const baseRef = (await this.gitPrService.hasRemote(cwd))
      ? `${REMOTE_NAME}/${baseBranch}`
      : baseBranch;

    try {
      const landed = await this.gitPrService.verifyMerge(cwd, parentBranch, baseRef);
      return landed ? baseBranch : parentBranch;
    } catch {
      // Ancestry could not be established — prefer the base branch, which is
      // always fetchable, over a parent branch we know nothing about.
      return baseBranch;
    }
  }

  /** Does this branch resolve either locally or as a remote-tracking ref? */
  private async branchExists(cwd: string, branch: string): Promise<boolean> {
    for (const ref of [branch, `${REMOTE_NAME}/${branch}`]) {
      try {
        await this.gitPrService.revParse(cwd, ref);
        return true;
      } catch {
        // Try the next ref
      }
    }
    return false;
  }

  /**
   * Resolve the correct working directory for the branch.
   * Uses the worktree path if a worktree exists, otherwise the repository root.
   */
  private async resolveCwd(repositoryPath: string, branch: string): Promise<string> {
    const hasWorktree = await this.worktreeService.exists(repositoryPath, branch);
    if (hasWorktree) {
      return this.worktreeService.getWorktreePath(repositoryPath, branch);
    }
    return repositoryPath;
  }
}
