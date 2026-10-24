import type { Meta, StoryObj } from '@storybook/react';
import { FeatureWorkControls } from './feature-work-controls';

const meta = {
  title: 'Common/FeatureWorkControls',
  component: FeatureWorkControls,
  args: {
    featureId: 'feature',
    initialData: {
      parents: ['combat', 'equipment'],
      choices: [
        { id: 'combat', name: 'Combat' },
        { id: 'equipment', name: 'Equipment' },
      ],
      editable: true,
      canCorrect: false,
      corrections: [],
    },
  },
} satisfies Meta<typeof FeatureWorkControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const AutoTaskReady: Story = {
  args: {
    initialData: {
      ...meta.args.initialData,
      autoTask: {
        enabled: true,
        plan: { ready: true, tasks: [], parentIds: ['combat', 'equipment'] },
      },
      autoTaskChildren: [
        { id: 'combat', name: 'Combat foundation', lifecycle: 'Implementation' },
        { id: 'equipment', name: 'Equipment integration', lifecycle: 'Blocked' },
      ],
    },
  },
};
export const AutoTaskFailed: Story = {
  args: {
    initialData: {
      ...meta.args.initialData,
      autoTask: { enabled: true, error: 'The agent timed out. The saved plan can be resumed.' },
    },
  },
};
export const DiscoveredCapability: Story = {
  args: {
    initialData: {
      ...meta.args.initialData,
      editable: false,
      discovery: { key: 'crafting', evidencePaths: ['src/crafting.js'], analyzedAt: new Date() },
    },
  },
};
export const Running: Story = {
  args: {
    initialData: {
      ...meta.args.initialData,
      editable: false,
      canCorrect: true,
      corrections: ['Keep the existing combat animations.'],
    },
  },
};
