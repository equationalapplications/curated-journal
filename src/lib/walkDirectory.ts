export type MarkdownFile = { path: string; content: string };

export type WalkDeps = {
  listEntries: (dir: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
  readText: (path: string) => Promise<string>;
};

function joinPosix(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

export async function walkMarkdownFiles(
  rootDir: string,
  deps: WalkDeps,
  relativePrefix = '',
): Promise<MarkdownFile[]> {
  const entries = await deps.listEntries(rootDir);
  const files: MarkdownFile[] = [];

  for (const entry of entries) {
    const abs = joinPosix(rootDir, entry.name);
    const rel = relativePrefix ? joinPosix(relativePrefix, entry.name) : entry.name;
    if (entry.isDirectory) {
      files.push(...(await walkMarkdownFiles(abs, deps, rel)));
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    if (rel === 'index.md') continue;
    files.push({ path: rel, content: await deps.readText(abs) });
  }

  return files;
}
