import { exportOkfFromDump } from '@/lib/okfExport';

const mockZip = jest.fn(async () => {});

jest.mock('react-native-zip-archive', () => ({
  zip: (...args: unknown[]) => mockZip(...(args as [])),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  formatOkfBundle: () => ({
    files: [{ path: 'okf.json', content: '{"okf":"0.2"}' }],
  }),
}));

jest.mock('expo-file-system', () => {
  const cacheUri = 'file:///data/user/0/app/cache';
  class Directory {
    uri: string;
    create = jest.fn();
    delete = jest.fn();
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
  }
  class File {
    uri: string;
    create = jest.fn();
    write = jest.fn();
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
  }
  return { Directory, File, Paths: { cache: { uri: cacheUri } } };
});

describe('exportOkfFromDump zip target', () => {
  it('zips to a real file:// path (not "[object Object]…")', async () => {
    await exportOkfFromDump({ entities: [] } as never);

    expect(mockZip).toHaveBeenCalledTimes(1);
    const [, target] = mockZip.mock.calls[0];
    // Regression: the target used to be `${Paths.cache}export-….zip`, where
    // Paths.cache is an OBJECT — JS coerced it to "[object Object]export-….zip"
    // and Android failed with EROFS (read-only file system).
    expect(String(target)).toMatch(/^file:\/\/.+\/export-test-uuid-1234\.zip$/);
    expect(String(target)).not.toContain('[object Object]');
  });
});
