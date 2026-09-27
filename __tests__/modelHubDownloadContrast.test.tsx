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

import ModelHubDownloadScreen from '@/app/model-hub/download';
import { Colors } from '@/constants/theme';

describe('model-hub download journal-name input contrast', () => {
  it('colors typed text and placeholder for dark mode', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<ModelHubDownloadScreen />);

    const input = screen.getByPlaceholderText('Name your journal (optional)');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.color).toBe(Colors.dark.onSurface);
    expect(input.props.placeholderTextColor).toBe(Colors.dark.outline);
  });

  it('uses a themed border (not a hardcoded gray)', async () => {
    mockColorScheme.mockReturnValue('dark');
    const screen = await render(<ModelHubDownloadScreen />);

    const input = screen.getByPlaceholderText('Name your journal (optional)');
    const flat = StyleSheet.flatten(input.props.style);
    expect(flat.borderColor).toBe(Colors.dark.outlineVar);
  });
});
