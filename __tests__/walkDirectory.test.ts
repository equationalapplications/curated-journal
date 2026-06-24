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
