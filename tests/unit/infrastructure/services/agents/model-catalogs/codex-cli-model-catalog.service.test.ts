/**
 * CodexCliModelCatalogService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CodexCliModelCatalogService,
  createCodexListModels,
  parseCodexDebugModelsOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/codex-cli-model-catalog.service.js';
import {
  MODEL_CATALOG_FETCH_TIMEOUT_MS,
  MODEL_CATALOG_TTL_MS,
} from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';
import { CODEX_CLI_MODELS } from '@/infrastructure/services/agents/common/agent-model-catalog.js';

const FIXTURE = JSON.stringify({
  models: [
    {
      slug: 'gpt-5.4',
      display_name: 'GPT-5.4',
      description: 'Flagship',
      context_window: 200000,
      visibility: 'list',
    },
    {
      slug: 'hidden-internal',
      display_name: 'Hidden',
      visibility: 'hidden',
    },
  ],
});

describe('parseCodexDebugModelsOutput', () => {
  it('maps slug/display_name and skips non-list visibility', () => {
    expect(parseCodexDebugModelsOutput(FIXTURE)).toEqual([
      {
        id: 'gpt-5.4',
        displayName: 'GPT-5.4',
        description: 'Flagship',
        contextLength: 200000,
      },
    ]);
  });

  it('returns empty on invalid JSON', () => {
    expect(parseCodexDebugModelsOutput('not-json')).toEqual([]);
  });
});

describe('CodexCliModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches within the shared TTL', async () => {
    const run = vi.fn().mockResolvedValue(FIXTURE);
    const catalog = new CodexCliModelCatalogService(run, () => []);

    await catalog.listModels();
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns last-good when a later fetch fails', async () => {
    const run = vi.fn().mockResolvedValueOnce(FIXTURE).mockRejectedValueOnce(new Error('timeout'));
    const catalog = new CodexCliModelCatalogService(run, () => []);

    const first = await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    const second = await catalog.listModels();

    expect(second).toEqual(first);
    expect(second.map((l) => l.id)).toContain('gpt-5.4');
  });

  it('returns an empty list when the runner fails and there is no cache', async () => {
    const run = vi.fn().mockRejectedValue(new Error('codex not found'));
    const catalog = new CodexCliModelCatalogService(run, () => []);

    await expect(catalog.listModels()).resolves.toEqual([]);
  });

  it('offers native profiles alongside the default model catalog', async () => {
    const profile = { id: 'codex-profile:deepseek', displayName: 'deepseek (Codex profile)' };
    const catalog = new CodexCliModelCatalogService(vi.fn().mockResolvedValue(FIXTURE), () => [
      profile,
    ]);

    expect((await catalog.listModels()).map((entry) => entry.id)).toEqual([
      'gpt-5.4',
      'codex-profile:deepseek',
    ]);
  });

  it('still offers profiles when default-account discovery fails', async () => {
    const profile = { id: 'codex-profile:deepseek' };
    const catalog = new CodexCliModelCatalogService(
      vi.fn().mockRejectedValue(new Error('default login unavailable')),
      () => [profile]
    );

    await expect(catalog.listModels()).resolves.toEqual([
      ...CODEX_CLI_MODELS.map((id) => ({ id })),
      profile,
    ]);
  });

  it('refreshes profile additions and removals while the native catalog stays cached', async () => {
    const run = vi.fn().mockResolvedValue(FIXTURE);
    let profiles = [{ id: 'codex-profile:deepseek' }];
    const catalog = new CodexCliModelCatalogService(run, () => profiles);

    expect((await catalog.listModels()).map((entry) => entry.id)).toContain(
      'codex-profile:deepseek'
    );
    profiles = [{ id: 'codex-profile:review' }];
    expect((await catalog.listModels()).map((entry) => entry.id)).toEqual([
      'gpt-5.4',
      'codex-profile:review',
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('createCodexListModels', () => {
  it('runs `codex debug models` through the injected ExecFunction', async () => {
    // The ExecFunction resolves `codex.cmd` on Windows; a bare execFile
    // cannot, which left Windows users with the static fallback list.
    const exec = vi.fn().mockResolvedValue({ stdout: FIXTURE, stderr: '' });

    await expect(createCodexListModels(exec)()).resolves.toBe(FIXTURE);
    expect(exec).toHaveBeenCalledWith(
      'codex',
      ['debug', 'models'],
      expect.objectContaining({ timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS, windowsHide: true })
    );
  });
});
