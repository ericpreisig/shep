import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import {
  compactPhaseHandoff,
  readPhaseHandoffs,
  writePhaseHandoff,
} from '@/infrastructure/services/agents/feature-agent/nodes/implementation-handoff.js';

describe('durable implementation handoffs', () => {
  let dir: string;
  const log = { error: vi.fn() };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-handoff-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('keeps the final handoff, redacts secrets and bounds legacy freeform output', () => {
    expect(compactPhaseHandoff('noise\n## Phase handoff\nChanged: game.cs\nChecks: passed')).toBe(
      '## Phase handoff\nChanged: game.cs\nChecks: passed'
    );
    const token = `sk-${'x'.repeat(48)}`;
    expect(compactPhaseHandoff(`## Phase handoff\nAPI_KEY=${token}`)).not.toContain(token);
    expect(compactPhaseHandoff('x'.repeat(50000)).length).toBeLessThanOrEqual(6000);
  });

  it('preserves feature metadata and restores only completed handoffs after resume', () => {
    writeFileSync(
      join(dir, 'feature.yaml'),
      yaml.dump({
        feature: { name: 'demo' },
        status: { completedPhases: ['p1'], progress: { total: 2 } },
      })
    );
    writePhaseHandoff(dir, 'p1', 'Files: game.cs\nChecks: dotnet build passed\nRemaining: UI', log);
    writePhaseHandoff(dir, 'p2', 'invalidated stale result', log);
    const data = yaml.load(readFileSync(join(dir, 'feature.yaml'), 'utf8')) as {
      feature: { name: string };
      status: { progress: { total: number } };
    };
    expect(data.feature.name).toBe('demo');
    expect(data.status.progress.total).toBe(2);
    expect(readPhaseHandoffs(dir)).toContain('dotnet build passed');
    expect(readPhaseHandoffs(dir)).not.toContain('invalidated stale');
  });

  it('bounds combined context and tolerates missing or malformed legacy metadata', () => {
    expect(readPhaseHandoffs(dir)).toBe('');
    writeFileSync(join(dir, 'feature.yaml'), 'invalid: [');
    expect(readPhaseHandoffs(dir)).toBe('');
    writeFileSync(
      join(dir, 'feature.yaml'),
      yaml.dump({ status: { completedPhases: ['a', 'b', 'c', 'd'] } })
    );
    for (const id of ['a', 'b', 'c', 'd'])
      writePhaseHandoff(dir, id, `${id}:${'x'.repeat(20000)}`, log);
    const context = readPhaseHandoffs(dir);
    expect(context.length).toBeLessThanOrEqual(12500);
    expect(context).not.toContain('### a');
    expect(context).toContain('### d');
  });
});
