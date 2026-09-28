import { render } from '@testing-library/react-native';
import ModelHubIndexScreen from '@/app/model-hub/index';

// Color-scheme mock: Screen / ListRow / Card / ThemedText all call useTheme.
const mockColorScheme = jest.fn().mockReturnValue('light');
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme(),
}));

const mockSend = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(false);
const mockGoBack = jest.fn();
const mockCurrentModelId = jest.fn().mockReturnValue<string | null>(null);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ canGoBack: () => mockCanGoBack(), goBack: mockGoBack }),
}));

jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: mockSend,
    stateValue: 'selecting',
    modelId: null,
    currentModelId: mockCurrentModelId(),
    progress: { bytesWritten: 0, totalBytes: 0, progress: 0 },
    error: null,
    pausedReason: null,
    displayName: null,
  }),
}));

describe('model-hub change mode', () => {
  it('offers no exit on first run, where there is nothing behind the hub', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.queryByLabelText('Back to Settings')).toBeNull();
  });

  it('offers an exit when the hub was pushed from Settings', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.getByLabelText('Back to Settings')).toBeTruthy();
  });

  it('returns to Settings when the back row is pressed', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(<ModelHubIndexScreen />);
    screen.getByLabelText('Back to Settings').props.onClick?.();
    screen.getByLabelText('Back to Settings').props.onPress?.();
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('marks the installed model as Current and does not allow re-selecting it', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockCurrentModelId.mockReturnValue('fast-light');
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByLabelText('Fast & Light, current model')).toBeTruthy();
  });
});
