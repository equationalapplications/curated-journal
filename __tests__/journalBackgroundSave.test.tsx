import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import JournalScreen from '@/app/(tabs)/journal';
import { JournalSaveQueueProvider } from '@/contexts/JournalSaveQueueContext';
import type { IngestResult } from '@/lib/ingestReport';

// Spec specs/2026-11-12-background-save: Save closes the editor at once and
// the entry saves from a queue while the user keeps using the app.

const clean: IngestResult = { truncated: false, chunks: 1, ingestedChunks: 1, failedChunks: 0 };
const pending: { resolve: (r: IngestResult) => void; reject: (e: Error) => void }[] = [];
const mockIngest = jest.fn(
  () =>
    new Promise<IngestResult>((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
);
const mockRefetch = jest.fn();

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  useWiki: () => ({ ingestDocument: mockIngest }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

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
  useJournalMemoryRead: () => ({ data: { facts: [] }, refetch: mockRefetch }),
}));

jest.mock('@/hooks/useSplitPaneLayout', () => ({
  useSplitPaneLayout: () => ({ isWide: false }),
}));

jest.mock('@/components/journal/JournalList', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    JournalList: (props: {
      onNewNote: () => void;
      pending?: { id: string; title: string; status: string }[];
    }) => (
      <View>
        <Pressable testID="new-note" onPress={props.onNewNote} />
        {(props.pending ?? []).map((p) => (
          <Text key={p.id} testID={`pending-${p.title}`}>
            {`${p.title}|${p.status}`}
          </Text>
        ))}
      </View>
    ),
  };
});

let mockNextTitle = 'T';
jest.mock('@/components/journal/JournalEntryEditor', () => {
  const { Pressable } = require('react-native');
  return {
    JournalEntryEditor: ({ onSave }: { onSave: (t: { title: string; body: string }) => void }) => (
      <Pressable testID="save" onPress={() => onSave({ title: mockNextTitle, body: 'B' })} />
    ),
  };
});

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

async function renderScreen() {
  return render(
    <JournalSaveQueueProvider>
      <JournalScreen />
    </JournalSaveQueueProvider>,
  );
}

async function addNote(screen: Awaited<ReturnType<typeof renderScreen>>, title: string) {
  mockNextTitle = title;
  await fireEvent.press(screen.getByTestId('new-note'));
  await fireEvent.press(await screen.findByTestId('save'));
}

describe('background journal save', () => {
  beforeEach(() => {
    pending.splice(0);
    mockIngest.mockClear();
    mockRefetch.mockClear();
  });

  it('closes the editor at once and shows the entry as saving (R1, R3)', async () => {
    const screen = await renderScreen();
    await addNote(screen, 'Alpha');

    expect(screen.queryByTestId('save')).toBeNull();
    expect(screen.getByTestId('pending-Alpha')).toHaveTextContent('Alpha|saving');
    await flush();
    expect(mockIngest).toHaveBeenCalledTimes(1);

    mockRefetch.mockClear();
    await act(async () => pending[0].resolve(clean));
    await flush();
    expect(screen.queryByTestId('pending-Alpha')).toBeNull();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('queues a second note written while the first saves (R2)', async () => {
    const screen = await renderScreen();
    await addNote(screen, 'Alpha');
    await flush();
    await addNote(screen, 'Beta');

    expect(screen.getByTestId('pending-Alpha')).toHaveTextContent('Alpha|saving');
    expect(screen.getByTestId('pending-Beta')).toHaveTextContent('Beta|queued');
    expect(mockIngest).toHaveBeenCalledTimes(1);

    await act(async () => pending[0].resolve(clean));
    await flush();
    await flush();
    expect(mockIngest).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('pending-Beta')).toHaveTextContent('Beta|saving');
  });

  it('a failed save offers Try again and Discard, and is not dismissable (R4)', async () => {
    const screen = await renderScreen();
    await addNote(screen, 'Alpha');
    await flush();
    await act(async () => pending[0].reject(new Error('engine busy')));
    await flush();

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    expect(screen.getByText('engine busy')).toBeTruthy();
    expect(screen.getByTestId('pending-Alpha')).toHaveTextContent('Alpha|failed');

    await fireEvent.press(screen.getByText('Try again'));
    await flush();
    expect(mockIngest).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Save failed')).toBeNull();

    await act(async () => pending[1].reject(new Error('engine busy')));
    await flush();
    await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy());
    await fireEvent.press(screen.getByText('Discard'));
    await flush();
    expect(screen.queryByTestId('pending-Alpha')).toBeNull();
    expect(screen.queryByText('Save failed')).toBeNull();
  });

  it('shows the chunk-failure warning after a background save (R6)', async () => {
    const screen = await renderScreen();
    await addNote(screen, 'Alpha');
    await flush();
    await act(async () =>
      pending[0].resolve({ ...clean, chunks: 2, ingestedChunks: 1, failedChunks: 1 }),
    );
    await flush();

    await waitFor(() => expect(screen.getByText('Saved with warnings')).toBeTruthy());
    expect(screen.getByText(/1 chunk failed to process\./)).toBeTruthy();
    await fireEvent.press(screen.getByText('OK'));
    await flush();
    expect(screen.queryByText('Saved with warnings')).toBeNull();
  });
});
