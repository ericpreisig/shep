import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import { createImplementNode } from '@/infrastructure/services/agents/feature-agent/nodes/implement.node.js';
import { clearCompletedPhase } from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';

describe('implementation handoff across real checkpoints', () => {
  let dir: string;
  let state: FeatureAgentState;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-phase-'));
    state = {
      featureId: 'test',
      repositoryPath: dir,
      worktreePath: dir,
      specDir: dir,
      model: 'codex-profile:deepseek',
      currentNode: 'implement',
      messages: [],
      enableEvidence: false,
    } as unknown as FeatureAgentState;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fixture(parallel = false) {
    const tasks = ['t1', 't2'].map((id, i) => ({
      id,
      phaseId: parallel ? 'p1' : `p${i + 1}`,
      title: id,
      description: id,
      state: 'Todo',
      dependencies: [],
      acceptanceCriteria: ['works'],
      tdd: null,
      estimatedEffort: '1m',
    }));
    const phases = parallel
      ? [{ id: 'p1', name: 'Work', parallel: true }]
      : [
          { id: 'p1', name: 'First', parallel: false },
          { id: 'p2', name: 'Second', parallel: false },
          { id: 'empty', name: 'Empty trailing phase', parallel: false },
        ];
    for (const [file, data] of Object.entries({
      'plan.yaml': { phases },
      'tasks.yaml': { tasks },
      'feature.yaml': { feature: { name: 'test' }, status: { completedPhases: [] } },
      'spec.yaml': { name: 'test' },
      'research.yaml': { name: 'test' },
    })) {
      writeFileSync(join(dir, file), yaml.dump(data));
    }
  }

  function executor(run: (prompt: string) => Promise<{ result: string }>): IAgentExecutor {
    return {
      agentType: 'codex-cli',
      execute: vi.fn(run),
      executeStream: vi.fn(),
      supportsFeature: () => true,
    } as unknown as IAgentExecutor;
  }

  it('carries verified commands into the next session and restores them on resume', async () => {
    fixture();
    const prompts: string[] = [];
    const agent = executor(async (prompt) => {
      prompts.push(prompt);
      return {
        result:
          prompts.length === 1
            ? '## Phase handoff\nFiles: player.cs\nDecisions: retain API\nChecks: dotnet build passed\nRemaining: UI'
            : '## Phase handoff\nChecks: all final checks passed',
      };
    });
    const result = await createImplementNode(agent)(state);
    expect(result.error).toBeUndefined();
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toContain('Run full project validation');
    expect(prompts[1]).toContain('Run full project validation');
    expect(prompts[1]).toContain('dotnet build passed');
    const stored = yaml.load(readFileSync(join(dir, 'feature.yaml'), 'utf8')) as {
      status: { completedPhases: string[]; phaseHandoffs: Record<string, { summary: string }> };
    };
    expect(stored.status.completedPhases).toEqual(['p1', 'p2']);
    expect(stored.status.phaseHandoffs.p1.summary).toContain('player.cs');
    clearCompletedPhase(dir, 'p2');
    const resumed: string[] = [];
    await createImplementNode(
      executor(async (prompt) => {
        resumed.push(prompt);
        return { result: 'resumed' };
      })
    )(state);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toContain('dotnet build passed');
    expect(resumed[0]).not.toContain('all final checks passed');
  });

  it('validates parallel results only after every task has finished and checkpoints afterwards', async () => {
    fixture(true);
    const finished = new Set<string>();
    let validationCount = 0;
    const agent = executor(async (prompt) => {
      if (prompt.includes('Run full project validation')) {
        validationCount++;
        expect(finished.size).toBe(2);
        const checkpoint = yaml.load(readFileSync(join(dir, 'feature.yaml'), 'utf8')) as {
          status: { completedPhases: string[] };
        };
        expect(checkpoint.status.completedPhases).toEqual([]);
      } else {
        const id = prompt.includes('### Task t1:') ? 't1' : 't2';
        if (id === 't1') await new Promise((resolve) => setTimeout(resolve, 10));
        finished.add(id);
      }
      return { result: '## Phase handoff\nChecks: passed' };
    });
    const result = await createImplementNode(agent)(state);
    expect(result.error).toBeUndefined();
    expect(validationCount).toBe(1);
    const final = yaml.load(readFileSync(join(dir, 'feature.yaml'), 'utf8')) as {
      status: { completedPhases: string[] };
    };
    expect(final.status.completedPhases).toEqual(['p1']);
  });

  it('does not complete the final phase when integrated validation fails', async () => {
    fixture(true);
    const result = createImplementNode(
      executor(async (prompt) => {
        if (prompt.includes('Run full project validation'))
          throw new Error('Agent authentication failed: validation unavailable');
        return { result: '## Phase handoff\nChecks: targeted checks passed' };
      })
    )(state);
    await expect(result).rejects.toThrow('validation unavailable');
    const data = yaml.load(readFileSync(join(dir, 'feature.yaml'), 'utf8')) as {
      status: { completedPhases: string[]; phaseHandoffs?: Record<string, unknown> };
    };
    expect(data.status.completedPhases).toEqual([]);
    expect(data.status.phaseHandoffs?.p1).toBeUndefined();
  });
});
