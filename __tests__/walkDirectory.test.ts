import { walkMarkdownFiles } from '@/lib/walkDirectory';

describe('walkMarkdownFiles', () => {
  it('collects relative posix paths for md files', async () => {
    const files = await walkMarkdownFiles('/cache/import-1', {
      listEntries: async (dir) => {
        if (dir.endsWith('import-1'))
          return [
            { name: 'notes', isDirectory: true },
            { name: 'index.md', isDirectory: false },
          ];
        if (dir.endsWith('notes')) return [{ name: 'a.md', isDirectory: false }];
        return [];
      },
      readText: async (path) => (path.endsWith('a.md') ? '# A' : '# Index'),
    });
    expect(files).toEqual([{ path: 'notes/a.md', content: '# A' }]);
  });
});

describe('walkMarkdownFiles concurrency', () => {
  it('reads concurrently (bounded) and keeps entry order', async () => {
    let inFlight = 0;
    let peak = 0;
    const names = Array.from({ length: 40 }, (_, i) => `n${String(i).padStart(2, '0')}.md`);
    const files = await walkMarkdownFiles('/root', {
      listEntries: async (dir) =>
        dir === '/root'
          ? [{ name: 'a.md', isDirectory: false }, { name: 'sub', isDirectory: true }, ...names.map((name) => ({ name, isDirectory: false }))]
          : [{ name: 'inner.md', isDirectory: false }],
      readText: async (path) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return path;
      },
    });
    expect(files.map((f) => f.path)).toEqual(['a.md', 'sub/inner.md', ...names]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(16);
  });
});
