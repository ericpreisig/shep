import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeHookRunner } from '@/infrastructure/services/git/worktree-hook-runner.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import type { Settings, WorktreeConfig } from '@/domain/generated/output.js';

const exec = promisify(execFile);

describe('fresh worktree preparation', () => {
  let root: string;
  let repo: string;
  let worktree: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'shep-prepare-'));
    repo = join(root, 'repo');
    worktree = join(root, 'worktree');
    await mkdir(join(repo, 'assets'), { recursive: true });
    await exec('git', ['init', '-b', 'main', repo]);
    await writeFile(join(repo, '.gitignore'), 'assets/local/\n');
    await writeFile(join(repo, 'assets/tracked.txt'), 'branch file');
    await exec('git', ['add', '.'], { cwd: repo });
    await exec(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'],
      { cwd: repo }
    );
    await exec('git', ['worktree', 'add', '-b', 'test', worktree], { cwd: repo });
    await mkdir(join(repo, 'assets/local'));
    await writeFile(join(repo, 'assets/local/ignored.txt'), 'local media');
    await writeFile(join(repo, 'assets/untracked.txt'), 'local source');
    await writeFile(join(repo, 'outside.txt'), 'not selected');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runner(config: WorktreeConfig) {
    const provider = {
      has: () => true,
      get: () => ({ worktree: config }) as Settings,
    } as ISettingsProvider;
    return new WorktreeHookRunner(exec, provider);
  }
  function prepare(config: WorktreeConfig) {
    return runner(config).runPostCreateHook({
      repoPath: repo,
      worktreePath: worktree,
      branch: 'test',
    });
  }

  it('copies selected ignored and untracked files before running the build hook', async () => {
    // The hook sees the hydrated files and produces an artifact before an agent starts.
    const script = join(root, 'prepare.cjs');
    await writeFile(
      script,
      "const fs=require('node:fs'); fs.writeFileSync('built.txt', fs.readFileSync('assets/local/ignored.txt'));"
    );
    await prepare({
      copyPaths: ['assets'],
      postCreateCommand: `"${process.execPath}" "${script}"`,
    });
    expect(await readFile(join(worktree, 'built.txt'), 'utf8')).toBe('local media');
    expect(await readFile(join(worktree, 'assets/untracked.txt'), 'utf8')).toBe('local source');
    await expect(access(join(worktree, 'outside.txt'))).rejects.toThrow();
  });

  it('preserves existing and tracked files, even when a target tracked file is missing', async () => {
    await writeFile(join(worktree, 'assets/untracked.txt'), 'keep existing');
    await exec('git', ['add', 'assets/untracked.txt'], { cwd: worktree });
    await rm(join(worktree, 'assets/untracked.txt'));
    await mkdir(join(worktree, 'assets/local'), { recursive: true });
    await writeFile(join(worktree, 'assets/local/ignored.txt'), 'keep worktree');
    await writeFile(join(repo, 'assets/tracked.txt'), 'dirty source');
    await prepare({ copyPaths: ['assets', 'not-present'] });
    expect(await readFile(join(worktree, 'assets/tracked.txt'), 'utf8')).toBe('branch file');
    expect(await readFile(join(worktree, 'assets/local/ignored.txt'), 'utf8')).toBe(
      'keep worktree'
    );
    await expect(access(join(worktree, 'assets/untracked.txt'))).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'rejects destination symlink escapes before the hook writes anything',
    async () => {
      const outside = join(root, 'outside');
      await mkdir(outside);
      await symlink(outside, join(worktree, 'assets/local'), 'dir');
      await expect(prepare({ copyPaths: ['assets'], postCreateCommand: 'exit 0' })).rejects.toThrow(
        /symlink/i
      );
      await expect(access(join(outside, 'ignored.txt'))).rejects.toThrow();
    }
  );

  it.skipIf(process.platform === 'win32')(
    'rejects source symlinks and reports preparation/build failures',
    async () => {
      await symlink(join(root, 'private'), join(repo, 'assets/link'));
      await expect(prepare({ copyPaths: ['assets'] })).rejects.toThrow(/symlink/i);
      await rm(join(repo, 'assets/link'));
      await expect(
        prepare({ copyPaths: ['assets'], postCreateCommand: 'exit 7' })
      ).rejects.toMatchObject({ code: 'HOOK_FAILED' });
    }
  );
});
