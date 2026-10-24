'use server';

import { resolve } from '@/lib/server-container';
import type { GetProjectMindMapUseCase } from '@shepai/core/application/use-cases/mind-map/get-project-mind-map.use-case';
import type { IRepositoryRepository } from '@shepai/core/application/ports/output/repositories/repository-repository.interface';
import type { ProjectMindMap } from '@shepai/core/domain/generated/output';
import type { ProjectAnalysisSummary } from '@shepai/core/domain/generated/output';
import type { AnalyzeProjectUseCase } from '@shepai/core/application/use-cases/mind-map/analyze-project.use-case';

export interface MindMapProjectOption {
  id: string;
  name: string;
}
export interface MindMapPageData {
  repository: MindMapProjectOption;
  features: { id: string; name: string; description: string; lifecycle: string }[];
  map: ProjectMindMap;
  generating: boolean;
  error?: string;
  analyzing?: boolean;
  analysis?: ProjectAnalysisSummary;
}

export async function analyzeProject(
  repositoryId: string
): Promise<{ accepted?: boolean; error?: string }> {
  try {
    return await resolve<AnalyzeProjectUseCase>('AnalyzeProjectUseCase').execute(repositoryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function listMindMapProjects(): Promise<MindMapProjectOption[]> {
  return (await resolve<IRepositoryRepository>('IRepositoryRepository').list()).map(
    ({ id, name }) => ({ id, name })
  );
}

export async function getProjectMindMap(
  repositoryId: string,
  force = false
): Promise<{ data?: MindMapPageData; error?: string }> {
  try {
    const result = await resolve<GetProjectMindMapUseCase>('GetProjectMindMapUseCase').execute(
      repositoryId,
      force
    );
    return {
      data: {
        ...result,
        repository: { id: result.repository.id, name: result.repository.name },
        features: result.features.map(({ id, name, description, lifecycle }) => ({
          id,
          name,
          description,
          lifecycle,
        })),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
