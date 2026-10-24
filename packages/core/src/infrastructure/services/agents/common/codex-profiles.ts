import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentModelListing } from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';

const PROFILE_PREFIX = 'codex-profile:';
const PROFILE_NAME = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;
const PROFILE_SUFFIX = '.config.toml';

/** Model identifiers for native profiles keep model, provider and auth together. */
export function getCodexProfileName(modelId?: string): string | undefined {
  if (!modelId?.startsWith(PROFILE_PREFIX)) return undefined;
  const name = modelId.slice(PROFILE_PREFIX.length);
  if (!PROFILE_NAME.test(name)) throw new Error('Invalid Codex profile name');
  return name;
}

/** Read filenames only; Codex owns TOML parsing and credential resolution. */
export function listCodexProfileModels(
  configDir = process.env.CODEX_HOME ?? join(homedir(), '.codex')
): AgentModelListing[] {
  try {
    return readdirSync(configDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() || entry.isSymbolicLink())
      .map((entry) =>
        entry.name.endsWith(PROFILE_SUFFIX) ? entry.name.slice(0, -PROFILE_SUFFIX.length) : ''
      )
      .filter((name) => PROFILE_NAME.test(name))
      .sort()
      .map((name) => ({
        id: `${PROFILE_PREFIX}${name}`,
        displayName: `${name} (Codex profile)`,
        description: `Uses the model, provider and authentication from the Codex profile "${name}".`,
      }));
  } catch {
    return [];
  }
}
