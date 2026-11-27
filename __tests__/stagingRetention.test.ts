import { exportOkfFromDump, saveOkfToDevice } from '@/lib/okfExport';
import { deletePickerCopy, sweepStaging, useLaunchStagingSweep } from '@/lib/stagingSweep';
import { act, renderHook } from '@testing-library/react-native';

const CACHE = 'file:///data/user/0/app/cache';
// mock* names are allowed inside jest.mock factories.
const mockCacheNames: string[] = [];
const mockCallLog: string[] = [];
let mockPickerChildren: string[] = [];
const mockDeleted: string[] = [];
let mockDeleteThrows = false;
let mockListThrows = false;
let mockCreateThrows = false;

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
  // Mirrors the real API: a cache-level entry exists only while tracked.
  const existsFor = (uri: string) => {
    if (uri.startsWith(`${cache}/DocumentPicker/`)) return mockPickerChildren.includes(uri.split('/').pop()!);
    const rest = uri.slice(cache.length + 1);
    if (uri.startsWith(`${cache}/`) && !rest.includes('/')) return mockCacheNames.includes(rest);
    return true;
  };
  const remove = (uri: string) => {
    if (mockDeleteThrows) throw new Error('locked');
    if (!existsFor(uri)) throw new Error(`does not exist: ${uri}`);
    const pi = uri.startsWith(`${cache}/DocumentPicker/`) ? mockPickerChildren.indexOf(uri.split('/').pop()!) : -1;
    if (pi >= 0) mockPickerChildren.splice(pi, 1);
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
    get exists() {
      return existsFor(this.uri);
    }
    create() {
      if (mockCreateThrows) throw new Error('create failed');
      if (!mockCacheNames.includes(this.name)) mockCacheNames.push(this.name);
    }
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
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    get exists() {
      return existsFor(this.uri);
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
  mockCreateThrows = false;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('direct SAF save', () => {
  beforeEach(() => {
    mockCacheNames.push('export-old.zip');
  });

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

  it('sweeps only export-* leftovers at the start of the next export', async () => {
    mockCacheNames.push('export-old.zip', 'import-live.zip', 'other.bin');
    await exportOkfFromDump({ entities: [] } as never);
    expect(mockDeleted).toContain(ZIP);
    expect(mockDeleted).not.toContain(`${CACHE}/import-live.zip`);
    expect(mockDeleted).not.toContain(`${CACHE}/other.bin`);
  });

  it('a finished export zip is released and swept by the next real export', async () => {
    // Real A then B (no hard-coded seed): A's id must be released on finish.
    const a = await exportOkfFromDump({ entities: [] } as never);
    expect(mockCacheNames).toContain('export-new-id.zip');
    await exportOkfFromDump({ entities: [] } as never);
    expect(mockDeleted).toContain(a);
    expect(mockCacheNames).not.toContain('export-new-id.zip');
    expect(mockCacheNames).toContain('export-id-2.zip');
  });

  it('deletes the old zip before zipping, and the new zip survives', async () => {
    mockCacheNames.push('export-old.zip');
    await exportOkfFromDump({ entities: [] } as never);
    expect(mockCallLog.indexOf('delete:export-old.zip')).toBeGreaterThanOrEqual(0);
    expect(mockCallLog.indexOf('delete:export-old.zip')).toBeLessThan(mockCallLog.indexOf('zip'));
    expect(mockCacheNames).toContain('export-new-id.zip');
    expect(mockCacheNames).not.toContain('export-old.zip');
  });

  it('overlapping exports: the second sweep deletes neither the first zip nor its dir', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (Sharing.shareAsync as jest.Mock).mockImplementationOnce(async () => {
      await gate;
    });
    const first = exportOkfFromDump({ entities: [] } as never);
    // Let the first export reach its gated share: zip written, id still active.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(mockCacheNames).toContain('export-new-id.zip');
    const second = exportOkfFromDump({ entities: [] } as never);
    const secondUri = await second;
    release();
    const firstUri = await first;
    expect(mockCacheNames).toContain('export-new-id.zip');
    expect(mockCacheNames).toContain('export-id-2.zip');
    expect(mockDeleted).not.toContain(firstUri);
    expect(mockDeleted).not.toContain(secondUri);
  });

  it('a SAF save in flight keeps its zip from a second export sweep', async () => {
    const uri = await exportOkfFromDump({ entities: [] } as never, { share: false });
    expect(mockCacheNames).toContain('export-new-id.zip');
    let grant!: (v: unknown) => void;
    saf.requestDirectoryPermissionsAsync.mockReturnValueOnce(new Promise((r) => (grant = r)));
    const saving = saveOkfToDevice(uri, 'x.zip');
    await exportOkfFromDump({ entities: [] } as never, { share: false });
    expect(mockDeleted).not.toContain(uri);
    grant({ granted: true, directoryUri: 'content://tree' });
    await saving;
    expect(mockDeleted).toContain(uri); // deleted by the save's own finally
  });

  it('a failed create() surfaces the real error and still releases the id', async () => {
    mockCreateThrows = true;
    await expect(exportOkfFromDump({ entities: [] } as never)).rejects.toThrow('create failed');
    // The missing dir is skipped, not deleted-and-caught.
    expect(console.warn).not.toHaveBeenCalled();
    mockCreateThrows = false;
    mockCacheNames.push('export-new-id.zip');
    sweepStaging();
    expect(mockDeleted).toContain(`${CACHE}/export-new-id.zip`);
  });

  it('deletes the partial zip when zip() throws', async () => {
    const zipMock = jest.requireMock('react-native-zip-archive').zip as jest.Mock;
    zipMock.mockImplementationOnce(async (_d: string, dest: string) => {
      mockCacheNames.push(dest.split('/').pop()!);
      throw new Error('zip boom');
    });
    await expect(exportOkfFromDump({ entities: [] } as never)).rejects.toThrow('zip boom');
    expect(mockDeleted).toContain(`${CACHE}/export-new-id.zip`);
  });

  it('deletes the zip when shareAsync throws', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('share boom'));
    await expect(exportOkfFromDump({ entities: [] } as never)).rejects.toThrow('share boom');
    expect(mockDeleted).toContain(`${CACHE}/export-new-id.zip`);
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

  it('deletePickerCopy needs the trailing slash: a sibling directory is not touched', () => {
    deletePickerCopy(`${CACHE}/DocumentPickerX/f.zip`);
    expect(mockDeleted).toEqual([]);
  });

  it('deletePickerCopy deletes a cache copy but never a user original', () => {
    mockPickerChildren = ['u.zip'];
    deletePickerCopy(`${CACHE}/DocumentPicker/u.zip`);
    deletePickerCopy('file:///var/mobile/Documents/journal.zip');
    deletePickerCopy('content://com.android.providers/doc/1');
    expect(mockDeleted).toEqual([`${CACHE}/DocumentPicker/u.zip`]);
  });
});

describe('useLaunchStagingSweep', () => {
  afterEach(() => jest.useRealTimers());

  it('sweeps once, deferred, after mount', async () => {
    jest.useFakeTimers();
    mockCacheNames.push('export-a.zip');
    await renderHook(() => useLaunchStagingSweep());
    // Effects are flushed by renderHook: the timer is armed but not fired.
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    expect(mockDeleted).toEqual([]);
    await act(async () => {
      jest.runAllTimers();
    });
    expect(mockDeleted).toEqual([`${CACHE}/export-a.zip`]);
  });
});

describe('wiring', () => {
  it('RootLayout runs the launch sweep', () => {
    // Narrow source-level check: rendering RootLayout needs the wiki, model
    // and navigation stacks; the hook's behaviour is covered above.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/app/_layout.tsx'), 'utf8');
    expect(src).toMatch(/import \{ useLaunchStagingSweep \} from '@\/lib\/stagingSweep'/);
    expect(src).toMatch(/useLaunchStagingSweep\(\);/);
  });
});
