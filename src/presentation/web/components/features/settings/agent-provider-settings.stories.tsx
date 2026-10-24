import type { Meta, StoryObj } from '@storybook/react';
import { AgentProviderSettings } from './agent-provider-settings';
import { AgentType, AgentAuthMethod } from '@shepai/core/domain/generated/output';

const meta = {
  title: 'Settings/AgentProviders',
  component: AgentProviderSettings,
  args: {
    agent: { type: AgentType.CodexCli, authMethod: AgentAuthMethod.Session },
    providers: [{ type: AgentType.OpenRouter, authMethod: AgentAuthMethod.Token }],
    tokenPresence: { openrouter: { hasValue: true, lastFour: 'demo' } },
  },
} satisfies Meta<typeof AgentProviderSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CodexAndOpenRouter: Story = {};
export const CodexOnly: Story = { args: { providers: [], tokenPresence: {} } };
