/**
 * Complete Web Onboarding Use Case
 *
 * Lighter variant of CompleteOnboardingUseCase for the web UI wizard.
 * Only updates agent type, model, and sets onboardingComplete=true.
 * Other settings (IDE, workflow defaults) keep their current values.
 */

import { injectable, inject } from 'tsyringe';
import type { Settings, AgentType } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import {
  configuredAgentProviders,
  resolveAgentConfig,
} from '../../../domain/shared/agent-providers.js';

export interface CompleteWebOnboardingInput {
  agentType: AgentType;
  model: string | null;
}

@injectable()
export class CompleteWebOnboardingUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: CompleteWebOnboardingInput): Promise<Settings> {
    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    const updatedSettings: Settings = {
      ...settings,
      agent: resolveAgentConfig(settings, input.agentType),
      agentProviders: configuredAgentProviders(settings),
      // Spread first: only the default model changes here. Rebuilding
      // `models` from scratch would drop the saved effort and adaptive tiers.
      models: {
        ...settings.models,
        default: input.model?.trim() ?? settings.models.default,
      },
      onboardingComplete: true,
      updatedAt: new Date(),
    };

    await this.settingsRepository.update(updatedSettings);
    return updatedSettings;
  }
}
