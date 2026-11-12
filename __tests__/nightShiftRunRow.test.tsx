import { fireEvent, render, screen } from '@testing-library/react-native';
import { NightShiftRunRow } from '@/components/settings/NightShiftRunRow';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';
import { NIGHT_SHIFT_CHARGING_HINT } from '@/lib/nightShiftCopy';

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

const UNPLUGGED = { charging: false, chargingKnown: true, hasModel: true, canStart: false };
const CHARGING = { charging: true, chargingKnown: true, hasModel: true, canStart: true };

describe('NightShiftRunRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('explains why Run is disabled when the device is not charging', async () => {
    mockedGates.mockReturnValue(UNPLUGGED);
    await render(<NightShiftRunRow />);
    expect(runButton().props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getByText(HINT)).toBeTruthy();
    // Screen readers that land on the button hear the reason too.
    expect(runButton().props.accessibilityHint).toBe(NIGHT_SHIFT_CHARGING_HINT);
    await fireEvent.press(runButton());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows no hint before the first battery read resolves', async () => {
    // A plugged-in device must not flash "Plug in" while the state loads.
    mockedGates.mockReturnValue({ ...UNPLUGGED, chargingKnown: false });
    await render(<NightShiftRunRow />);
    expect(screen.queryByText(HINT)).toBeNull();
    expect(runButton().props.accessibilityHint).toBeUndefined();
  });

  it('clears the hint and enables Run when the device is plugged in', async () => {
    mockedGates.mockReturnValue(UNPLUGGED);
    const { rerender } = await render(<NightShiftRunRow />);
    expect(screen.getByText(HINT)).toBeTruthy();
    mockedGates.mockReturnValue(CHARGING);
    await rerender(<NightShiftRunRow />);
    expect(screen.queryByText(HINT)).toBeNull();
    expect(runButton().props.accessibilityHint).toBeUndefined();
    await fireEvent.press(runButton());
    expect(mockPush).toHaveBeenCalledWith('/night-shift');
  });
});
