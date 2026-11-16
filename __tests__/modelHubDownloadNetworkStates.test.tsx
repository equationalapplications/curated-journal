import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

const mockSend = jest.fn();
let mockState = 'cellularConfirm';
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
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: mockDismissTo }),
  useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn() }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/entityStorage', () => ({ setDisplayName: jest.fn(async () => {}) }));
jest.mock('@/lib/modelLoadParams', () => ({ currentDeviceMemory: () => ({ totalMemoryBytes: 0 }) }));

import ModelHubDownloadScreen from '@/app/model-hub/download';
import ModelHubIndexScreen from '@/app/model-hub/index';
import { CellularConfirm } from '@/components/model-hub/cellular-confirm';

const BODY = 'This model is a large file and may use a significant amount of cellular data.';

// Mirrors the hub layout: the one CellularConfirm beside whichever screens are mounted.
function Hub({ withIndex = false }: { withIndex?: boolean }) {
  return (
    <View>
      {withIndex ? <ModelHubIndexScreen /> : null}
      <ModelHubDownloadScreen />
      <CellularConfirm />
    </View>
  );
}

describe('download screen network states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = 'cellularConfirm';
  });

  it('cellularConfirm shows the sheet once and Download over cellular sends CELLULAR_CONFIRM', async () => {
    const screen = await render(<Hub />);
    expect(screen.getAllByText(BODY)).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Download over cellular' }));
    expect(mockSend).toHaveBeenCalledWith({ type: 'CELLULAR_CONFIRM' });
  });

  it('Cancel on the sheet sends CELLULAR_CANCEL', async () => {
    const screen = await render(<Hub />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSend).toHaveBeenCalledWith({ type: 'CELLULAR_CANCEL' });
  });

  it('renders the sheet exactly once with the list and download screens both mounted', async () => {
    const screen = await render(<Hub withIndex />);
    expect(screen.getAllByText(BODY)).toHaveLength(1);
  });

  it('confirmingNetwork shows the neutral checking line', async () => {
    mockState = 'confirmingNetwork';
    const screen = await render(<Hub />);
    expect(screen.getByText('Checking your connection…')).toBeTruthy();
  });

  it('awaitingWifi shows Try again, which sends CHECK_NETWORK', async () => {
    mockState = 'awaitingWifi';
    const screen = await render(<Hub />);
    expect(screen.getByTestId('awaiting-wifi')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockSend).toHaveBeenCalledWith({ type: 'CHECK_NETWORK' });
  });

  it('a transition into selecting from cellularConfirm dismisses to the list', async () => {
    const screen = await render(<Hub />);
    expect(mockDismissTo).not.toHaveBeenCalled();
    mockState = 'selecting';
    await screen.rerender(<Hub />);
    expect(mockDismissTo).toHaveBeenCalledWith('/model-hub');
  });

  it('the initial selecting at restore mount does not dismiss', async () => {
    mockState = 'selecting';
    const screen = await render(<Hub />);
    await screen.rerender(<Hub />);
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
});
