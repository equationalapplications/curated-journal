import { fireEvent, render, screen } from '@testing-library/react-native';
import { NightShiftRunRow } from '@/components/settings/NightShiftRunRow';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/hooks/useNightShiftGates', () => ({
  useNightShiftGates: jest.fn(),
}));

const mockedGates = useNightShiftGates as jest.Mock;

// See updateCheckRow.test.tsx: React 19 needs the act-environment flag.
(global as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const runButton = () => screen.getByTestId('night-shift-run-button');
const HINT = /plug in your device/i;

describe('NightShiftRunRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('explains why Run is disabled when the device is not charging', async () => {
    mockedGates.mockReturnValue({ charging: false, hasModel: true, canStart: false });
    await render(<NightShiftRunRow />);
    expect(runButton().props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it('shows no hint and starts Night Shift when charging', async () => {
    mockedGates.mockReturnValue({ charging: true, hasModel: true, canStart: true });
    await render(<NightShiftRunRow />);
    expect(screen.queryByText(HINT)).toBeNull();
    await fireEvent.press(runButton());
    expect(mockPush).toHaveBeenCalledWith('/night-shift');
  });
});
