import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

const PICKED = 'file:///cache/DocumentPicker/abc.zip';
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/abc.zip' }] })),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

let mockCopyFails = false;
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    async copy() {
      if (mockCopyFails) throw new Error('copy failed');
    }
    delete() {}
  }
  class Directory {
    uri: string;
    exists = false;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    create() {}
    delete() {}
    list() {
      return [];
    }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('react-native-nitro-unzip', () => ({
  getUnzip: () => ({ extract: () => ({ await: async () => ({ totalBytes: 1 }) }) }),
}));
jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  parseOkfBundle: () => ({ entities: {} }),
  useSetOntologyManifest: () => ({ execute: jest.fn() }),
  useWiki: () => ({}),
}));
jest.mock('@/contexts/JournalContext', () => ({ useJournal: () => ({ entityId: 'e' }) }));
jest.mock('@/lib/chunkedImportDump', () => ({ chunkedImportDump: jest.fn(async () => ({ completed: true })) }));
const mockDeletePickerCopy = jest.fn();
jest.mock('@/lib/stagingSweep', () => ({
  deletePickerCopy: (u: string) => mockDeletePickerCopy(u),
}));

import ImportScreen from '@/app/import';

beforeEach(() => {
  mockDeletePickerCopy.mockClear();
  mockCopyFails = false;
});

describe('import prepare and the picker copy', () => {
  it('deletes the picker copy once it has been copied to staging', async () => {
    const { getByText } = await render(<ImportScreen />);
    await fireEvent.press(getByText('Pick OKF zip'));
    await waitFor(() => expect(mockDeletePickerCopy).toHaveBeenCalledWith(PICKED));
  });

  it('also deletes the picker copy when prepare fails', async () => {
    mockCopyFails = true;
    const { getByText } = await render(<ImportScreen />);
    await fireEvent.press(getByText('Pick OKF zip'));
    await waitFor(() => expect(getByText(/Import failed: copy failed/)).toBeTruthy());
    expect(mockDeletePickerCopy).toHaveBeenCalledWith(PICKED);
  });
});
