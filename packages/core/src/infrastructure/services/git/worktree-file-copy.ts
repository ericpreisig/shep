import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorktreeHookContext } from '../../../application/ports/output/services/worktree-hook-runner.interface.js';
import type { ExecFunction } from './worktree.service.js';

/** Hydrate only explicitly selected, untracked local files. Never replace branch files. */
export async function copyWorktreeFiles(
  context: WorktreeHookContext,
  paths: string[],
  execFile: ExecFunction,
  timeout: number
): Promise<void> {
  const sourceRoot = await realpath(context.repoPath);
  const targetRoot = await realpath(context.worktreePath);
  const list = async (cwd: string, flags: string[]): Promise<string[]> => {
    const { stdout } = await execFile(
      'git',
      ['ls-files', '-z', ...flags, '--', ...paths.map((path) => `:(literal)${path}`)],
      { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout.split('\0').filter(Boolean);
  };
  const ignored = await list(sourceRoot, ['--others', '--ignored', '--exclude-standard']);
  const untracked = await list(sourceRoot, ['--others', '--exclude-standard']);
  // A tracked target may be absent locally. It still belongs to the branch.
  const tracked = new Set(await list(targetRoot, ['--cached']));
  for (const relative of new Set([...ignored, ...untracked])) {
    if (tracked.has(relative)) continue;
    const parts = relative.split('/');
    if (parts.some((part) => !part || part === '..' || part.toLowerCase() === '.git')) {
      throw new Error(`Invalid local file path: ${relative}`);
    }
    await checkPath(sourceRoot, parts);
    await checkPath(targetRoot, parts);
    const source = join(sourceRoot, ...parts);
    if (!(await lstat(source)).isFile()) continue;
    const target = join(targetRoot, ...parts);
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(source, target, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

/** Do not traverse symlinks, including destination ancestors pointing outside the worktree. */
async function checkPath(root: string, parts: string[]): Promise<void> {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Refusing worktree copy through symlink: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
