'use server';

import { resolve } from '@/lib/server-container';
import type { ReparentFeatureUseCase } from '@shepai/core/application/use-cases/features/reparent-feature.use-case';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';

export async function listFeatureParentChoices(
  repositoryPath: string
): Promise<{ id: string; name: string }[]> {
  const features = await resolve<IFeatureRepository>('IFeatureRepository').list({
    repositoryPath,
    includeArchived: true,
  });
  return features.map(({ id, name }) => ({ id, name }));
}

export async function reparentFeature(
  featureId: string,
  parentId: string | string[] | null
): Promise<{ success: boolean; error?: string }> {
  if (!featureId.trim()) {
    return { success: false, error: 'Feature id is required' };
  }

  try {
    const useCase = resolve<ReparentFeatureUseCase>('ReparentFeatureUseCase');
    await useCase.execute({
      featureId,
      parentIds: Array.isArray(parentId) ? parentId : parentId ? [parentId] : [],
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reparent feature';
    return { success: false, error: message };
  }
}
