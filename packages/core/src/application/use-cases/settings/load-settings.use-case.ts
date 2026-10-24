/**
 * Load Settings Use Case
 *
 * Retrieves existing settings from the database.
 * Throws error if settings don't exist (must initialize first).
 *
 * Business Rules:
 * - Settings must be initialized before loading
 * - Returns complete Settings object
 * - Read-only operation (no mutations)
 *
 * Two entry points, deliberately:
 *
 * - `execute()` returns the settings verbatim. Server-side consumers need
 *   the real credentials — `update-settings` loads, deep-merges and saves,
 *   so masking here would persist the mask and destroy the stored secrets.
 * - `executeMasked()` returns a copy with every credential removed plus a
 *   presence summary. Anything that crosses into a browser must use this:
 *   a client component's props are serialised whole into the RSC Flight
 *   payload embedded in the HTML, so a token that reaches a `'use client'`
 *   prop is readable with `curl`, no auth and no reveal toggle required.
 */

import { injectable, inject } from 'tsyringe';
import type { Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

/** Number of trailing characters a masked secret may disclose. */
export const SECRET_LAST_FOUR_LENGTH = 4;

/**
 * Shortest secret whose last four characters may be shown. A secret of
 * exactly four characters would otherwise be disclosed in full.
 */
export const SECRET_MIN_LENGTH_FOR_HINT = SECRET_LAST_FOUR_LENGTH * 2;

/** What the UI is allowed to know about a stored credential. */
export interface SecretPresence {
  /** True when a credential is stored, whatever its value. */
  hasValue: boolean;
  /** Last four characters, or '' when the secret is too short to hint at. */
  lastFour: string;
}

/** Presence summary for every credential `Settings` can hold. */
export interface SettingsSecretPresence {
  agentToken: SecretPresence;
  agentProviderTokens?: Record<string, SecretPresence>;
  whatsappCloudApiAccessToken: SecretPresence;
  whatsappCloudApiVerifyToken: SecretPresence;
  whatsappCloudApiAppSecret: SecretPresence;
  telegramBotToken: SecretPresence;
  telegramRouteToken: SecretPresence;
  messagingWhatsappBotToken: SecretPresence;
  messagingWhatsappRouteToken: SecretPresence;
}

export interface MaskedSettings {
  /** Settings with every credential field removed. */
  settings: Settings;
  secrets: SettingsSecretPresence;
}

/** Describe a secret without disclosing it. */
export function describeSecret(value: string | undefined | null): SecretPresence {
  if (!value) {
    return { hasValue: false, lastFour: '' };
  }
  const lastFour =
    value.length >= SECRET_MIN_LENGTH_FOR_HINT ? value.slice(-SECRET_LAST_FOUR_LENGTH) : '';
  return { hasValue: true, lastFour };
}

/**
 * Use case for loading existing settings.
 *
 * Algorithm:
 * 1. Load settings from repository
 * 2. If not found, throw error with helpful message
 * 3. Return settings
 */
@injectable()
export class LoadSettingsUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  /**
   * Execute the load settings use case.
   *
   * @returns Existing Settings, credentials included
   * @throws Error if settings don't exist
   */
  async execute(): Promise<Settings> {
    const settings = await this.settingsRepository.load();

    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    return settings;
  }

  /**
   * Execute the load and strip every credential.
   *
   * The stored object is never mutated — only the branches that carry
   * secrets are copied, so the repository's instance keeps its values.
   *
   * @returns Settings without credentials, plus what is stored for each
   * @throws Error if settings don't exist
   */
  async executeMasked(): Promise<MaskedSettings> {
    const settings = await this.execute();

    const secrets: SettingsSecretPresence = {
      agentToken: describeSecret(settings.agent?.token),
      ...(settings.agentProviders
        ? {
            agentProviderTokens: Object.fromEntries(
              settings.agentProviders.map((provider) => [
                provider.type,
                describeSecret(provider.token),
              ])
            ),
          }
        : {}),
      whatsappCloudApiAccessToken: describeSecret(settings.whatsapp?.cloudApiAccessToken),
      whatsappCloudApiVerifyToken: describeSecret(settings.whatsapp?.cloudApiVerifyToken),
      whatsappCloudApiAppSecret: describeSecret(settings.whatsapp?.cloudApiAppSecret),
      telegramBotToken: describeSecret(settings.messaging?.telegram?.botToken),
      telegramRouteToken: describeSecret(settings.messaging?.telegram?.routeToken),
      messagingWhatsappBotToken: describeSecret(settings.messaging?.whatsapp?.botToken),
      messagingWhatsappRouteToken: describeSecret(settings.messaging?.whatsapp?.routeToken),
    };

    const masked: Settings = {
      ...settings,
      agent: { ...settings.agent, token: undefined },
      ...(settings.agentProviders
        ? {
            agentProviders: settings.agentProviders.map((provider) => ({
              ...provider,
              token: undefined,
            })),
          }
        : {}),
      ...(settings.whatsapp
        ? {
            whatsapp: {
              ...settings.whatsapp,
              cloudApiAccessToken: undefined,
              cloudApiVerifyToken: undefined,
              cloudApiAppSecret: undefined,
            },
          }
        : {}),
      ...(settings.messaging
        ? {
            messaging: {
              ...settings.messaging,
              ...(settings.messaging.telegram
                ? {
                    telegram: {
                      ...settings.messaging.telegram,
                      botToken: undefined,
                      routeToken: undefined,
                    },
                  }
                : {}),
              ...(settings.messaging.whatsapp
                ? {
                    whatsapp: {
                      ...settings.messaging.whatsapp,
                      botToken: undefined,
                      routeToken: undefined,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    return { settings: masked, secrets };
  }
}
