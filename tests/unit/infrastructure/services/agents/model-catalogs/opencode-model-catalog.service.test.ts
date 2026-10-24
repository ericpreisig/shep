import { describe, expect, it, vi } from 'vitest';
import {
  OpenCodeModelCatalogService,
  parseOpenCodeModelsOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/opencode-model-catalog.service.js';

describe('OpenCode model catalog', () => {
  it('preserves free and Go provider/model identifiers, deduplicates and ignores noise', () => {
    expect(
      parseOpenCodeModelsOutput(
        '\u001b[32mopencode/deepseek-v4.1-flash-free\u001b[0m\n\nopencode-go/deepseek-v4.1-flash\nopencode-go/deepseek-v4.1-flash\nLoading models...\n'
      )
    ).toEqual([
      { id: 'opencode/deepseek-v4.1-flash-free', displayName: 'DeepSeek V4.1 Flash Free' },
      { id: 'opencode-go/deepseek-v4.1-flash', displayName: 'deepseek-v4.1-flash · Go' },
    ]);
  });
  it('uses existing TTL discovery without making model-generation requests', async () => {
    const list = vi
      .fn()
      .mockResolvedValue('opencode/deepseek-v4.1-flash-free\nopencode-go/deepseek-v4.1-flash');
    const catalog = new OpenCodeModelCatalogService(list);
    expect(await catalog.listModels()).toHaveLength(2);
    expect(await catalog.listModels()).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
