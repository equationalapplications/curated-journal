import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import JournalScreen from '@/app/(tabs)/journal';
import { countIngestFailures, type IngestResult } from '@/lib/ingestReport';

const mockExecute = jest.fn(async (): Promise<IngestResult> => ({
  truncated: false,
  chunks: 1,
  ingestedChunks: 1,
  failedChunks: 0,
}));

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

describe('journal save ingest-failure warning', () => {
  beforeEach(() => {
    mockExecute.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('alerts with the failure count when chunks fail', async () => {
    mockExecute.mockResolvedValueOnce({
      truncated: false,
      chunks: 2,
      ingestedChunks: 1,
      failedChunks: 1,
      parseFailures: [
        { chunkIndex: 1, sourceRef: 'a', source: 'parse', position: 3, message: 'boom' },
      ],
    } satisfies IngestResult);
    const screen = await render(<JournalScreen />);
    fireEvent.press(screen.getByTestId('new-note'));
    fireEvent.press(await screen.findByTestId('save'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Saved with warnings',
      expect.stringContaining('2'),
    );
  });

  it('does not alert on a clean save', async () => {
    const screen = await render(<JournalScreen />);
    fireEvent.press(screen.getByTestId('new-note'));
    fireEvent.press(await screen.findByTestId('save'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
