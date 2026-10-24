/**
 * ReparentFeatureUseCase
 *
 * Updates a feature's parent dependency (or clears it). Performs validation:
 * - Same-repository constraint (child and parent must share repositoryPath)
 * - Cycle detection via upward ancestor walk
 * - Lifecycle guards (cannot reparent completed/archived/deleting features)
 * - Lifecycle state adjustment based on new parent's lifecycle
 *
 * After reparenting, both ends of the new edge are handed to
 * CheckAndUnblockFeaturesUseCase, which owns the gate and the
 * Blocked -> Started + rebase + spawn flow.
 *
 * A feature that was already running when the dependency was declared has its
 * agent stopped: writing Blocked while the worker keeps going produces a
 * feature that claims to be waiting and is in fact still building on code the
 * parent has not landed yet. The run is marked interrupted (resumable), and
 * CheckAndUnblockFeaturesUseCase restarts it — rebased onto the parent — once
 * the parent's work lands.
 */

import { injectable, inject } from 'tsyringe';
import { SdlcLifecycle, type FeatureCoordination } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { satisfiesDependencyGate } from '../../../domain/lifecycle-gates.js';
import { StopAgentRunUseCase } from '../agents/stop-agent-run.use-case.js';
import { CheckAndUnblockFeaturesUseCase } from './check-and-unblock-features.use-case.js';
import {
  assertDependencyDag,
  featureParentIds,
} from '../../../domain/shared/feature-dependencies.js';

/** Lifecycle states that cannot be reparented. */
const NON_REPARENTABLE_STATES = new Set<SdlcLifecycle>([
  SdlcLifecycle.Maintain,
  SdlcLifecycle.Archived,
  SdlcLifecycle.Deleting,
]);

export interface ReparentFeatureInput {
  featureId: string;
  parentId?: string | null;
  parentIds?: string[];
  /**
   * The agent decision that drew this edge (spec 141), written in the same
   * update as the edge. Any reparent without one clears the previous record,
   * so a reason never outlives the edge it explained.
   */
  coordination?: FeatureCoordination;
}

