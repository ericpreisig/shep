/**
 * Start Feature Use Case
 *
 * Transitions a Pending feature to its active lifecycle and spawns
 * the agent. Validates lifecycle state, checks the parent dependency
 * gate and the parallel-capacity gate, and reuses the existing AgentRun record.
 *
 * Both gates must be open, and they are evaluated in that order: a feature
 * whose parent has not landed is Blocked and is NOT queued, because queuing it
 * would park a feature that cannot start anyway ahead of one that could.
 *
 * Before the agent is spawned the branch is brought in sync: everything
 * already in the worktree is committed and the branch is rebased onto the
 * latest base branch, so the agent starts from up-to-date code and no
 * pre-existing work is lost. That, and the spawn itself, belong to
 * SpawnFeatureAgentUseCase — the single path from a persisted feature to a
 * running agent.
 */

import { injectable, inject } from 'tsyringe';
import type { Feature, AgentRun } from '../../../domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import { satisfiesDependencyGate } from '../../../domain/lifecycle-gates.js';
import { featureParentIds } from '../../../domain/shared/feature-dependencies.js';
import { markQueuedForCapacity } from '../../../domain/shared/parallel-feature-limit.js';
import { SpawnFeatureAgentUseCase } from './spawn-feature-agent.use-case.js';
import { FeatureCapacityService } from './capacity/feature-capacity.service.js';
import { ExpandAutoTaskUseCase } from './expand-auto-task.use-case.js';

export interface StartFeatureResult {
  feature: Feature;
  agentRun: AgentRun;
  /** True when the dependency gate held the feature back instead of starting it. */
  blocked: boolean;
  /** The parent that holds this feature back, present only when `blocked`. */
  blockedBy?: {
    id: string;
    name: string;
    lifecycle: SdlcLifecycle;
  };
  /** True when the parallel-feature limit held the feature back instead of starting it. */
  queued: boolean;
  /** 1-based place in the queue, present only when `queued`. */
  queuePosition?: number;
}

export interface StartFeatureOptions {
  /**
   * Start the feature even when the parallel-feature limit is reached.
   *
   * This is the user's "start anyway" escape hatch, and it is the only way past
   * the capacity gate. It does NOT bypass the dependency gate: capacity is a
   * resource preference the user may knowingly overspend, whereas starting a
   * feature whose parent has not landed would rebase it onto work that is still
   * being rewritten.
   */
  bypassCapacityLimit?: boolean;
}

