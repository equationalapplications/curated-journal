import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';

// Color-scheme mock: default 'light'; individual tests flip it.
const mockColorScheme = jest.fn().mockReturnValue('light');
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme(),
}));

jest.mock('@/constants/theme', () => ({
  Colors: {
    light: { text: '#000000', textSecondary: '#60646C' },
    dark: { text: '#ffffff', textSecondary: '#B0B4BA' },
  },
}));

const noopSave = async () => {};
const noopCancel = () => {};

describe('JournalEntryEditor dark-mode input contrast', () => {
  it('colors typed text for dark mode (title AND body)', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(
      <JournalEntryEditor onSave={noopSave} onCancel={noopCancel} />,
    );

    for (const placeholder of ['Title', 'Write in markdown…']) {
      const input = screen.getByPlaceholderText(placeholder);
      const flat = StyleSheet.flatten(input.props.style);
      expect(flat.color).toBe('#ffffff');
    }
  });

  it('colors placeholder text for dark mode', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(
      <JournalEntryEditor onSave={noopSave} onCancel={noopCancel} />,
    );

    for (const placeholder of ['Title', 'Write in markdown…']) {
      const input = screen.getByPlaceholderText(placeholder);
      expect(input.props.placeholderTextColor).toBe('#B0B4BA');
    }
  });
});
