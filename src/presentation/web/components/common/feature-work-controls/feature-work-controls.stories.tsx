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
