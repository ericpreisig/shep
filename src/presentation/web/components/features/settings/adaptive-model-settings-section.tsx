'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { Gauge, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AgentModelPicker } from './AgentModelPicker';
import { getAllAgentModels, type AgentModelGroup } from '@/app/actions/get-all-agent-models';
import { updateSettingsAction } from '@/app/actions/update-settings';
import { getAdaptiveModelPlan } from '@/app/actions/get-adaptive-model-plan';
import type { AdaptiveModelConfig, AgentType } from '@shepai/core/domain/generated/output';

type Tier = 'high' | 'medium' | 'low';

const TIERS: readonly Tier[] = ['high', 'medium', 'low'];

interface ResolvedPlan {
  agentType: string;
  baseModel: string;
  tiers: Record<Tier, string>;
  supportedModels: string[];
  degradesToSingleModel: boolean;
}

export interface AdaptiveModelSettingsSectionProps {
  adaptive?: AdaptiveModelConfig;
  agentType?: string;
  model?: string;
  providersKey?: string;
}

/**
 * Adaptive per-task model tier selection.
 *
 * Shows the user exactly which model each complexity tier resolves to under
 * their current agent + pinned model BEFORE they enable the mode, because the
 * answer depends on what their agent's catalog actually serves — the pin is a
 * ceiling, and some pins have no cheaper sibling at all.
 */
export function AdaptiveModelSettingsSection({
  adaptive,
  agentType,
  model,
  providersKey,
}: AdaptiveModelSettingsSectionProps) {
  const { t } = useTranslation('web');
  const [enabled, setEnabled] = useState(adaptive?.enabled ?? false);
  const [overrides, setOverrides] = useState<Partial<Record<Tier, string>>>({
    high: adaptive?.high,
    medium: adaptive?.medium,
    low: adaptive?.low,
  });
  const [plan, setPlan] = useState<ResolvedPlan | null>(null);
  const [groups, setGroups] = useState<AgentModelGroup[]>([]);
  const [agents, setAgents] = useState<Partial<Record<Tier, AgentType>>>({
    high: adaptive?.highAgentType,
    medium: adaptive?.mediumAgentType,
    low: adaptive?.lowAgentType,
  });
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  const refreshPlan = useCallback(async () => {
    const [result, modelGroups] = await Promise.all([getAdaptiveModelPlan(), getAllAgentModels()]);
    setGroups(modelGroups);
    if (result.plan) {
      setPlan({
        agentType: result.plan.agentType,
        baseModel: result.plan.baseModel,
        tiers: result.plan.tiers,
        supportedModels: result.plan.supportedModels,
        degradesToSingleModel: result.plan.degradesToSingleModel,
      });
      setPlanError(null);
    } else {
      setPlanError(result.error ?? t('settings.adaptiveModels.planUnavailable'));
    }
  }, [t]);

  useEffect(() => {
    void refreshPlan();
  }, [refreshPlan, agentType, model, providersKey]);

  function save(next: AdaptiveModelConfig, revert: () => void) {
    startTransition(async () => {
      const result = await updateSettingsAction({ models: { adaptive: next } });
      if (!result.success) {
        toast.error(result.error ?? t('settings.failedToSave'));
        revert();
        return;
      }
      await refreshPlan();
    });
  }

  function currentConfig(): AdaptiveModelConfig {
    return {
      enabled,
      ...(overrides.high !== undefined ? { high: overrides.high } : {}),
      ...(overrides.medium !== undefined ? { medium: overrides.medium } : {}),
      ...(overrides.low !== undefined ? { low: overrides.low } : {}),
      ...(agents.high ? { highAgentType: agents.high } : {}),
      ...(agents.medium ? { mediumAgentType: agents.medium } : {}),
      ...(agents.low ? { lowAgentType: agents.low } : {}),
    };
  }

  function handleToggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    save({ ...currentConfig(), enabled: next }, () => setEnabled(previous));
  }

  function handleOverrideChange(tier: Tier, agentType: string, value: string) {
    const previous = overrides;
    const previousAgents = agents;
    const nextOverrides = { ...overrides, [tier]: value };
    setOverrides(nextOverrides);
    setAgents({ ...agents, [tier]: value ? (agentType as AgentType) : undefined });
    const next: AdaptiveModelConfig = {
      ...currentConfig(),
      [tier]: value,
      [`${tier}AgentType`]: value ? (agentType as AgentType) : undefined,
    };
    save(next, () => {
      setOverrides(previous);
      setAgents(previousAgents);
    });
  }

  return (
    <div className="bg-background rounded-lg border" data-testid="adaptive-model-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Gauge className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.adaptiveModels.title')}</h2>
          {isPending ? (
            <span className="text-muted-foreground text-xs">{t('settings.saving')}</span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {t('settings.adaptiveModels.description')}
        </p>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between gap-4 border-b py-2.5">
          <div className="min-w-0">
            <label htmlFor="adaptive-models-enabled" className="cursor-pointer text-sm font-normal">
              {t('settings.adaptiveModels.enabled')}
            </label>
            <p className="text-muted-foreground text-[11px] leading-tight">
              {t('settings.adaptiveModels.enabledDescription')}
            </p>
          </div>
          <Switch
            id="adaptive-models-enabled"
            data-testid="adaptive-models-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {planError ? (
          <p
            className="text-muted-foreground py-2.5 text-[11px]"
            data-testid="adaptive-models-error"
          >
            {planError}
          </p>
        ) : null}

        {plan ? (
          <>
            <div className="flex items-center gap-2 border-b py-2.5">
              <Info className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-[11px] leading-tight">
                {t('settings.adaptiveModels.ceilingHint', {
                  model: plan.baseModel,
                  agent: plan.agentType,
                })}
              </p>
            </div>

            {plan.degradesToSingleModel ? (
              <p
                className="text-muted-foreground py-2.5 text-[11px] leading-tight"
                data-testid="adaptive-models-single-model-hint"
              >
                {t('settings.adaptiveModels.singleModelHint', { model: plan.baseModel })}
              </p>
            ) : null}

            {TIERS.map((tier) => (
              <div
                key={tier}
                className="flex flex-wrap items-center justify-between gap-4 border-b py-2.5"
              >
                <div className="min-w-0">
                  <label className="flex items-center gap-2 text-sm font-normal">
                    {t(`settings.adaptiveModels.tiers.${tier}`)}
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {plan.tiers[tier]}
                    </Badge>
                  </label>
                  <p className="text-muted-foreground text-[11px] leading-tight">
                    {t(`settings.adaptiveModels.tiers.${tier}Description`)}
                  </p>
                </div>
                <div
                  data-testid={`adaptive-models-${tier}-select`}
                  className="max-w-full min-w-0 shrink-0"
                >
                  <AgentModelPicker
                    initialAgentType={plan.agentType}
                    initialModel=""
                    agentType={overrides[tier] ? (agents[tier] ?? plan.agentType) : plan.agentType}
                    model={overrides[tier] ?? ''}
                    modelGroups={groups}
                    defaultOptionLabel={t('settings.adaptiveModels.derived')}
                    ariaLabel={t(`settings.adaptiveModels.tiers.${tier}`)}
                    mode="settings"
                    saving={isPending}
                    onSave={async (agentType, model) => {
                      handleOverrideChange(tier, agentType, model);
                    }}
                  />
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
