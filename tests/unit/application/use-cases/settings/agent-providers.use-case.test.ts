import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { SaveAgentProviderUseCase } from '@/application/use-cases/settings/save-agent-provider.use-case.js';
import { CompleteWebOnboardingUseCase } from '@/application/use-cases/settings/complete-web-onboarding.use-case.js';
import { LoadSettingsUseCase } from '@/application/use-cases/settings/load-settings.use-case.js';
import { resolveAgentConfig } from '@/domain/shared/agent-providers.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { AgentType, AgentAuthMethod, type Settings } from '@/domain/generated/output.js';

function setup() {
  let stored = createDefaultSettings();
  stored.agent = { type: AgentType.CodexCli, authMethod: AgentAuthMethod.Session };
  const repo = {
    load: vi.fn(async () => stored),
    update: vi.fn(async (s: Settings) => {
      stored = s;
    }),
    initialize: vi.fn(),
  };
  return { repo, save: new SaveAgentProviderUseCase(repo), get: () => stored };
}
describe('Multiple agent providers', () => {
  it('keeps Codex CLI as default while storing and rotating a separate OpenRouter key', async () => {
    const { save, get } = setup();
    await save.execute({
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'test-openrouter-one',
    });
    expect(get().agent.type).toBe(AgentType.CodexCli);
    expect(resolveAgentConfig(get(), AgentType.OpenRouter).token).toBe('test-openrouter-one');
    expect(resolveAgentConfig(get(), AgentType.CodexCli).token).toBeUndefined();
    await save.execute({ type: AgentType.OpenRouter, authMethod: AgentAuthMethod.Token });
    expect(resolveAgentConfig(get(), AgentType.OpenRouter).token).toBe('test-openrouter-one');
    await save.execute({
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'test-openrouter-two',
    });
    expect(get().agentProviders?.filter((p) => p.type === AgentType.OpenRouter)).toHaveLength(1);
    expect(resolveAgentConfig(get(), AgentType.OpenRouter).token).toBe('test-openrouter-two');
  });
  it('switches defaults and back without copying or losing another provider credential', async () => {
    const { save, repo, get } = setup();
    await save.execute({
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'test-router-secret',
    });
    const onboarding = new CompleteWebOnboardingUseCase(repo);
    await onboarding.execute({ agentType: AgentType.OpenRouter, model: 'vendor/model' });
    expect(get().agent).toMatchObject({
      type: AgentType.OpenRouter,
      token: 'test-router-secret',
      authMethod: AgentAuthMethod.Token,
    });
    await onboarding.execute({ agentType: AgentType.CodexCli, model: 'cli-model' });
    expect(get().agent.token).toBeUndefined();
    expect(resolveAgentConfig(get(), AgentType.OpenRouter).token).toBe('test-router-secret');
  });
  it('never supplies the default provider token to an unconfigured override', async () => {
    const { get } = setup();
    const settings = get();
    settings.agent = {
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'private-default',
    };
    expect(resolveAgentConfig(settings, AgentType.CodexCli)).toEqual({
      type: AgentType.CodexCli,
      authMethod: AgentAuthMethod.Session,
    });
    expect(resolveAgentConfig(settings, AgentType.TogetherAi).token).toBeUndefined();
  });
  it('masks all saved tokens at the browser boundary without modifying stored values', async () => {
    const { save, repo, get } = setup();
    await save.execute({
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'test-router-secret',
    });
    const result = await new LoadSettingsUseCase(repo).executeMasked();
    expect(JSON.stringify(result)).not.toContain('test-router-secret');
    expect(result.secrets.agentProviderTokens?.[AgentType.OpenRouter].hasValue).toBe(true);
    expect(resolveAgentConfig(get(), AgentType.OpenRouter).token).toBe('test-router-secret');
  });
  it('removes an additional provider while protecting the current default', async () => {
    const { save, get } = setup();
    await save.execute({
      type: AgentType.OpenRouter,
      authMethod: AgentAuthMethod.Token,
      token: 'test-key',
    });
    await save.execute({ type: AgentType.OpenRouter, remove: true });
    expect(get().agentProviders?.some((p) => p.type === AgentType.OpenRouter)).toBe(false);
    await expect(save.execute({ type: AgentType.CodexCli, remove: true })).rejects.toThrow(
      /default/i
    );
  });
});
