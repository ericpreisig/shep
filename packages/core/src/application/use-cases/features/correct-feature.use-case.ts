import { inject, injectable } from 'tsyringe';
import { AgentRunStatus, SdlcLifecycle } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import { StopAgentRunUseCase } from '../agents/stop-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../agents/reject-agent-run.use-case.js';
import { ResumeFeatureUseCase } from './resume-feature.use-case.js';

@injectable()
export class CorrectFeatureUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IAgentRunRepository') private readonly runs: IAgentRunRepository,
    @inject(StopAgentRunUseCase) private readonly stop: StopAgentRunUseCase,
    @inject(ResumeFeatureUseCase) private readonly resume: ResumeFeatureUseCase,
    @inject(RejectAgentRunUseCase) private readonly reject: RejectAgentRunUseCase
  ) {}

  async execute(featureId: string, instructions: string): Promise<void> {
    const correction = instructions.trim();
    if (!correction) throw new Error('A correction is required');
    const feature = await this.features.findById(featureId);
    if (!feature?.agentRunId) throw new Error('Feature has no execution to correct');
    if (
      [
        SdlcLifecycle.Pending,
        SdlcLifecycle.Blocked,
        SdlcLifecycle.Archived,
        SdlcLifecycle.Maintain,
        SdlcLifecycle.Deleting,
      ].includes(feature.lifecycle)
    ) {
      throw new Error('This task is not currently executing; use its chat for follow-up changes');
    }
    const run = await this.runs.findById(feature.agentRunId);
    if (!run) throw new Error('Agent run not found');
    if (run.status === AgentRunStatus.waitingApproval) {
      const result = await this.reject.execute(run.id, correction);
      if (!result.rejected) throw new Error(result.reason);
      return;
    }
    if (run.status === AgentRunStatus.running || run.status === AgentRunStatus.pending) {
      const stopped = await this.stop.execute(run.id);
      if (!stopped.stopped) throw new Error(stopped.reason);
    } else if (![AgentRunStatus.interrupted, AgentRunStatus.failed].includes(run.status)) {
      throw new Error('Execution already completed; use the task chat for follow-up changes');
    }
    const current = await this.features.findById(featureId);
    if (!current || current.agentRunId !== run.id)
      throw new Error('The task changed; retry your correction');
    await this.features.update({
      ...current,
      executionCorrections: [...(current.executionCorrections ?? []), correction],
      updatedAt: new Date(),
    });
    await this.resume.execute(featureId);
  }
}
