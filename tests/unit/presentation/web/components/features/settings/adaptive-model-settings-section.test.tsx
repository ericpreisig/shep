import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentType } from '@shepai/core/domain/generated/output';
import { AdaptiveModelSettingsSection } from '@/components/features/settings/adaptive-model-settings-section';

const mockUpdateSettingsAction = vi.fn();
const mockGetAdaptiveModelPlan = vi.fn();
const mockGetAllAgentModels = vi.fn();
vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: (...args: unknown[]) => mockGetAllAgentModels(...args),
}));

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('@/app/actions/get-adaptive-model-plan', () => ({
  getAdaptiveModelPlan: (...args: unknown[]) => mockGetAdaptiveModelPlan(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const PLAN = {
  enabled: true,
  agentType: 'claude-code',
  baseModel: 'claude-opus-5',
  tiers: {
    high: 'claude-opus-5',
    medium: 'claude-sonnet-5',
    low: 'claude-haiku-4-5',
  },
  overrides: {},
  supportedModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  degradesToSingleModel: false,
};

describe('AdaptiveModelSettingsSection', () => {
  it('keeps a stored foreign model visible even when absent from the default catalog', async () => {
    render(
      <AdaptiveModelSettingsSection
        adaptive={{
          enabled: false,
          low: 'vendor/unlisted-123',
          lowAgentType: AgentType.OpenRouter,
        }}
      />
    );
    const row = await screen.findByTestId('adaptive-models-low-select');
    expect(await within(row).findByRole('combobox')).toHaveTextContent('vendor/unlisted-123');
  });

  it('selects another provider and model, then returns to derived without changing the default', async () => {
    const user = userEvent.setup();
    render(<AdaptiveModelSettingsSection adaptive={{ enabled: true }} />);
    const row = await screen.findByTestId('adaptive-models-low-select');
    const picker = within(row).getByRole('combobox');
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    await user.click(await screen.findByRole('button', { name: 'OpenRouter' }));
    await user.click(await screen.findByRole('button', { name: /DeepSeek Flash/ }));
    await waitFor(() =>
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({
        models: {
          adaptive: { enabled: true, low: 'deepseek/flash', lowAgentType: AgentType.OpenRouter },
        },
      })
    );
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    await user.click(await screen.findByRole('button', { name: /derived/i }));
    await waitFor(() =>
      expect(mockUpdateSettingsAction).toHaveBeenLastCalledWith({
        models: { adaptive: expect.objectContaining({ enabled: true, low: '' }) },
      })
    );
    expect(picker).toHaveTextContent(/derived/i);
    expect(screen.getByTestId('adaptive-model-settings-section')).toBeVisible();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
    mockGetAdaptiveModelPlan.mockResolvedValue({ plan: PLAN });
    mockGetAllAgentModels.mockResolvedValue([
      {
        agentType: 'claude-code',
        label: 'Claude Code',
        models: PLAN.supportedModels.map((id) => ({ id, displayName: id, description: '' })),
      },
      {
        agentType: 'openrouter',
        label: 'OpenRouter',
        models: [{ id: 'deepseek/flash', displayName: 'DeepSeek Flash', description: '' }],
      },
    ]);
  });

  it('renders with the toggle off when nothing is configured', async () => {
    render(<AdaptiveModelSettingsSection />);

    const toggle = await screen.findByTestId('adaptive-models-toggle');
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('reflects the stored enabled state', async () => {
    render(<AdaptiveModelSettingsSection adaptive={{ enabled: true }} />);

    const toggle = await screen.findByTestId('adaptive-models-toggle');
    expect(toggle).toHaveAttribute('data-state', 'checked');
  });

  it('shows the model each tier resolves to', async () => {
    render(<AdaptiveModelSettingsSection adaptive={{ enabled: true }} />);

    await waitFor(() => expect(screen.getByTestId('adaptive-models-high-select')).toBeTruthy());
    expect(screen.getByText('claude-opus-5')).toBeTruthy();
    expect(screen.getByText('claude-sonnet-5')).toBeTruthy();
    expect(screen.getByText('claude-haiku-4-5')).toBeTruthy();
  });

  it('persists the toggle through updateSettingsAction', async () => {
    render(<AdaptiveModelSettingsSection />);

    fireEvent.click(await screen.findByTestId('adaptive-models-toggle'));

    await waitFor(() =>
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({
        models: { adaptive: { enabled: true } },
      })
    );
  });

  it('keeps stored tier overrides when toggling the mode', async () => {
    render(<AdaptiveModelSettingsSection adaptive={{ enabled: false, low: 'claude-haiku-4-5' }} />);

    fireEvent.click(await screen.findByTestId('adaptive-models-toggle'));

    await waitFor(() =>
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({
        models: { adaptive: { enabled: true, low: 'claude-haiku-4-5' } },
      })
    );
  });

  it('reverts the toggle when the save fails', async () => {
    mockUpdateSettingsAction.mockResolvedValue({ success: false, error: 'nope' });
    render(<AdaptiveModelSettingsSection />);

    const toggle = await screen.findByTestId('adaptive-models-toggle');
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('data-state', 'unchecked'));
  });

  it('explains when the pinned model has no cheaper sibling', async () => {
    mockGetAdaptiveModelPlan.mockResolvedValue({
      plan: { ...PLAN, degradesToSingleModel: true },
    });

    render(<AdaptiveModelSettingsSection adaptive={{ enabled: true }} />);

    await waitFor(() =>
      expect(screen.getByTestId('adaptive-models-single-model-hint')).toBeTruthy()
    );
  });

  it('still renders the toggle when the plan cannot be resolved', async () => {
    mockGetAdaptiveModelPlan.mockResolvedValue({ error: 'Settings not found' });

    render(<AdaptiveModelSettingsSection adaptive={{ enabled: true }} />);

    expect(await screen.findByTestId('adaptive-models-toggle')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('adaptive-models-error')).toBeTruthy());
    expect(screen.queryByTestId('adaptive-models-high-select')).toBeNull();
  });
});
