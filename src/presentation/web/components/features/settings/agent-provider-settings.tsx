'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saveAgentProvider } from '@/app/actions/agent-providers';
import type { SecretPresence } from '@shepai/core/application/use-cases/settings/load-settings.use-case';
import {
  AgentAuthMethod,
  type AgentConfig,
  type AgentType,
} from '@shepai/core/domain/generated/output';
import { configuredAgentProviders } from '@shepai/core/domain/shared/agent-providers';
import {
  getAgentDescriptor,
  isAgentOffered,
  listAgentDescriptors,
} from '@shepai/core/domain/shared/agent-catalog';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';

export interface AgentProviderSettingsProps {
  agent: AgentConfig;
  defaultType?: AgentType;
  providers?: AgentConfig[];
  tokenPresence?: Record<string, SecretPresence>;
}

/** Additional providers share the existing picker and execution path; keys stay write-only. */
export function AgentProviderSettings({
  agent,
  defaultType,
  providers,
  tokenPresence,
}: AgentProviderSettingsProps) {
  const { t } = useTranslation('web');
  const flags = useFeatureFlags();
  const [items, setItems] = useState(() =>
    configuredAgentProviders({ agent, agentProviders: providers })
  );
  const [presence, setPresence] = useState(tokenPresence ?? {});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, startTransition] = useTransition();
  useEffect(() => {
    setItems(configuredAgentProviders({ agent, agentProviders: providers }));
    setPresence(tokenPresence ?? {});
  }, [agent, providers, tokenPresence]);
  useEffect(() => {
    if (!defaultType) return;
    setItems((current) =>
      current.some((config) => config.type === defaultType)
        ? current
        : [
            ...current,
            {
              type: defaultType,
              authMethod: getAgentDescriptor(defaultType)?.requiresToken
                ? AgentAuthMethod.Token
                : AgentAuthMethod.Session,
            },
          ]
    );
  }, [defaultType]);

  function save(config: AgentConfig, token?: string, remove = false) {
    setError('');
    startTransition(async () => {
      const result = await saveAgentProvider({
        type: config.type,
        ...(remove
          ? { remove: true }
          : { authMethod: config.authMethod, ...(token !== undefined ? { token } : {}) }),
      });
      if (!result.success) {
        setError(result.error ?? t('providers.failed'));
        return;
      }
      setItems((current) => [
        ...current.filter((item) => item.type !== config.type),
        ...(remove ? [] : [config]),
      ]);
      setPresence((current) => ({
        ...current,
        [config.type]: { hasValue: result.hasToken ?? false, lastFour: '' },
      }));
      setTokens((current) => ({ ...current, [config.type]: '' }));
      setSelected('');
    });
  }
  const available = listAgentDescriptors().filter(
    (provider) =>
      provider.supported &&
      isAgentOffered(provider, flags) &&
      !items.some((item) => item.type === provider.type)
  );

  return (
    <section
      className="space-y-3 border-t py-3"
      aria-label={t('providers.title')}
      data-testid="agent-provider-settings"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t('providers.title')}</h3>
        <p className="text-muted-foreground text-xs">{t('providers.hint')}</p>
      </div>
      {items.map((config) => {
        const descriptor = getAgentDescriptor(config.type);
        const name = descriptor?.label ?? config.type;
        const Icon = getAgentTypeIcon(config.type);
        const current = config.type === (defaultType ?? agent.type);
        return (
          <div
            key={config.type}
            className="space-y-2 border-b py-2 last:border-b-0"
            data-testid={`provider-${config.type}`}
          >
            <div className="flex items-center gap-2 text-xs">
              <Icon className="size-4" />
              <span className="font-medium">{name}</span>
              {current ? (
                <span className="text-muted-foreground ms-auto">{t('providers.default')}</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto h-6 text-xs"
                  disabled={busy}
                  onClick={() => save(config, undefined, true)}
                >
                  {t('providers.remove')}
                </Button>
              )}
            </div>
            {!current ? (
              <>
                <Select
                  value={config.authMethod}
                  disabled={busy || descriptor?.requiresToken}
                  onValueChange={(value) =>
                    save({ ...config, authMethod: value as AgentAuthMethod })
                  }
                >
                  <SelectTrigger
                    aria-label={`${t('providers.auth')} — ${name}`}
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AgentAuthMethod.Session}>Session</SelectItem>
                    <SelectItem value={AgentAuthMethod.Token}>Token</SelectItem>
                  </SelectContent>
                </Select>
                {config.authMethod === AgentAuthMethod.Token ? (
                  <div className="space-y-1">
                    <Label htmlFor={`provider-token-${config.type}`} className="text-xs">
                      {t('providers.apiKey')} — {name}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`provider-token-${config.type}`}
                        type="password"
                        autoComplete="off"
                        value={tokens[config.type] ?? ''}
                        disabled={busy}
                        placeholder={t(
                          presence[config.type]?.hasValue
                            ? 'providers.configured'
                            : 'providers.enterKey'
                        )}
                        onChange={(event) =>
                          setTokens((current) => ({
                            ...current,
                            [config.type]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          const token = tokens[config.type]?.trim();
                          if (token) save(config, token);
                        }}
                        className="text-xs"
                      />
                      {presence[config.type]?.hasValue ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => save(config, '')}
                        >
                          {t('providers.clearKey')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">{t('providers.sessionHint')}</p>
                )}
              </>
            ) : null}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected} disabled={busy || !available.length}>
          <SelectTrigger aria-label="Provider" className="text-xs">
            <SelectValue placeholder={t('providers.select')} />
          </SelectTrigger>
          <SelectContent>
            {available.map((provider) => (
              <SelectItem key={provider.type} value={provider.type}>
                {provider.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !selected}
          onClick={() =>
            save({
              type: selected as AgentType,
              authMethod: getAgentDescriptor(selected)?.requiresToken
                ? AgentAuthMethod.Token
                : AgentAuthMethod.Session,
            })
          }
        >
          {t('providers.add')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
