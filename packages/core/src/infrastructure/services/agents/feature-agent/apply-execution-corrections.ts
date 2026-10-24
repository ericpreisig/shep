import type {
  IAgentExecutor,
  AgentExecutionOptions,
} from '../../../../application/ports/output/agents/agent-executor.interface.js';
import type { IFeatureRepository } from '../../../../application/ports/output/repositories/feature-repository.interface.js';

/** Runs before checkpoint replay, so completed phases cannot swallow a correction. */
export async function applyExecutionCorrections(
  featureId: string,
  features: IFeatureRepository,
  executor: IAgentExecutor,
  options: AgentExecutionOptions
): Promise<void> {
  const feature = await features.findById(featureId);
  const applied = feature?.executionCorrectionsApplied ?? 0;
  const corrections = feature?.executionCorrections ?? [];
  const pending = corrections.slice(applied);
  if (!pending.length) return;
  await executor.execute(
    `The user has redirected this task while it was executing.
Inspect the existing worktree and preserve valid work. Apply the following corrections NOW,
even if the affected implementation phase was previously marked complete. Update the existing
specification and remaining plan/tasks where necessary so subsequent phases respect the change.
Do not merge, push, or start another task; the workflow will resume after your correction.

${pending.map((text, index) => `${index + 1}. ${text}`).join('\n')}`,
    options
  );
  const current = await features.findById(featureId);
  if (current)
    await features.update({
      ...current,
      executionCorrectionsApplied: corrections.length,
      updatedAt: new Date(),
    });
}
