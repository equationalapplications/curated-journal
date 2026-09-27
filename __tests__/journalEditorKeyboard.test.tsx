import { render } from '@testing-library/react-native';

// Color-scheme mock: default 'light'; individual tests flip it.
const mockColorScheme = jest.fn().mockReturnValue('light');
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme(),
}));

jest.mock('@/constants/theme', () => ({
  Fonts: { mono: 'monospace' },
  Colors: {
    light: { text: '#000000', textSecondary: '#60646C' },
    dark: { text: '#ffffff', textSecondary: '#B0B4BA' },
  },
}));

import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';

const noopSave = async () => {};
const noopCancel = () => {};

describe('JournalEntryEditor keyboard avoidance', () => {
  it('hosts title + body + actions inside KeyboardAwareScrollView', async () => {
    const screen = await render(
      <JournalEntryEditor onSave={noopSave} onCancel={noopCancel} />,
    );

    // The whole editor lives in the keyboard-controller aware scroll view,
    // which keeps the focused input and action buttons above the keyboard
    // under Android 15 edge-to-edge.
    const scroller = screen.getByTestId('editor-kbd-aware');
    expect(scroller).toBeTruthy();
    expect(screen.getByPlaceholderText('Title')).toBeTruthy();
    expect(screen.getByPlaceholderText('Write in markdown…')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
