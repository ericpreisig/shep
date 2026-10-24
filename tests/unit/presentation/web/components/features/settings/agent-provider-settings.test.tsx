import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentProviderSettings } from '@/components/features/settings/agent-provider-settings';
import { AgentType, AgentAuthMethod } from '@shepai/core/domain/generated/output';

const save = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, hasToken: true }));
vi.mock('@/app/actions/agent-providers', () => ({ saveAgentProvider: save }));

describe('AgentProviderSettings', () => {
  it('keeps Codex visible while saving a write-only OpenRouter credential independently', async () => {
    const user = userEvent.setup();
    render(
      <AgentProviderSettings
        agent={{ type: AgentType.CodexCli, authMethod: AgentAuthMethod.Session }}
        providers={[{ type: AgentType.OpenRouter, authMethod: AgentAuthMethod.Token }]}
        tokenPresence={{ openrouter: { hasValue: true, lastFour: 'test' } }}
      />
    );
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    const field = screen.getByLabelText('API key — OpenRouter');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('');
    await user.type(field, 'test-new-router-key');
    await user.tab();
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        type: 'openrouter',
        authMethod: 'token',
        token: 'test-new-router-key',
      })
    );
    await waitFor(() => expect(field).toHaveValue(''));
  });
});
