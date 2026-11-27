import { exportOkfFromDump, saveOkfToDevice } from '@/lib/okfExport';
import { deletePickerCopy, sweepStaging, useLaunchStagingSweep } from '@/lib/stagingSweep';
import { renderHook, waitFor } from '@testing-library/react-native';

const CACHE = 'file:///data/user/0/app/cache';
// mock* names are allowed inside jest.mock factories.
const mockCacheNames: string[] = [];
const mockCallLog: string[] = [];
let mockPickerChildren: string[] = [];
const mockDeleted: string[] = [];
let mockDeleteThrows = false;
let mockListThrows = false;

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(async (_d: string, dest: string) => {
    mockCallLog.push('zip');
    mockCacheNames.push(dest.split('/').pop()!);
  }),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => (mockUuid++ === 0 ? 'new-id' : `id-${mockUuid}`) }));
jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  formatOkfBundle: () => ({ files: [] }),
}));
jest.mock('expo-file-system', () => {
  const cache = 'file:///data/user/0/app/cache';
  const remove = (uri: string) => {
    if (mockDeleteThrows) throw new Error('locked');
    mockDeleted.push(uri);
    mockCallLog.push(`delete:${uri.split('/').pop()}`);
    const i = mockCacheNames.indexOf(uri.split('/').pop()!);
    if (i >= 0) mockCacheNames.splice(i, 1);
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
      if (this.name === 'DocumentPicker') return mockPickerChildren.map((n) => new File(`${cache}/DocumentPicker/${n}`));
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
  mockCallLog.length = 0;
  mockPickerChildren = [];
  mockUuid = 0;
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

  it('does not mask the SAF error when the finally delete fails', async () => {
    saf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: true, directoryUri: 'content://tree' });
    saf.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    mockDeleteThrows = true;
    await expect(saveOkfToDevice(ZIP, 'x.zip')).rejects.toThrow('disk full');
  });

  it('deletes the zip when the cancel fallback finds sharing unavailable', async () => {
    saf.requestDirectoryPermissionsAsync.mockResolvedValueOnce({ granted: false });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await saveOkfToDevice(ZIP, 'x.zip');
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

  it('deletes the old zip before zipping, and the new zip survives', async () => {
    mockCacheNames.push('export-old.zip');
    await exportOkfFromDump({ entities: [] } as never);
    expect(mockCallLog.indexOf('delete:export-old.zip')).toBeGreaterThanOrEqual(0);
    expect(mockCallLog.indexOf('delete:export-old.zip')).toBeLessThan(mockCallLog.indexOf('zip'));
    expect(mockCacheNames).toContain('export-new-id.zip');
    expect(mockCacheNames).not.toContain('export-old.zip');
  });

  it('two overlapping exports both succeed and neither is swept by the other', async () => {
    const zipMock = jest.requireMock('react-native-zip-archive').zip as jest.Mock;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    zipMock.mockImplementationOnce(async (_d: string, dest: string) => {
      await gate;
      mockCacheNames.push(dest.split('/').pop()!);
    });
    const first = exportOkfFromDump({ entities: [] } as never, { share: false });
    await Promise.resolve();
    // First export's dir exists in the cache while the second starts.
    mockCacheNames.push('export-new-id');
    const second = exportOkfFromDump({ entities: [] } as never, { share: false });
    await second;
    release();
    await first;
    expect(mockDeleted).not.toContain(`${CACHE}/export-new-id`.replace('new-id', 'new-id') + '.zip');
    expect(mockDeleted.filter((u) => u.endsWith('/export-new-id'))).toHaveLength(1); // only its own finally
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

describe('document picker copy', () => {
  it('launch sweep empties the DocumentPicker directory', () => {
    mockCacheNames.push('DocumentPicker');
    mockPickerChildren = ['a.zip', 'b.zip'];
    sweepStaging();
    expect(mockDeleted).toEqual(
      expect.arrayContaining([`${CACHE}/DocumentPicker/a.zip`, `${CACHE}/DocumentPicker/b.zip`]),
    );
    expect(mockDeleted).not.toContain(`${CACHE}/DocumentPicker`);
  });

  it('the export-start sweep leaves the picker directory alone', () => {
    mockCacheNames.push('DocumentPicker');
    mockPickerChildren = ['a.zip'];
    sweepStaging(['export']);
    expect(mockDeleted).toEqual([]);
  });

  it('deletePickerCopy deletes a cache copy but never a user original', () => {
    deletePickerCopy(`${CACHE}/DocumentPicker/u.zip`);
    deletePickerCopy('file:///var/mobile/Documents/journal.zip');
    deletePickerCopy('content://com.android.providers/doc/1');
    expect(mockDeleted).toEqual([`${CACHE}/DocumentPicker/u.zip`]);
  });
});

describe('useLaunchStagingSweep', () => {
  it('sweeps once, deferred, after mount', async () => {
    mockCacheNames.push('export-a.zip');
    renderHook(() => useLaunchStagingSweep());
    expect(mockDeleted).toEqual([]);
    await waitFor(() => expect(mockDeleted).toEqual([`${CACHE}/export-a.zip`]));
  });
});
