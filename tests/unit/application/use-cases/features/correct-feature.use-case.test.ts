import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { CorrectFeatureUseCase } from '@/application/use-cases/features/correct-feature.use-case.js';
import { AgentRunStatus, SdlcLifecycle, type Feature } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '@tests/helpers/feature-repository.mock.js';

describe('CorrectFeatureUseCase', () => {
  it('stops the writer before persisting and resumes with durable corrections', async () => {
    const order: string[] = [];
    const feature = {
      id: 'feature',
      agentRunId: 'run',
      lifecycle: SdlcLifecycle.Implementation,
      executionCorrections: ['Earlier correction'],
    } as Feature;
    const features = createMockFeatureRepository({
      findById: vi.fn().mockResolvedValue(feature),
      update: vi.fn(async () => {
        order.push('persist');
      }),
    });
    const runs = {
      findById: vi.fn().mockResolvedValue({ id: 'run', status: AgentRunStatus.running }),
    };
    const stop = {
      execute: vi.fn(async () => {
        order.push('stop');
        return { stopped: true };
      }),
    };
    const resume = {
      execute: vi.fn(async () => {
        order.push('resume');
      }),
    };
    const reject = { execute: vi.fn() };
    const useCase = new CorrectFeatureUseCase(
      features,
      runs as never,
      stop as never,
      resume as never,
      reject as never
    );
    await useCase.execute('feature', '  Keep the existing combat, change only its colors.  ');
    expect(order).toEqual(['stop', 'persist', 'resume']);
    expect(features.update).toHaveBeenCalledWith(
      expect.objectContaining({
        executionCorrections: [
          'Earlier correction',
          'Keep the existing combat, change only its colors.',
        ],
      })
    );
    expect(resume.execute).toHaveBeenCalledWith('feature');
  });

  it('refuses an empty correction before stopping anything', async () => {
    const features = createMockFeatureRepository();
    const stop = { execute: vi.fn() };
    const useCase = new CorrectFeatureUseCase(
      features,
      {} as never,
      stop as never,
      {} as never,
      {} as never
    );
    await expect(useCase.execute('feature', ' ')).rejects.toThrow(/required/i);
    expect(stop.execute).not.toHaveBeenCalled();
  });

  it('does not start a new writer if stopping the old writer failed', async () => {
    const features = createMockFeatureRepository({
      findById: vi.fn().mockResolvedValue({
        id: 'feature',
        agentRunId: 'run',
        lifecycle: SdlcLifecycle.Implementation,
      }),
    });
    const runs = { findById: vi.fn().mockResolvedValue({ status: AgentRunStatus.running }) };
    const stop = { execute: vi.fn().mockResolvedValue({ stopped: false, reason: 'Run changed' }) };
    const resume = { execute: vi.fn() };
    const useCase = new CorrectFeatureUseCase(
      features,
      runs as never,
      stop as never,
      resume as never,
      {} as never
    );
    await expect(useCase.execute('feature', 'Correct this')).rejects.toThrow('Run changed');
    expect(features.update).not.toHaveBeenCalled();
    expect(resume.execute).not.toHaveBeenCalled();
  });
});
