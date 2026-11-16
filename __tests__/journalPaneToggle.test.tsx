import { render, fireEvent } from '@testing-library/react-native';
import JournalScreen from '@/app/(tabs)/journal';
import { JournalProvider } from '@/contexts/JournalContext';
import { JournalSaveQueueProvider } from '@/contexts/JournalSaveQueueContext';

const mockIngest = jest.fn();
// The stored-facts guard (issue #112) reads the save back: echo one fact.
const mockListSourceRefs = jest.fn(async (_entityId: string) => {
  const params = mockIngest.mock.calls.at(-1)?.[1] as { sourceHash: string } | undefined;
  return [{ sourceRef: 'journal://stub', sourceHash: params?.sourceHash ?? null, factCount: 1, lastIngestedAt: 0 }];
});

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  // The journal calls ingestDocument directly (see src/lib/journalIngest.ts).
  useWiki: () => ({ ingestDocument: mockIngest, listSourceRefs: mockListSourceRefs }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useIsFocused: () => true,
}));

jest.mock('@/components/journal/JournalList', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalList: (props: { onSelect: (id: string) => void }) => (
      <Pressable testID="note-f1" onPress={() => props.onSelect('f1')}>
        <Text>note list</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/journal/JournalPane', () => {
  const { Text } = require('react-native');
  return { JournalPane: () => <Text>note reader</Text> };
});

jest.mock('@/components/synthesis/SynthesisPane', () => {
  const { Text } = require('react-native');
  return { SynthesisPane: () => <Text>chat pane</Text> };
});

jest.mock('@/hooks/useJournalMemoryRead', () => ({
  useJournalMemoryRead: () => ({
    data: { facts: [{ id: 'f1', title: 'First', body: 'Body' }] },
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/useSplitPaneLayout', () => ({
  useSplitPaneLayout: () => ({ isWide: false }),
}));

function renderJournal() {
  return render(
    <JournalProvider entityId="e1">
      <JournalSaveQueueProvider>
        <JournalScreen />
      </JournalSaveQueueProvider>
    </JournalProvider>,
  );
}

describe('journal Notes/Chat toggle (narrow layout)', () => {
  it('marks only the active pane as selected', async () => {
    const screen = await renderJournal();
    expect(screen.getByRole('tab', { name: 'Notes' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Chat' })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Notes' })).not.toBeSelected();
    expect(screen.getByText('chat pane')).toBeTruthy();
  });

  it('returns from an open note to the list', async () => {
    const screen = await renderJournal();
    await fireEvent.press(screen.getByTestId('note-f1'));
    expect(screen.getByText('note reader')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'All notes' }));
    expect(screen.getByText('note list')).toBeTruthy();
    expect(screen.queryByText('note reader')).toBeNull();
  });

  it('pressing Notes while reading a note goes back to the list', async () => {
    const screen = await renderJournal();
    await fireEvent.press(screen.getByTestId('note-f1'));
    await fireEvent.press(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByText('note list')).toBeTruthy();
  });
});
