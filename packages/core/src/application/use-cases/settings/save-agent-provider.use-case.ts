import { inject, injectable } from 'tsyringe';
import type { AgentAuthMethod, AgentType, Settings } from '../../../domain/generated/output.js';
import {
  configuredAgentProviders,
  resolveAgentConfig,
} from '../../../domain/shared/agent-providers.js';
import { getAgentDescriptor } from '../../../domain/shared/agent-catalog.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface SaveAgentProviderInput {
  type: AgentType;
  authMethod?: AgentAuthMethod;
  /** Undefined keeps the stored token; an empty string clears it. */
  token?: string;
  remove?: boolean;
}

@injectable()
export class SaveAgentProviderUseCase {
  constructor(@inject('ISettingsRepository') private readonly settings: ISettingsRepository) {}

  async execute(input: SaveAgentProviderInput): Promise<Settings> {
    if (!getAgentDescriptor(input.type)?.supported) throw new Error('Unsupported provider');
    const current = await this.settings.load();
    if (!current) throw new Error('Settings not initialized');
    if (input.remove && input.type === current.agent.type)
      throw new Error('Choose another default provider before removing this one');
    const existing = resolveAgentConfig(current, input.type);
    const config = {
      ...existing,
      ...(input.authMethod ? { authMethod: input.authMethod } : {}),
      ...(input.token !== undefined ? { token: input.token.trim() || undefined } : {}),
    };
    const providers = configuredAgentProviders(current).filter(
      (provider) => provider.type !== input.type
    );
    if (!input.remove) providers.push(config);
    const updated = {
      ...current,
      agentProviders: providers,
      ...(input.type === current.agent.type ? { agent: config } : {}),
      updatedAt: new Date(),
    };
    await this.settings.update(updated);
    return updated;
  }
}
