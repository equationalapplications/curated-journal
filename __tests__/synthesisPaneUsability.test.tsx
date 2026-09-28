import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

// Color-scheme mock: default 'light'; individual tests flip it.
const mockColorScheme = jest.fn().mockReturnValue('light');
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({})),
}));

jest.mock('@/services/chatMessages', () => ({
  createChatStore: jest.fn(() => ({
    list: jest.fn(async () => [
      { id: 'm1', role: 'user', content: 'hello', citations: [] },
    ]),
    insert: jest.fn(async () => {}),
  })),
}));

jest.mock('@equationalapplications/expo-llm-wiki', () => ({
  useWiki: () => ({
    read: jest.fn(async () => ({ facts: [] })),
    traverseGraph: jest.fn(async () => ({})),
  }),
  formatGraphContext: jest.fn(() => ''),
}));

jest.mock('@/contexts/JournalContext', () => ({
  useJournal: () => ({ entityId: 'test-entity' }),
}));

jest.mock('@/contexts/LlmContext', () => ({
  useLlm: () => ({ generateText: jest.fn(async () => '') }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));

import { SynthesisPane } from '@/components/synthesis/SynthesisPane';
import { Colors } from '@/constants/theme';

describe('SynthesisPane (chat) usability', () => {
  it('colors typed text and placeholder for dark mode', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<SynthesisPane />);

    const input = screen.getByPlaceholderText('Ask about your notes…');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.color).toBe(Colors.dark.onSurface);
    expect(input.props.placeholderTextColor).toBe(Colors.dark.outline);
  });

  it('gives the input a themed border (visible in dark mode)', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<SynthesisPane />);

    const input = screen.getByPlaceholderText('Ask about your notes…');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.borderColor).toBe(Colors.dark.outlineVar);
  });

  it('renders inside the keyboard-controller aware scroll view (SDK 57 edge-to-edge fix)', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<SynthesisPane />);

    // The composer lives inside KeyboardAwareScrollView (react-native-keyboard-
    // controller), which natively lifts the focused input above the keyboard on
    // Android 15+ edge-to-edge where KeyboardAvoidingView/adjustResize fail.
    const scroller = screen.getByTestId('kbd-aware');
    expect(scroller).toBeTruthy();
    expect(screen.getByPlaceholderText('Ask about your notes…')).toBeTruthy();
  });
});
