import type { Meta, StoryObj } from '@storybook/react';
import type { MindMapPageData } from '@/app/actions/project-mind-map';
import { ProjectMindMapPanel } from './project-mind-map-panel';

const data: MindMapPageData = {
  repository: { id: 'forge', name: 'Forge' },
  generating: false,
  features: [
    { id: 'weapons', name: 'Épées et attaques', description: '', lifecycle: 'Maintain' },
    { id: 'armor', name: 'Armures et statistiques', description: '', lifecycle: 'Archived' },
    { id: 'dialogue', name: 'Dialogues interactifs', description: '', lifecycle: 'Implementation' },
    { id: 'quests', name: 'Journal de quêtes', description: '', lifecycle: 'Pending' },
  ],
  map: {
    repositoryId: 'forge',
    fingerprint: 'example',
    generatedAt: new Date(),
    topics: [
      { id: 'character', label: 'Personnage', featureIds: [] },
      { id: 'equipment', label: 'Équipement', parentId: 'character', featureIds: ['armor'] },
      { id: 'arms', label: 'Armes', parentId: 'equipment', featureIds: ['weapons'] },
      { id: 'world', label: 'Monde et narration', featureIds: ['dialogue', 'quests'] },
    ],
  },
};
const meta = {
  title: 'Features/ProjectMindMap',
  component: ProjectMindMapPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    projects: [data.repository],
    initialRepositoryId: 'forge',
    initialData: data,
    load: async () => ({ data }),
  },
} satisfies Meta<typeof ProjectMindMapPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CompleteProject: Story = {};
export const Reorganizing: Story = {
  args: {
    initialData: { ...data, generating: true },
    load: async () => ({ data: { ...data, generating: true } }),
  },
};
export const NoTasks: Story = {
  args: {
    initialData: { ...data, features: [] },
    load: async () => ({ data: { ...data, features: [] } }),
  },
};
