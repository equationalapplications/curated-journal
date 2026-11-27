import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

const PICKED = 'file:///cache/DocumentPicker/abc.zip';
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/abc.zip', name: 'journal.zip' }] })),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

let mockCopyFails = false;
const mockLog: string[] = [];
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    async copy() {
      mockLog.push('copy');
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
const mockDeletePickerCopy = jest.fn((u: string) => {
  mockLog.push(`deletePicker:${u}`);
});
const mockDeleteInbox = jest.fn((n?: string) => {
  mockLog.push(`inbox:${n}`);
});
jest.mock('@/lib/stagingSweep', () => ({
  deletePickerCopy: (u: string) => mockDeletePickerCopy(u),
  deleteIosInboxCopy: (n?: string) => mockDeleteInbox(n),
}));

import ImportScreen from '@/app/import';

beforeEach(() => {
  mockDeletePickerCopy.mockClear();
  mockDeleteInbox.mockClear();
  mockLog.length = 0;
  mockCopyFails = false;
});

describe('import prepare and the picker copy', () => {
  it('deletes the picker copy once it has been copied to staging', async () => {
    const { getByText } = await render(<ImportScreen />);
    await fireEvent.press(getByText('Pick OKF zip'));
    await waitFor(() => expect(mockDeletePickerCopy).toHaveBeenCalledWith(PICKED));
    // Copy first, delete after: deleting first would lose the journal.
    expect(mockLog.indexOf('copy')).toBeGreaterThanOrEqual(0);
    expect(mockLog.indexOf('copy')).toBeLessThan(mockLog.indexOf(`deletePicker:${PICKED}`));
    // The iOS Inbox copy goes by the picked file's name, also after the copy.
    expect(mockDeleteInbox).toHaveBeenCalledWith('journal.zip');
    expect(mockLog.indexOf('copy')).toBeLessThan(mockLog.indexOf('inbox:journal.zip'));
  });

  it('also deletes the picker copy when prepare fails', async () => {
    mockCopyFails = true;
    const { getByText } = await render(<ImportScreen />);
    await fireEvent.press(getByText('Pick OKF zip'));
    await waitFor(() => expect(getByText(/Import failed: copy failed/)).toBeTruthy());
    expect(mockDeletePickerCopy).toHaveBeenCalledWith(PICKED);
    expect(mockDeleteInbox).toHaveBeenCalledWith('journal.zip');
  });
});
