import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

const mockSend = jest.fn();
let mockState = 'smokeFailed';
jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: mockSend,
    stateValue: mockState,
    modelId: 'm1',
    progress: { bytesWritten: 1, totalBytes: 1 },
    error: { code: 'smoke', message: 'This model could not run on your device.' },
    pausedReason: null,
    displayName: null,
  }),
}));
jest.mock('@/contexts/ModelHubCompletionContext', () => ({
  useModelHubCompletion: () => jest.fn(async () => undefined),
}));
jest.mock('@/catalog/modelManifest', () => ({
  getCuratedModel: () => ({ id: 'm1', displayName: 'M', tagline: 't' }),
}));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, dismissTo: mockDismissTo, canGoBack: () => false }),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/entityStorage', () => ({ setDisplayName: jest.fn(async () => {}) }));

import ModelHubDownloadScreen from '@/app/model-hub/download';

describe('download screen smoke states', () => {
  beforeEach(() => jest.clearAllMocks());

  it('smokeFailed shows the message and two actions', async () => {
    mockState = 'smokeFailed';
    const screen = await render(<ModelHubDownloadScreen />);
    expect(screen.getByText('This model could not run on your device.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockSend).toHaveBeenCalledWith({ type: 'RETRY' });
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another model' }));
    expect(mockSend).toHaveBeenCalledWith({ type: 'CHOOSE_ANOTHER' });
    // dismissTo pops to the list, or replaces onto it after a restore.
    expect(mockDismissTo).toHaveBeenCalledWith('/model-hub');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('smokeTest shows the checking copy and no Pause button', async () => {
    mockState = 'smokeTest';
    const screen = await render(<ModelHubDownloadScreen />);
    expect(screen.getByText('Checking the model runs on this device…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });
});
