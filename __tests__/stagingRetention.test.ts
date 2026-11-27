import { exportOkfFromDump, saveOkfToDevice } from '@/lib/okfExport';
import { sweepStaging } from '@/lib/stagingSweep';

const CACHE = 'file:///data/user/0/app/cache';
// mock* names are allowed inside jest.mock factories.
const mockCacheNames: string[] = [];
const mockDeleted: string[] = [];
let mockDeleteThrows = false;
let mockListThrows = false;

jest.mock('react-native-zip-archive', () => ({ zip: jest.fn(async () => {}) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  formatOkfBundle: () => ({ files: [] }),
}));
jest.mock('expo-file-system', () => {
  const cache = 'file:///data/user/0/app/cache';
  const remove = (uri: string) => {
    if (mockDeleteThrows) throw new Error('locked');
    mockDeleted.push(uri);
  };
  class Directory {
    uri: string;
    name: string;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
      this.name = this.uri.split('/').pop()!;
    }
    create() {}
    delete() {
      remove(this.uri);
    }
    list() {
      if (mockListThrows) throw new Error('no cache');
      return mockCacheNames.map((n) => new Directory(`${cache}/${n}`));
    }
  }
  class File {
    uri: string;
    exists = true;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    create() {}
    async write() {}
    async base64() {
      return 'UEsDBA==';
    }
    delete() {
      remove(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: cache } } };
});
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    getUriForDirectoryInRoot: jest.fn(() => 'content://root'),
    createFileAsync: jest.fn(async () => 'content://saf/created'),
    writeAsStringAsync: jest.fn(async () => {}),
  },
}));

import * as Sharing from 'expo-sharing';
import * as Legacy from 'expo-file-system/legacy';

const saf = Legacy.StorageAccessFramework as unknown as Record<string, jest.Mock>;
const ZIP = `${CACHE}/export-old.zip`;

beforeEach(() => {
  mockCacheNames.length = 0;
  mockDeleted.length = 0;
  mockDeleteThrows = false;
  mockListThrows = false;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('direct SAF save', () => {
  it('deletes the cache zip after a successful save', async () => {
    saf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: true, directoryUri: 'content://tree' });
    await saveOkfToDevice(ZIP, 'x.zip');
    expect(mockDeleted).toContain(ZIP);
  });

  it('deletes the cache zip when the SAF write fails', async () => {
    saf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: true, directoryUri: 'content://tree' });
    saf.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(saveOkfToDevice(ZIP, 'x.zip')).rejects.toThrow('disk full');
    expect(mockDeleted).toContain(ZIP);
  });

  it('leaves the zip when the cancel fallback hands it to the share sheet', async () => {
    saf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await saveOkfToDevice(ZIP, 'x.zip');
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(mockDeleted).not.toContain(ZIP);
  });
});

describe('share sheet export', () => {
  it('does not delete the zip when shareAsync resolves', async () => {
    await exportOkfFromDump({ entities: [] } as never);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleted).not.toContain(`${CACHE}/export-new-id.zip`);
  });

  it('sweeps an old export zip (and only export-*) at the start of the next export', async () => {
    mockCacheNames.push('export-old.zip', 'import-live.zip', 'other.bin');
    await exportOkfFromDump({ entities: [] } as never);
    expect(mockDeleted).toContain(ZIP);
    expect(mockDeleted).not.toContain(`${CACHE}/import-live.zip`);
    expect(mockDeleted).not.toContain(`${CACHE}/other.bin`);
  });
});

describe('sweepStaging', () => {
  it('launch sweep removes export-* and import-* files and dirs, ignores the rest', () => {
    mockCacheNames.push('export-a.zip', 'export-a', 'import-b.zip', 'import-b', 'model.gguf', 'exported.txt');
    sweepStaging();
    expect([...mockDeleted].sort()).toEqual(
      ['export-a', 'export-a.zip', 'import-b', 'import-b.zip'].map((n) => `${CACHE}/${n}`),
    );
  });

  it('never throws when delete fails', () => {
    mockCacheNames.push('export-a.zip', 'import-b');
    mockDeleteThrows = true;
    expect(() => sweepStaging()).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('never throws when the cache cannot be listed', () => {
    mockListThrows = true;
    expect(() => sweepStaging()).not.toThrow();
  });
});
