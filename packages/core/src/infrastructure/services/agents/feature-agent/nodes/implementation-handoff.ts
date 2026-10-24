import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImplementationPhaseHandoff } from '@/domain/generated/output.js';
import { redactLogLine } from '../../../logging/redact-log-line.js';
import { readSpecFile, safeYamlLoad, safeYamlDump } from './node-helpers.js';

const MAX_SUMMARY_CHARS = 6000;
const MAX_CONTEXT_CHARS = 12000;

/** Reuse the executor's final report; no extra model call is needed. */
export function compactPhaseHandoff(result: string): string {
  const safe = redactLogLine(result);
  const heading = [...safe.matchAll(/^## Phase handoff\b/gim)].at(-1);
  return (heading ? safe.slice(heading.index) : safe.slice(-MAX_SUMMARY_CHARS))
    .slice(0, MAX_SUMMARY_CHARS)
    .trim();
}

export function writePhaseHandoff(
  specDir: string,
  phaseId: string,
  summary: string,
  log: { error(message: string): void }
): void {
  try {
    const content = readSpecFile(specDir, 'feature.yaml');
    if (!content) return;
    const data = safeYamlLoad(content) as { status?: Record<string, unknown> };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const status = data.status ?? {};
    data.status = {
      ...status,
      phaseHandoffs: {
        ...(status.phaseHandoffs as Record<string, ImplementationPhaseHandoff> | undefined),
        [phaseId]: {
          summary: redactLogLine(summary).slice(-MAX_SUMMARY_CHARS),
          completedAt: new Date().toISOString(),
        },
      },
    };
    writeFileSync(join(specDir, 'feature.yaml'), safeYamlDump(data), 'utf8');
  } catch (error) {
    log.error(
      `Failed to save phase handoff: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Ignore invalidated checkpoints and bound the context carried into each fresh session. */
export function readPhaseHandoffs(specDir: string): string {
  try {
    const data = safeYamlLoad(readSpecFile(specDir, 'feature.yaml')) as {
      status?: {
        completedPhases?: string[];
        phaseHandoffs?: Record<string, ImplementationPhaseHandoff>;
      };
    };
    const status = data?.status;
    if (!Array.isArray(status?.completedPhases)) return '';
    const ids = status.completedPhases
      .filter((id) => typeof status.phaseHandoffs?.[id]?.summary === 'string')
      .slice(-3);
    if (!ids.length) return '';
    const budget = Math.floor(MAX_CONTEXT_CHARS / ids.length) - 100;
    const notes = ids
      .map((id) => `### ${id}\n${redactLogLine(status.phaseHandoffs![id].summary).slice(-budget)}`)
      .join('\n\n');
    return `## Completed phase handoffs (agent-reported)\n\nReuse these decisions and check results. Inspect affected files; repeat checks when their inputs change or final validation requires them.\n\n${notes}\n\n`;
  } catch {
    return '';
  }
}
