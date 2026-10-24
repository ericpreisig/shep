import {
  AgentAuthMethod,
  type AgentConfig,
  type AgentType,
  type Settings,
} from '../generated/output';
import { getAgentDescriptor } from './agent-catalog';

type ProviderSettings = Pick<Settings, 'agent' | 'agentProviders'>;

/** One configuration per provider. The legacy default remains authoritative. */
export function configuredAgentProviders(settings: ProviderSettings): AgentConfig[] {
  const providers = new Map((settings.agentProviders ?? []).map((config) => [config.type, config]));
  providers.set(settings.agent.type, settings.agent);
  return [...providers.values()];
}

/** Never pass another provider's token to an override, even with legacy settings. */
export function resolveAgentConfig(
  settings: ProviderSettings,
  type: AgentType = settings.agent.type
): AgentConfig {
  return (
    configuredAgentProviders(settings).find((config) => config.type === type) ?? {
      type,
      authMethod: getAgentDescriptor(type)?.requiresToken
        ? AgentAuthMethod.Token
        : AgentAuthMethod.Session,
    }
  );
}
