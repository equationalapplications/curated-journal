import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import JournalScreen from '@/app/(tabs)/journal';
import type { IngestResult } from '@/lib/ingestReport';

const mockExecute = jest.fn(async (): Promise<IngestResult> => ({
  truncated: false,
  chunks: 1,
  ingestedChunks: 1,
  failedChunks: 0,
}));

// jest-expo's expo-crypto mock returns an empty digest; use the real Node hash
// so we verify the ACTUAL 64-char-hex contract (expo's native impl is expo's to test).
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: async (
      _algorithm: string,
      data: string,
      _options?: { encoding?: string },
    ) => nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'),
  };
});

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  useWikiIngest: () => ({ execute: mockExecute, lastResult: null, isPending: false, error: null }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock('@/components/journal/JournalList', () => {
  const { Pressable } = require('react-native');
  return {
    JournalList: (props: { onNewNote: () => void }) => (
      <Pressable testID="new-note" onPress={props.onNewNote} />
    ),
  };
});

jest.mock('@/contexts/JournalContext', () => ({
  useJournal: () => ({
    entityId: 'e1',
    selectedFactId: null,
    setSelectedFactId: jest.fn(),
    paneMode: 'notes',
    setPaneMode: jest.fn(),
  }),
}));

jest.mock('@/hooks/useJournalMemoryRead', () => ({
  useJournalMemoryRead: () => ({ data: { facts: [] }, refetch: jest.fn() }),
}));

jest.mock('@/hooks/useSplitPaneLayout', () => ({
  useSplitPaneLayout: () => ({ isWide: false }),
}));

jest.mock('@/components/journal/JournalEntryEditor', () => {
  const { Pressable } = require('react-native');
  return {
    JournalEntryEditor: ({ onSave }: { onSave: (t: { title: string; body: string }) => void }) => (
      <Pressable testID="save" onPress={() => onSave({ title: 'T', body: 'B' })} />
    ),
  };
});

describe('journal save sends a valid 64-char hex sourceHash', () => {
  beforeEach(() => {
    mockExecute.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hashes the document chunk (64-char hex), not a timestamp', async () => {
    const screen = await render(<JournalScreen />);
    fireEvent.press(screen.getByTestId('new-note'));
    fireEvent.press(await screen.findByTestId('save'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const params = mockExecute.mock.calls[0][1];
    expect(params.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(params.sourceHash).not.toBe(String(Date.now()));
    // Content-addressed: hash of the exact markdown passed as documentChunk.
    expect(params.sourceHash).toBe(
      await require('expo-crypto').digestStringAsync(
        require('expo-crypto').CryptoDigestAlgorithm.SHA256,
        params.documentChunk,
        { encoding: require('expo-crypto').CryptoEncoding.HEX },
      ),
    );
  });

  it('is deterministic: same content produces the same hash', async () => {
    const first = await render(<JournalScreen />);
    fireEvent.press(first.getByTestId('new-note'));
    fireEvent.press(await first.findByTestId('save'));
    await new Promise((r) => setTimeout(r, 0));
    const hash1 = mockExecute.mock.calls[0][1].sourceHash;
    first.unmount();

    const second = await render(<JournalScreen />);
    fireEvent.press(second.getByTestId('new-note'));
    fireEvent.press(await second.findByTestId('save'));
    await new Promise((r) => setTimeout(r, 0));
    const hash2 = mockExecute.mock.calls[1][1].sourceHash;

    expect(hash2).toBe(hash1);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });
});
