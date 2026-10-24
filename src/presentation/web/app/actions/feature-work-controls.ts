'use server';

import { resolve } from '@/lib/server-container';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import type { CorrectFeatureUseCase } from '@shepai/core/application/use-cases/features/correct-feature.use-case';
import type { ExpandAutoTaskUseCase } from '@shepai/core/application/use-cases/features/expand-auto-task.use-case';
import type { AutoTaskState, FeatureDiscovery } from '@shepai/core/domain/generated/output';
import { AgentRunStatus, SdlcLifecycle } from '@shepai/core/domain/generated/output';
import { featureParentIds } from '@shepai/core/domain/shared/feature-dependencies';

export interface FeatureWorkControlsData {
  parents: string[];
  choices: { id: string; name: string }[];
  editable: boolean;
  canCorrect: boolean;
  corrections: string[];
  autoTask?: AutoTaskState;
  autoTaskChildren?: { id: string; name: string; lifecycle: string }[];
  discovery?: FeatureDiscovery;
}

export async function getFeatureWorkControls(featureId: string): Promise<FeatureWorkControlsData> {
  const features = resolve<IFeatureRepository>('IFeatureRepository');
  const feature = await features.findById(featureId);
  if (!feature) throw new Error('Feature not found');
  const runs = resolve<IAgentRunRepository>('IAgentRunRepository');
  const run = feature.agentRunId ? await runs.findById(feature.agentRunId) : null;
  const choices = await features.list({
    repositoryPath: feature.repositoryPath,
    includeArchived: true,
  });
  return {
    parents: featureParentIds(feature),
    choices: choices
      .filter((candidate) => candidate.id !== feature.id)
      .map(({ id, name }) => ({ id, name })),
    editable:
      [SdlcLifecycle.Pending, SdlcLifecycle.Blocked].includes(feature.lifecycle) &&
      (!run || (run.status === AgentRunStatus.pending && !run.startedAt)),
    canCorrect: Boolean(
      run &&
        [
          AgentRunStatus.running,
          AgentRunStatus.waitingApproval,
          AgentRunStatus.interrupted,
          AgentRunStatus.failed,
        ].includes(run.status) &&
        ![
          SdlcLifecycle.Pending,
          SdlcLifecycle.Blocked,
          SdlcLifecycle.Archived,
          SdlcLifecycle.Maintain,
          SdlcLifecycle.Deleting,
        ].includes(feature.lifecycle)
    ),
    corrections: feature.executionCorrections ?? [],
    ...(feature.autoTask
      ? {
          autoTask: feature.autoTask,
          autoTaskChildren: choices
            .filter((candidate) => candidate.autoTask?.sourceFeatureId === feature.id)
            .map(({ id, name, lifecycle }) => ({ id, name, lifecycle })),
        }
      : {}),
    ...(feature.discovery ? { discovery: feature.discovery } : {}),
  };
}

export async function correctFeature(
  featureId: string,
  instructions: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await resolve<CorrectFeatureUseCase>('CorrectFeatureUseCase').execute(featureId, instructions);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function prepareAutoTask(
  featureId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await resolve<ExpandAutoTaskUseCase>('ExpandAutoTaskUseCase').execute(featureId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
