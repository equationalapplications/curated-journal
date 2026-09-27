import { exportOkfFromDump, saveOkfToDevice } from '@/lib/okfExport';

const mockZip = jest.fn(async () => {});
const mockShareAsync = jest.fn(async () => {});
const mockIsAvailable = jest.fn(async () => true);

jest.mock('react-native-zip-archive', () => ({
  zip: (...args: unknown[]) => mockZip(...(args as [])),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...(args as [])),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  formatOkfBundle: () => ({
    files: [{ path: 'okf.json', content: '{"okf":"0.2"}' }],
  }),
}));

// Mock BOTH entry points of expo-file-system: the modern object API
// (Directory/File/Paths, used by okfExport) and the legacy default export
// (StorageAccessFramework, used by saveOkfToDevice).
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
    base64 = jest.fn(async () => 'UEsDBA==');
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
  }
  return { Directory, File, Paths: { cache: { uri: cacheUri } } };
});

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    getUriForDirectoryInRoot: jest.fn(
      (folder: string) =>
        `content://com.android.externalstorage.documents/tree/primary:${folder}/document/primary:${folder}`,
    ),
    createFileAsync: jest.fn(async () => 'content://saf/created'),
    writeAsStringAsync: jest.fn(async () => {}),
  },
}));

import * as FileSystemLegacy from 'expo-file-system/legacy';

const saf = FileSystemLegacy.StorageAccessFramework;

function makeZipFile(): { uri: string } {
  // Deterministic: uuid is mocked to 'test-uuid-1234', cache to the uri above.
  return { uri: 'file:///data/user/0/app/cache/export-test-uuid-1234.zip' };
}

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

describe('saveOkfToDevice (SAF-first export)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks for a directory, creates the file, and writes the zip into it', async () => {
    (saf.requestDirectoryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: true,
      directoryUri: 'content://tree/primary%3ADownload',
    });

    await exportOkfFromDump({ entities: [] } as never);
    await saveOkfToDevice(makeZipFile().uri, 'curated-journal-export.zip');

    expect(saf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(saf.createFileAsync).toHaveBeenCalledWith(
      'content://tree/primary%3ADownload',
      'curated-journal-export.zip',
      'application/zip',
    );
    expect(saf.writeAsStringAsync).toHaveBeenCalledWith(
      'content://saf/created',
      'UEsDBA==',
      // Regression guard: without Base64 the default UTF-8 encoding writes
      // the base64 TEXT literally → corrupt zip → "Could not open ZIP file"
      // on import (device repro Sep 26).
      { encoding: 'base64' },
    );
  });

  it('falls back to the share sheet when the user cancels the directory picker', async () => {
    (saf.requestDirectoryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
    });
    mockIsAvailable.mockResolvedValueOnce(true);

    await saveOkfToDevice(makeZipFile().uri, 'curated-journal-export.zip');

    expect(saf.createFileAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledWith(
      makeZipFile().uri,
      expect.objectContaining({ mimeType: 'application/zip' }),
    );
  });
});
