'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type {
  SaveAgentProviderUseCase,
  SaveAgentProviderInput,
} from '@shepai/core/application/use-cases/settings/save-agent-provider.use-case';
import { updateSettings } from '@shepai/core/infrastructure/services/settings.service';
import { resolveAgentConfig } from '@shepai/core/domain/shared/agent-providers';

export async function saveAgentProvider(
  input: SaveAgentProviderInput
): Promise<{ success: boolean; hasToken?: boolean; error?: string }> {
  try {
    const settings = await resolve<SaveAgentProviderUseCase>('SaveAgentProviderUseCase').execute(
      input
    );
    updateSettings(settings);
    revalidatePath('/settings');
    return {
      success: true,
      hasToken: !input.remove && Boolean(resolveAgentConfig(settings, input.type).token),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
