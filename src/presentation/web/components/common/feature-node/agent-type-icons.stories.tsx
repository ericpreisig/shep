import type { Meta, StoryObj } from '@storybook/react';
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog';
import { getAgentTypeIcon, DefaultAgentIcon } from './agent-type-icons';

const allAgentTypes = listAgentDescriptors();

function AgentIconGallery({ size }: { size: number }) {
  return (
    <div className="flex flex-wrap gap-6">
      {allAgentTypes.map(({ type, label }) => {
        const Icon = getAgentTypeIcon(type);
        return (
          <div key={type} className="flex flex-col items-center gap-2">
            <div className="border-border bg-muted/30 rounded-md border p-3">
              <Icon
                className={`h-${size} w-${size}`}
                style={{ width: size * 4, height: size * 4 }}
              />
            </div>
            <span className="text-sm font-medium">{label}</span>
            <code className="text-muted-foreground text-xs">{type}</code>
          </div>
        );
      })}
      <div className="flex flex-col items-center gap-2">
        <div className="border-border bg-muted/30 rounded-md border p-3">
          <DefaultAgentIcon style={{ width: size * 4, height: size * 4 }} />
        </div>
        <span className="text-sm font-medium">Fallback</span>
        <code className="text-muted-foreground text-xs">undefined</code>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Common/AgentTypeIcons',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj;

export const AllIcons: Story = {
  render: () => <AgentIconGallery size={10} />,
};

export const SmallIcons: Story = {
  render: () => <AgentIconGallery size={5} />,
};

export const LargeIcons: Story = {
  render: () => <AgentIconGallery size={16} />,
};

export const DevAgentIcon: Story = {
  render: () => {
    const Icon = getAgentTypeIcon('dev');
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="border-border bg-muted/30 rounded-md border p-3">
          <Icon style={{ width: 40, height: 40 }} />
        </div>
        <span className="text-sm font-medium">Dev (Mock)</span>
        <code className="text-muted-foreground text-xs">dev</code>
      </div>
    );
  },
};

export const OpenCodeIcon: Story = {
  render: () => {
    const Icon = getAgentTypeIcon('opencode');
    return (
      <div className="flex items-center gap-3">
        <Icon className="h-10 w-10" />
        <span>OpenCode</span>
      </div>
    );
  },
};
