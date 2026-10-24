import { describe, expect, it } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { OpenCodeInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/opencode-interactive-executor.service.js';
import { fakeAcpSpawn } from '@tests/helpers/fake-acp-agent.js';

const FREE = 'opencode/deepseek-v4.1-flash-free';
const GO = 'opencode-go/deepseek-v4.1-flash';
const configOptions: SessionConfigOption[] = [
  {
    id: 'model',
    category: 'model',
    name: 'Model',
    type: 'select',
    currentValue: 'provider/paid-default',
    options: [
      { value: FREE, name: 'Free' },
      { value: GO, name: 'Go' },
    ],
  },
];

describe('OpenCode interactive integration', () => {
  it.each([undefined, GO])(
    'explicitly selects %s or the free default and supports multiple turns',
    async (model) => {
      const fake = fakeAcpSpawn({ configOptions });
      const handle = await new OpenCodeInteractiveExecutor(fake.spawn).createSession({
        cwd: '/repo',
        model,
      });
      try {
        expect(fake.records[0].configSets).toEqual([{ configId: 'model', value: model ?? FREE }]);
        for (const prompt of ['Hello', 'Adjust this']) {
          await handle.send(prompt);
          const events = [];
          for await (const event of handle.stream()) events.push(event);
          expect(events).toContainEqual(expect.objectContaining({ type: 'done' }));
          expect(fake.records[0].prompts.at(-1)?.text).toBe(prompt);
        }
      } finally {
        await handle.close();
      }
    }
  );

  it('refuses to use a paid default when the requested free model is unavailable', async () => {
    const fake = fakeAcpSpawn({ configOptions: [] });
    const attempt = new OpenCodeInteractiveExecutor(fake.spawn).createSession({
      cwd: '/repo',
      model: FREE,
    });
    try {
      await expect(attempt).rejects.toThrow('requested model');
    } finally {
      const handle = await attempt.catch(() => undefined);
      await handle?.close();
    }
    expect(fake.records[0].prompts).toEqual([]);
  });
});
