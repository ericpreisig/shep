import type { IFileTreeReaderPort } from '../../ports/output/services/file-tree-reader-port.interface.js';

/** Reuse the repository scanner; every readable source path accompanies bounded excerpts. */
export async function readProjectContext(reader: IFileTreeReaderPort, repositoryPath: string) {
  const files = (
    await reader.read({
      repoRoot: repositoryPath,
      excludes: [
        '.godot',
        'bin',
        'obj',
        '.shep',
        '.env*',
        '*.lock',
        '*lock.json',
        '*.map',
        '*.min.js',
        '*.pck',
        '*.uid',
      ],
    })
  )
    .filter((file) => !file.content.includes('\0'))
    .sort((a, b) => a.path.localeCompare(b.path));
  const perFile = Math.min(12000, Math.max(256, Math.floor(500000 / Math.max(1, files.length))));
  let remaining = 500000;
  const excerpts = files.flatMap((file) => {
    const content = file.content.slice(0, Math.min(perFile, remaining));
    remaining -= content.length;
    return content
      ? [{ path: file.path, content, truncated: content.length < file.content.length }]
      : [];
  });
  return { files, excerpts, inventory: files.map((file) => file.path) };
}
