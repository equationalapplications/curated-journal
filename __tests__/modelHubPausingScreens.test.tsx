import { render } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

const mockSend = jest.fn();
let mockState = 'pausing';
jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: mockSend,
    stateValue: mockState,
    modelId: 'm1',
    currentModelId: null,
    progress: { bytesWritten: 0, totalBytes: 0 },
    error: null,
    pausedReason: null,
    displayName: null,
  }),
}));
jest.mock('@/contexts/ModelHubCompletionContext', () => ({
  useModelHubCompletion: () => jest.fn(async () => undefined),
}));
jest.mock('@/catalog/modelManifest', () => ({
  MODEL_CATALOG: [],
  getCuratedModel: () => ({ id: 'm1', displayName: 'M', tagline: 't' }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn(), dismissTo: jest.fn() }),
  useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn() }),
  // Runs the focus callback as an effect, as a focused screen would.
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/entityStorage', () => ({ setDisplayName: jest.fn(async () => {}) }));
jest.mock('@/lib/modelLoadParams', () => ({ currentDeviceMemory: () => ({ totalMemoryBytes: 0 }) }));

import ModelHubDownloadScreen from '@/app/model-hub/download';
import ModelHubIndexScreen from '@/app/model-hub/index';

describe('the Pausing state on screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('T-S1 pausing shows "Pausing…" with no Pause and no Resume', async () => {
    mockState = 'pausing';
    const screen = await render(<ModelHubDownloadScreen />);
    expect(screen.getByTestId('download-pausing')).toBeTruthy();
    expect(screen.getByText('Pausing…')).toBeTruthy();
    expect(screen.queryByText('Pause')).toBeNull();
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('T-S1 paused shows Resume', async () => {
    mockState = 'paused';
    const screen = await render(<ModelHubDownloadScreen />);
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.queryByText('Pausing…')).toBeNull();
  });

  it('T-S2 focusing the list while pausing pushes the download screen', async () => {
    mockState = 'pausing';
    await render(<ModelHubIndexScreen />);
    expect(mockPush).toHaveBeenCalledWith('/model-hub/download');
  });

  it('T-S2 control: the list at rest does not push', async () => {
    mockState = 'selecting';
    await render(<ModelHubIndexScreen />);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
