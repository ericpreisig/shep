import { inject, injectable } from 'tsyringe';
import { AgentType, AgentRunStatus, SdlcLifecycle } from '../../../domain/generated/output.js';
import { InteractiveAgentUnsupportedError } from '../../../domain/errors/interactive-agent-unsupported.error.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IAgentExecutorFactory } from '../../ports/output/agents/agent-executor-factory.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import { StopAgentRunUseCase } from '../agents/stop-agent-run.use-case.js';

/** A feature chat takes over its worktree; it never races the SDLC writer. */
@injectable()
export class PrepareFeatureChatUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IAgentRunRepository') private readonly runs: IAgentRunRepository,
    @inject(StopAgentRunUseCase) private readonly stop: StopAgentRunUseCase,
    @inject('IAgentExecutorFactory') private readonly factory: IAgentExecutorFactory,
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('IWorktreeService') private readonly worktrees: IWorktreeService
  ) {}

  async execute(featureId: string, agentType?: string): Promise<string | undefined> {
    const feature = await this.features.findById(featureId);
    if (!feature) return undefined; // repository, app and global chat scopes
    const selected = (agentType ?? (await this.settings.load())?.agent.type) as AgentType;
    if (!this.factory.supportsInteractive(selected))
      throw new InteractiveAgentUnsupportedError(selected);
    if (feature.agentRunId) {
      const run = await this.runs.findById(feature.agentRunId);
      if (
        run &&
        [AgentRunStatus.running, AgentRunStatus.pending].includes(run.status) &&
        ![SdlcLifecycle.Pending, SdlcLifecycle.Blocked].includes(feature.lifecycle)
      ) {
        const stopped = await this.stop.execute(feature.agentRunId);
        if (!stopped.stopped) throw new Error(stopped.reason);
      }
    }
    if (!feature.branch) throw new Error('This task is still being initialized; try again shortly');
    const current = (await this.worktrees.list(feature.repositoryPath)).find(
      (worktree) => worktree.branch === feature.branch
    );
    if (current) return current.path;
    const path = this.worktrees.getWorktreePath(feature.repositoryPath, feature.branch);
    // Completed tasks may have had their worktrees cleaned; recreate an
    // isolated checkout rather than editing the repository's main directory.
    if (await this.worktrees.branchExists(feature.repositoryPath, feature.branch)) {
      await this.worktrees.addExisting(feature.repositoryPath, feature.branch, path);
    } else {
      await this.worktrees.create(feature.repositoryPath, feature.branch, path);
    }
    return path;
  }
}
