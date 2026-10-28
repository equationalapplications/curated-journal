import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NightShiftPruneRow } from '@/components/settings/NightShiftPruneRow';
import {
  getNightShiftPruneEnabled,
  setNightShiftPruneEnabled,
} from '@/lib/entityStorage';

jest.mock('@/lib/entityStorage', () => ({
  getNightShiftPruneEnabled: jest.fn(),
  setNightShiftPruneEnabled: jest.fn(),
}));

const mockedGet = getNightShiftPruneEnabled as jest.Mock;
const mockedSet = setNightShiftPruneEnabled as jest.Mock;

// See updateCheckRow.test.tsx: React 19 needs the act-environment flag.
(global as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const switchEl = () => screen.getByTestId('night-shift-prune-switch');

describe('NightShiftPruneRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue(false);
    mockedSet.mockResolvedValue(undefined);
  });

  it('renders off by default with honest copy', async () => {
    render(<NightShiftPruneRow />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.getByText(/Permanently remove/i)).toBeTruthy();
    expect(switchEl().props.value).toBe(false);
  });

  it('persists the optimistic toggle', async () => {
    render(<NightShiftPruneRow />);
    await waitFor(() => expect(switchEl().props.disabled).toBe(false));
    fireEvent(switchEl(), 'valueChange', true);
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(true));
    expect(switchEl().props.value).toBe(true);
  });

  it('reverts the switch when the write fails', async () => {
    mockedSet.mockRejectedValueOnce(new Error('keystore locked'));
    render(<NightShiftPruneRow />);
    await waitFor(() => expect(switchEl().props.disabled).toBe(false));
    fireEvent(switchEl(), 'valueChange', true);
    await waitFor(() => expect(switchEl().props.value).toBe(false));
  });
});
