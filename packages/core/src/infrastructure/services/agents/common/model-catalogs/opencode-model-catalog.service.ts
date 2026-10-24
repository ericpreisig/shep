import { stripVTControlCharacters } from 'node:util';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { ExecFunction } from '../../../git/worktree.service.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';

export type OpenCodeListModels = () => Promise<string>;

export function parseOpenCodeModelsOutput(stdout: string): AgentModelListing[] {
  // Native discovery returns full provider/model IDs, including connected Go accounts.
  const ids = new Set(
    stripVTControlCharacters(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((id) => /^[\w.-]+\/[\w./:#-]+$/.test(id))
  );
  return [...ids].map((id) => ({
    id,
    displayName:
      id === 'opencode/deepseek-v4.1-flash-free'
        ? 'DeepSeek V4.1 Flash Free'
        : id.startsWith('opencode-go/')
          ? `${id.slice('opencode-go/'.length)} · Go`
          : id,
  }));
}

export function createOpenCodeListModels(exec: ExecFunction): OpenCodeListModels {
  return async () => {
    const { stdout } = await exec('opencode', ['models'], {
      timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return String(stdout);
  };
}

export class OpenCodeModelCatalogService extends TtlModelCatalog {
  constructor(private readonly list: OpenCodeListModels) {
    super(30_000);
  }
  protected async fetchModels(): Promise<AgentModelListing[]> {
    return parseOpenCodeModelsOutput(await this.list());
  }
}
