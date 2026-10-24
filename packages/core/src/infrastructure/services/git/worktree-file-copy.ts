import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
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
): Promise<Record<string, string>> {
  const sourceRoot = await realpath(context.repoPath);
  const targetRoot = await realpath(context.worktreePath);
  const files = await localWorktreeFiles(sourceRoot, paths, execFile, timeout);
  // A tracked target may be absent locally. It still belongs to the branch.
  const tracked = new Set(
    await listWorktreeFiles(targetRoot, paths, ['--cached'], execFile, timeout)
  );
  const baseline: Record<string, string> = {};
  for (const relative of files) {
    if (tracked.has(relative)) continue;
    const source = await safeWorktreeFile(sourceRoot, relative);
    const target = await safeWorktreeFile(targetRoot, relative);
    if (!(await lstat(source)).isFile()) continue;
    const originalHash = (await fingerprint(source))!;
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(source, target, constants.COPYFILE_EXCL);
      if ((await fingerprint(target)) !== originalHash) {
        throw new Error(`Local file changed while preparing the worktree: ${relative}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    baseline[relative] = originalHash;
  }
  return baseline;
}

export async function fingerprint(path: string): Promise<string | undefined> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function listWorktreeFiles(
  cwd: string,
  paths: string[],
  flags: string[],
  execFile: ExecFunction,
  timeout: number
): Promise<string[]> {
  const { stdout } = await execFile(
    'git',
    ['ls-files', '-z', ...flags, '--', ...paths.map((path) => `:(literal)${path}`)],
    { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout.split('\0').filter(Boolean);
}

export async function localWorktreeFiles(
  cwd: string,
  paths: string[],
  execFile: ExecFunction,
  timeout: number
): Promise<string[]> {
  const [ignored, untracked] = await Promise.all([
    listWorktreeFiles(
      cwd,
      paths,
      ['--others', '--ignored', '--exclude-standard'],
      execFile,
      timeout
    ),
    listWorktreeFiles(cwd, paths, ['--others', '--exclude-standard'], execFile, timeout),
  ]);
  return [...new Set([...ignored, ...untracked])].filter(
    (path) => !path.split('/').some((part) => part.startsWith('.shep-transfer-'))
  );
}

export async function safeWorktreeFile(root: string, relative: string): Promise<string> {
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '..' || part.toLowerCase() === '.git')) {
    throw new Error(`Invalid local file path: ${relative}`);
  }
  await checkPath(root, parts);
  return join(root, ...parts);
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
