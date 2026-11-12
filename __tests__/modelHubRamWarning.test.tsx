import { fireEvent, render } from '@testing-library/react-native';
import ModelHubIndexScreen from '@/app/model-hub/index';

const GIB = 1024 ** 3;
const mockTotalMemory = jest.fn<number | null, []>();
jest.mock('expo-device', () => ({
  get totalMemory() {
    return mockTotalMemory();
  },
}));

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));

const mockSend = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn() }),
}));
jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: mockSend,
    stateValue: 'selecting',
    modelId: null,
    currentModelId: null,
    progress: { bytesWritten: 0, totalBytes: 0, progress: 0 },
    error: null,
    pausedReason: null,
    displayName: null,
  }),
}));

const LOW = /Fast & Light is larger than this device comfortably runs/;

describe('model hub RAM warning', () => {
  beforeEach(() => mockSend.mockClear());

  it('warns on a 3 GiB device, then sends only after Continue', async () => {
    mockTotalMemory.mockReturnValue(3 * GIB);
    const screen = await render(<ModelHubIndexScreen />);
    await fireEvent.press(screen.getByLabelText('Select Fast & Light'));
    expect(screen.getByText(LOW)).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockSend).toHaveBeenCalledWith({ type: 'SELECT_MODEL', modelId: 'fast-light' });
  });

  it('does not warn Smarter & Slower on an 8 GiB device', async () => {
    mockTotalMemory.mockReturnValue(8 * GIB);
    const screen = await render(<ModelHubIndexScreen />);
    await fireEvent.press(screen.getByLabelText('Select Smarter & Slower'));
    expect(screen.queryByText('Continue')).toBeNull();
    expect(mockSend).toHaveBeenCalledWith({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
  });

  it('keeps today\'s behavior when total memory is unknown', async () => {
    mockTotalMemory.mockReturnValue(null);
    const screen = await render(<ModelHubIndexScreen />);
    await fireEvent.press(screen.getByLabelText('Select Smarter & Slower'));
    expect(screen.getByText(/works best on newer phones and tablets/)).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByLabelText('Select Fast & Light'));
    expect(screen.queryByText('Continue')).toBeNull();
    expect(mockSend).toHaveBeenCalledWith({ type: 'SELECT_MODEL', modelId: 'fast-light' });
  });
});
