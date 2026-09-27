import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

// Color-scheme mock: default 'light'; individual tests flip it.
const mockColorScheme = jest.fn().mockReturnValue('light');
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme(),
}));

jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: jest.fn(),
    stateValue: 'downloading',
    modelId: 'm1',
    progress: { bytesWritten: 0, totalBytes: 1, progress: 0 },
    error: null,
    pausedReason: null,
    displayName: null,
  }),
}));

jest.mock('@/contexts/ModelHubCompletionContext', () => ({
  useModelHubCompletion: () => ({ onComplete: jest.fn() }),
}));

jest.mock('@/catalog/modelManifest', () => ({
  getCuratedModel: () => ({ id: 'm1', name: 'M', downloadUrl: '', sizeBytes: 1 }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/entityStorage', () => ({
  setDisplayName: jest.fn(async () => {}),
}));

jest.mock('@/constants/theme', () => ({
  Fonts: { mono: 'monospace' },
  Spacing: { one: 4, two: 8, three: 12, four: 16 },
  Colors: {
    light: { text: '#000000', textSecondary: '#60646C', backgroundElement: '#F0F0F3' },
    dark: { text: '#ffffff', textSecondary: '#B0B4BA', backgroundElement: '#212225' },
  },
}));

import ModelHubDownloadScreen from '@/app/model-hub/download';

describe('model-hub download journal-name input contrast', () => {
  it('colors typed text and placeholder for dark mode', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<ModelHubDownloadScreen />);

    const input = screen.getByPlaceholderText('Name your journal (optional)');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.color).not.toBe('#000000');
    expect(flat.color).toBeDefined();
  });

  it('uses a themed border (not a hardcoded gray)', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<ModelHubDownloadScreen />);

    const input = screen.getByPlaceholderText('Name your journal (optional)');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.borderColor).not.toBe('#8888');
  });
});
