import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getCodexProfileName,
  listCodexProfileModels,
} from '@/infrastructure/services/agents/common/codex-profiles.js';

describe('Codex profile model choices', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'shep-codex-profiles-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('lists native profile filenames without returning configuration or credentials', () => {
    writeFileSync(join(configDir, 'deepseek.config.toml'), 'token = "SECRET_SENTINEL"');
    writeFileSync(join(configDir, 'review.config.toml'), '');
    writeFileSync(join(configDir, 'config.toml'), '');
    writeFileSync(join(configDir, 'auth.json'), '');
    writeFileSync(join(configDir, 'bad.name.config.toml'), '');
    mkdirSync(join(configDir, 'directory.config.toml'));

    const listings = listCodexProfileModels(configDir);

    expect(listings.map((entry) => entry.id)).toEqual([
      'codex-profile:deepseek',
      'codex-profile:review',
    ]);
    expect(listings[0].displayName).toContain('deepseek');
    expect(JSON.stringify(listings)).not.toContain('SECRET_SENTINEL');
  });

  it.skipIf(process.platform === 'win32')('supports symlinked Stow profiles', () => {
    const source = join(configDir, 'source.toml');
    writeFileSync(source, '');
    symlinkSync(source, join(configDir, 'linked.config.toml'));

    expect(listCodexProfileModels(configDir).map((entry) => entry.id)).toEqual([
      'codex-profile:linked',
    ]);
  });

  it('returns no profile choices when the config directory does not exist', () => {
    expect(listCodexProfileModels(join(configDir, 'missing'))).toEqual([]);
  });

  it('keeps native model ids distinct from profile selections', () => {
    expect(getCodexProfileName('codex-profile:deepseek')).toBe('deepseek');
    expect(getCodexProfileName('codex-profile:review_2-fast')).toBe('review_2-fast');
    expect(getCodexProfileName('gpt-6.1-sol')).toBeUndefined();
    expect(getCodexProfileName('deepseek/deepseek-v4.1-flash')).toBeUndefined();
    expect(getCodexProfileName()).toBeUndefined();
  });

  it.each(['codex-profile:', 'codex-profile:../secret', 'codex-profile:a/b'])(
    'rejects invalid native profile names: %s',
    (id) => expect(() => getCodexProfileName(id)).toThrow('Invalid Codex profile')
  );
});