@injectable()
export class ReparentFeatureUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(CheckAndUnblockFeaturesUseCase)
    private readonly checkAndUnblock: CheckAndUnblockFeaturesUseCase,
    @inject(StopAgentRunUseCase)
    private readonly stopAgentRun: StopAgentRunUseCase
  ) {}

  async execute(input: ReparentFeatureInput): Promise<void> {
    if (input.parentIds !== undefined)
      return this.updateParentsBeforeStart(input.featureId, input.parentIds);
    const { featureId } = input;
    const parentId = input.parentId ?? null;

    // Self-reparent guard
    if (parentId !== null && featureId === parentId) {
      throw new Error('A feature cannot be set as parent of itself.');
    }

    // Load child feature
    const child = await this.featureRepo.findById(featureId);
    if (!child) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Lifecycle guard — reject completed/terminal features
    if (NON_REPARENTABLE_STATES.has(child.lifecycle)) {
      throw new Error(
        `Cannot reparent feature "${child.name}": lifecycle is ${child.lifecycle}. ` +
          'Only active features can be reparented.'
      );
    }

    // Unparent case
    if (parentId === null) {
      const newLifecycle =
        child.lifecycle === SdlcLifecycle.Blocked ? SdlcLifecycle.Started : child.lifecycle;
      await this.featureRepo.update({
        ...child,
        parentId: undefined,
        parentIds: [],
        coordination: undefined,
        lifecycle: newLifecycle,
        updatedAt: new Date(),
      });
      return;
    }

    // Load parent feature
    const parent = await this.featureRepo.findById(parentId);
    if (!parent) {
      throw new Error(`Parent feature not found: ${parentId}`);
    }

    // Same-repository constraint
    if (child.repositoryPath !== parent.repositoryPath) {
      throw new Error('Features must be in the same repository to form a dependency.');
    }

    // Cycle detection — walk from proposed parent upward
    await this.detectCycle(featureId, parentId);

    // Determine lifecycle adjustment based on new parent's lifecycle
    let newLifecycle = child.lifecycle;
    if (!satisfiesDependencyGate(parent)) {
      // Parent is pre-implementation or Blocked — child should be Blocked
      if (child.lifecycle !== SdlcLifecycle.Blocked && child.lifecycle !== SdlcLifecycle.Pending) {
        newLifecycle = SdlcLifecycle.Blocked;
      }
    }

    // Persist the reparent
    await this.featureRepo.update({
      ...child,
      parentId,
      parentIds: [parentId],
      coordination: input.coordination,
      lifecycle: newLifecycle,
      updatedAt: new Date(),
    });

    // The new edge just took this feature out of the running. Stop the agent
    // that is still working on it, otherwise the dependency is decoration: the
    // worker keeps building on a base its parent has not produced yet, and its
    // next phase report is a lifecycle write that undoes Blocked.
    if (newLifecycle === SdlcLifecycle.Blocked && child.lifecycle !== SdlcLifecycle.Blocked) {
      await this.stopRunningAgent(child.agentRunId);
    }

    // Re-evaluate the gate at BOTH ends of the new edge. Both calls are
    // gate-checked and idempotent inside CheckAndUnblockFeaturesUseCase, so the
    // gate is deliberately NOT re-derived here — duplicating it is what let the
    // two drift apart.
    //
    // New parent: it may already be past the Implementation gate (even finished),
    // in which case the feature just attached — and any Blocked siblings — must be
    // released NOW. A finished parent has no future transition left to do it.
    await this.checkAndUnblock.execute(parentId);

    // Reparented feature: it may itself be the parent of Blocked children whose
    // gate is satisfied by its own lifecycle.
    await this.checkAndUnblock.execute(featureId);
  }

  private async updateParentsBeforeStart(featureId: string, ids: string[]): Promise<void> {
    const child = await this.featureRepo.findById(featureId);
    if (!child) throw new Error(`Feature not found: ${featureId}`);
    const parentIds = featureParentIds({ parentIds: ids });
    const parents = await Promise.all(parentIds.map((id) => this.featureRepo.findById(id)));
    for (const parent of parents) {
      if (!parent) throw new Error('Parent feature not found');
      if (parent.repositoryPath !== child.repositoryPath) {
        throw new Error('Features must be in the same repository to form a dependency.');
      }
    }
    await assertDependencyDag(featureId, parentIds, async (id) =>
      featureParentIds((await this.featureRepo.findById(id)) ?? {})
    );
    if (!(await this.featureRepo.updateDependenciesBeforeStart(featureId, parentIds))) {
      throw new Error('Dependencies can only be edited before the task starts');
    }
    for (const parentId of parentIds) await this.checkAndUnblock.execute(parentId);
    // Clearing the final dependency also needs a release; there is no parent
    // left whose next transition could wake this blocked feature.
    if (parentIds.length === 0 && child.lifecycle === SdlcLifecycle.Blocked) {
      await this.checkAndUnblock.execute(featureId, true);
    }
  }

  /**
   * Stop the feature's agent run, if it has one.
   *
   * StopAgentRunUseCase already no-ops on terminal runs and on a missing PID,
   * so no liveness check is needed here. Failures are swallowed: the reparent
   * itself has been persisted, and leaving the caller with an error would
   * suggest the dependency edge was not recorded when it was.
   */
  private async stopRunningAgent(agentRunId: string | undefined): Promise<void> {
    if (!agentRunId) {
      return;
    }
    try {
      await this.stopAgentRun.execute(agentRunId);
    } catch {
      // Best-effort — the gate still holds via UpdateFeatureLifecycleUseCase.
    }
  }

  /**
   * Walk the ancestor chain from the proposed parent upward.
   * If the child feature ID is found in the chain, a cycle exists.
   */
  private async detectCycle(childId: string, parentId: string): Promise<void> {
    await assertDependencyDag(childId, [parentId], async (id) =>
      featureParentIds((await this.featureRepo.findById(id)) ?? {})
    );
  }
}
