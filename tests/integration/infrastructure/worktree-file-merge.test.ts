import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeService } from '@/infrastructure/services/git/worktree.service.js';
import { WorktreeHookRunner } from '@/infrastructure/services/git/worktree-hook-runner.js';
import { GitPrService } from '@/infrastructure/services/git/git-pr.service.js';
import type { Settings, WorktreeConfig } from '@/domain/generated/output.js';

const exec = promisify(execFile);
describe('configured local files at merge', () => {
  let root: string;
  let repo: string;
  let wt: string;
  let service: WorktreeService;
  let config: WorktreeConfig;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'shep-files-'));
    repo = join(root, 'repo');
    wt = join(root, 'wt');
    await mkdir(join(repo, 'assets'), { recursive: true });
    await exec('git', ['init', '-b', 'main', repo]);
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repo });
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    await writeFile(join(repo, '.gitignore'), 'assets/\n');
    await writeFile(join(repo, 'code.txt'), 'original');
    await writeFile(join(repo, 'assets/tracked.txt'), 'Git owns this');
    await exec('git', ['add', '.'], { cwd: repo });
    await exec('git', ['add', '-f', 'assets/tracked.txt'], { cwd: repo });
    await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
    await writeFile(join(repo, 'assets/original.png'), 'initial media');
    config = { copyPaths: ['assets'] };
    const provider = { has: () => true, get: () => ({ worktree: config }) as Settings };
    service = new WorktreeService(exec, new WorktreeHookRunner(exec, provider));
    await service.create(repo, 'feat/assets', wt, 'main');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const merge = async () => service.mergeFiles(repo, wt, 'feat/assets');

  it('returns ignored additions and edits before the worktree is deleted after a real squash merge', async () => {
    await writeFile(join(wt, 'code.txt'), 'merged code');
    await exec('git', ['add', 'code.txt'], { cwd: wt });
    await exec('git', ['commit', '-m', 'feature'], { cwd: wt });
    await writeFile(join(wt, 'assets/new.png'), 'new media');
    await writeFile(join(wt, 'assets/original.png'), 'edited media');
    await writeFile(join(wt, 'outside.txt'), 'not selected');
    await new GitPrService(exec).localMergeSquash(repo, 'feat/assets', 'main', 'merge');
    await merge();
    await service.remove(repo, wt, true);
    expect(await readFile(join(repo, 'code.txt'), 'utf8')).toBe('merged code');
    expect(await readFile(join(repo, 'assets/new.png'), 'utf8')).toBe('new media');
    expect(await readFile(join(repo, 'assets/original.png'), 'utf8')).toBe('edited media');
    await expect(access(join(repo, 'outside.txt'))).rejects.toThrow();
  });
  it('preserves main edits when the source is unchanged and is idempotent', async () => {
    await writeFile(join(repo, 'assets/original.png'), 'concurrent main');
    await writeFile(join(wt, 'assets/new.png'), 'new media');
    await merge();
    await merge();
    expect(await readFile(join(repo, 'assets/original.png'), 'utf8')).toBe('concurrent main');
    expect(await readFile(join(repo, 'assets/new.png'), 'utf8')).toBe('new media');
  });
  it('detects conflicting edits before copying anything and keeps the source', async () => {
    await writeFile(join(repo, 'assets/original.png'), 'main edit');
    await writeFile(join(wt, 'assets/original.png'), 'feature edit');
    await writeFile(join(wt, 'assets/new.png'), 'pending media');
    await expect(merge()).rejects.toThrow(/conflict.*assets\/original.png/i);
    await expect(access(join(repo, 'assets/new.png'))).rejects.toThrow();
    expect(await readFile(join(wt, 'assets/new.png'), 'utf8')).toBe('pending media');
    expect(await readFile(join(repo, 'assets/original.png'), 'utf8')).toBe('main edit');
  });
  it('accepts matching concurrent changes and never touches tracked files', async () => {
    await writeFile(join(repo, 'assets/original.png'), 'same edit');
    await writeFile(join(wt, 'assets/original.png'), 'same edit');
    await writeFile(join(wt, 'assets/tracked.txt'), 'uncommitted source');
    await rm(join(repo, 'assets/tracked.txt'));
    await merge();
    await expect(access(join(repo, 'assets/tracked.txt'))).rejects.toThrow();
  });
  it('recovers missing files from a legacy worktree but refuses ambiguous overwrites', async () => {
    const { stdout } = await exec('git', ['rev-parse', '--git-path', 'shep-worktree-files.json'], {
      cwd: wt,
    });
    await rm(resolve(wt, stdout.trim()), { force: true });
    await writeFile(join(wt, 'assets/new.png'), 'legacy media');
    await merge();
    expect(await readFile(join(repo, 'assets/new.png'), 'utf8')).toBe('legacy media');
    await writeFile(join(wt, 'assets/original.png'), 'ambiguous edit');
    await expect(merge()).rejects.toThrow(/conflict/i);
  });
  it('returns files already supplied by a custom/adopted worktree during preparation', async () => {
    const { stdout } = await exec('git', ['rev-parse', '--git-path', 'shep-worktree-files.json'], {
      cwd: wt,
    });
    await rm(resolve(wt, stdout.trim()));
    await writeFile(join(wt, 'assets/custom.png'), 'custom media');
    await writeFile(join(wt, 'assets/original.png'), 'custom edit');
    await new WorktreeHookRunner(exec, {
      has: () => true,
      get: () => ({ worktree: config }) as Settings,
    }).runPostCreateHook({ repoPath: repo, worktreePath: wt, branch: 'feat/assets' });
    await merge();
    expect(await readFile(join(repo, 'assets/custom.png'), 'utf8')).toBe('custom media');
    expect(await readFile(join(repo, 'assets/original.png'), 'utf8')).toBe('custom edit');
  });
  it('uses the same allowlist and does nothing when copying is disabled', async () => {
    config.copyPaths = [];
    await writeFile(join(wt, 'assets/new.png'), 'not selected');
    await merge();
    await expect(access(join(repo, 'assets/new.png'))).rejects.toThrow();
  });
  it.skipIf(process.platform === 'win32')('rejects symlink escapes into main', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await symlink(outside, join(repo, 'assets/escape'), 'dir');
    await mkdir(join(wt, 'assets/escape'));
    await writeFile(join(wt, 'assets/escape/new.png'), 'blocked');
    await expect(merge()).rejects.toThrow(/symlink/i);
    await expect(access(join(outside, 'new.png'))).rejects.toThrow();
  });
});
