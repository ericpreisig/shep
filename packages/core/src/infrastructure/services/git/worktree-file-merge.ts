import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { WorktreeHookContext } from '../../../application/ports/output/services/worktree-hook-runner.interface.js';
import type { ExecFunction } from './worktree.service.js';
import {
  localWorktreeFiles,
  listWorktreeFiles,
  safeWorktreeFile,
  fingerprint,
} from './worktree-file-copy.js';

/** Internal state in Git's per-worktree directory; the existing copyPaths remains the only config. */
async function baselinePath(cwd: string, exec: ExecFunction, timeout: number): Promise<string> {
  const { stdout } = await exec('git', ['rev-parse', '--git-path', 'shep-worktree-files.json'], {
    cwd,
    timeout,
  });
  if (!stdout.trim()) throw new Error('Cannot resolve worktree file baseline');
  return resolve(cwd, stdout.trim());
}

export async function captureWorktreeFiles(
  context: WorktreeHookContext,
  files: Record<string, string>,
  exec: ExecFunction,
  timeout: number
): Promise<void> {
  const path = await baselinePath(context.worktreePath, exec, timeout);
  try {
    await lstat(path);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(path, JSON.stringify({ version: 1, files }), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

/** Three-way content checks return local additions/edits without clobbering parallel main work. */
export async function mergeWorktreeFiles(
  context: WorktreeHookContext,
  paths: string[],
  exec: ExecFunction,
  timeout: number
): Promise<void> {
  const sourceRoot = await realpath(context.worktreePath);
  const targetRoot = await realpath(context.repoPath);
  if (sourceRoot === targetRoot) return;
  let baseline: Record<string, string> = {};
  try {
    const data = JSON.parse(
      await readFile(await baselinePath(sourceRoot, exec, timeout), 'utf8')
    ) as { version: number; files: Record<string, string> };
    if (
      data.version !== 1 ||
      !data.files ||
      Object.values(data.files).some(
        (hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
      )
    ) {
      throw new Error('Invalid worktree file baseline');
    }
    baseline = data.files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Old worktrees can safely add missing files, but cannot prove an overwrite is safe.
  }
  const tracked = new Set(await listWorktreeFiles(targetRoot, paths, ['--cached'], exec, timeout));
  const changes: { source: string; target: string; sourceHash: string; targetHash?: string }[] = [];
  for (const relative of await localWorktreeFiles(sourceRoot, paths, exec, timeout)) {
    if (tracked.has(relative)) continue;
    const source = await safeWorktreeFile(sourceRoot, relative);
    const target = await safeWorktreeFile(targetRoot, relative);
    if (!(await lstat(source)).isFile()) continue;
    const sourceHash = (await fingerprint(source))!;
    const targetHash = await fingerprint(target);
    if (sourceHash === targetHash || sourceHash === baseline[relative]) continue;
    if (targetHash !== undefined && targetHash !== baseline[relative]) {
      throw new Error(
        `Worktree file conflict at ${relative}; main and the worktree differ. Source files have been retained.`
      );
    }
    changes.push({ source, target, sourceHash, targetHash });
  }
  // Discover every conflict before writing any destination file.
  for (const change of changes) {
    await mkdir(dirname(change.target), { recursive: true });
    const temp = join(dirname(change.target), `.shep-transfer-${randomUUID()}`);
    try {
      await copyFile(change.source, temp, constants.COPYFILE_EXCL);
      if (
        (await fingerprint(temp)) !== change.sourceHash ||
        (await fingerprint(change.target)) !== change.targetHash
      ) {
        throw new Error(`Worktree file changed during transfer: ${change.target}`);
      }
      await rename(temp, change.target);
    } finally {
      await rm(temp, { force: true });
    }
  }
}