@injectable()
export class StartFeatureUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject(SpawnFeatureAgentUseCase)
    private readonly spawnFeatureAgent: SpawnFeatureAgentUseCase,
    @inject(FeatureCapacityService)
    private readonly capacity: FeatureCapacityService,
    @inject(ExpandAutoTaskUseCase, { isOptional: true })
    private readonly autoTask?: ExpandAutoTaskUseCase
  ) {}

  async execute(featureId: string, options?: StartFeatureOptions): Promise<StartFeatureResult> {
    // Resolve feature by exact ID or prefix
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Validate lifecycle is Pending
    if (feature.lifecycle !== SdlcLifecycle.Pending) {
      throw new Error(
        `Feature "${feature.name}" is not in Pending state (current: ${feature.lifecycle}). Only pending features can be started.`
      );
    }

    // Validate agentRunId exists
    if (!feature.agentRunId) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    const agentRun = await this.runRepo.findById(feature.agentRunId);
    if (!agentRun) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    // Wait for specPath — the web UI creates features in two phases: a fast
    // DB record (specPath: '') followed by background initialization that
    // populates specPath. If the user clicks "Start" before Phase 2 finishes,
    // specPath will still be empty. Poll the DB briefly to let it complete.
    let resolved = feature;
    if (!resolved.specPath) {
      const MAX_POLLS = 20;
      const POLL_INTERVAL_MS = 500;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const refreshed = await this.featureRepo.findById(resolved.id);
        if (refreshed?.specPath) {
          resolved = refreshed;
          break;
        }
      }
      if (!resolved.specPath) {
        throw new Error(
          `Feature "${resolved.name}" is still being initialized — please try again shortly`
        );
      }
    }

    if (resolved.autoTask?.enabled) {
      if (!this.autoTask) throw new Error('AutoTask planner is unavailable');
      await this.autoTask.execute(resolved.id);
      resolved = (await this.featureRepo.findById(resolved.id)) ?? resolved;
      const children = await this.featureRepo.list({ repositoryPath: resolved.repositoryPath });
      for (const child of children) {
        if (
          child.autoTask?.sourceFeatureId === resolved.id &&
          child.lifecycle === SdlcLifecycle.Pending
        )
          await this.execute(child.id, options);
      }
    }

    // Gate 1 — dependency. A feature may only start once the work it depends on
    // has landed; otherwise it goes (back) to Blocked and waits for
    // CheckAndUnblockFeaturesUseCase to release it.
    let parent: Feature | null = null;
    let blocked = false;

    for (const parentId of featureParentIds(resolved)) {
      parent = await this.featureRepo.findById(parentId);
      if (!parent || !satisfiesDependencyGate(parent)) {
        blocked = true;
        break;
      }
    }

    if (blocked) {
      const blockedFeature: Feature = {
        ...resolved,
        lifecycle: SdlcLifecycle.Blocked,
        updatedAt: new Date(),
      };
      await this.featureRepo.update(blockedFeature);

      return {
        feature: blockedFeature,
        agentRun,
        blocked: true,
        ...(parent
          ? { blockedBy: { id: parent.id, name: parent.name, lifecycle: parent.lifecycle } }
          : {}),
        queued: false,
      };
    }

    // Gate 2 — capacity. Evaluated only after the dependency gate, so a feature
    // that cannot run yet never takes a place in the queue ahead of one that can.
    //
    // The gate and the transition are ONE statement. Asking "is there a slot?"
    // and then writing "this feature is now running" separately lets two
    // `shep start` invocations both see 2 running against a limit of 3 and both
    // start, and lets a dashboard drain start a feature this call is also about
    // to start — two detached workers in one worktree.
    const now = new Date();
    const targetLifecycle =
      resolved.fast === true || resolved.buildMode === BuildMode.Fast
        ? SdlcLifecycle.Implementation
        : SdlcLifecycle.Requirements;

    const claimed = await this.capacity.claimSlot({
      featureId: resolved.id,
      targetLifecycle,
      // The feature was Pending when this call read it; if it is not Pending
      // any more, someone else already started it.
      requireLifecycle: SdlcLifecycle.Pending,
      bypassLimit: options?.bypassCapacityLimit === true,
      now,
    });

    if (!claimed) {
      const fresh = await this.featureRepo.findById(resolved.id);

      if (fresh && fresh.lifecycle !== SdlcLifecycle.Pending) {
        // Lost the race to another process, which owns the spawn. Report the
        // feature as it now is; spawning here would be the second worker.
        return { feature: fresh, agentRun, blocked: false, queued: false };
      }

      // Still Pending — the cap refused it, so it joins the queue.
      const queuedFeature = markQueuedForCapacity(resolved, now);
      await this.featureRepo.update(queuedFeature);

      return {
        feature: queuedFeature,
        agentRun,
        blocked: false,
        queued: true,
        queuePosition: await this.capacity.getQueuePosition(queuedFeature.id),
      };
    }

    // Both gates open, and the slot is ours — the claim already wrote the
    // lifecycle transition, so this object mirrors the row rather than saving
    // it a second time.
    const updatedFeature: Feature = {
      ...resolved,
      lifecycle: targetLifecycle,
      updatedAt: now,
    };
    delete updatedFeature.queuedAt;

    await this.spawnFeatureAgent.execute({
      feature: updatedFeature,
      ...(parent ? { parentBranch: parent.branch } : {}),
    });

    return {
      feature: updatedFeature,
      agentRun,
      blocked: false,
      queued: false,
    };
  }
}
