import type { IAgentExecutor } from './agent-executor.interface.js';
import type { AgentType } from '../../../../domain/generated/output.js';

export interface IAgentExecutorProvider {
  getExecutor(agentType?: AgentType): Promise<IAgentExecutor>;
}
