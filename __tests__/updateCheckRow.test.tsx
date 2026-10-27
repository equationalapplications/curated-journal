import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';

// React 19 requires this flag for act() to be honored; jest-expo does not
// set it, and without it async state updates from pending promises warn
// and flush outside the test's act envelope (cross-test bleed).
(global as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { UpdateCheckRow } from '@/components/settings/UpdateCheckRow';
import { checkForAppUpdates } from '@/lib/updateCheck';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
}));

jest.mock('@/lib/updateCheck', () => {
  const actual = jest.requireActual('@/lib/updateCheck');
  return { ...actual, checkForAppUpdates: jest.fn() };
});

const mockCheck = checkForAppUpdates as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck.mockReset();
});

describe('UpdateCheckRow', () => {
  it('starts idle and shows the check affordance', async () => {
    mockCheck.mockResolvedValue('up-to-date');
    await render(<UpdateCheckRow />);
    expect(screen.getByTestId('update-check-label')).toHaveTextContent(
      'Check for an app update',
    );
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
  });

  it('disables the button while checking', async () => {
    let resolve!: (v: 'up-to-date') => void;
    mockCheck.mockReturnValue(
      new Promise<'up-to-date'>((r) => {
        resolve = r;
      }),
    );
    await render(<UpdateCheckRow />);
    fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(screen.getByTestId('update-check-label')).toHaveTextContent(
        /Checking…/,
      ),
    );
    expect(screen.getByRole('button', { name: /Checking for updates/ })).toBeDisabled();
    resolve('up-to-date');
    await waitFor(() =>
      expect(screen.getByTestId('update-check-label')).toHaveTextContent(
        /You’re up to date\./,
      ),
    );
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
  });

  it('shows the restart instruction after a downloaded update', async () => {
    mockCheck.mockResolvedValue('update-downloaded');
    await render(<UpdateCheckRow />);
    fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(screen.getByTestId('update-check-label')).toHaveTextContent(
        /Restart the app to install it/,
      ),
    );
  });

  it('shows fixed failure copy and does not leak raw error text', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCheck.mockRejectedValue(new Error('TOKEN=secret internal detail'));
    await render(<UpdateCheckRow />);
    fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(screen.getByTestId('update-check-label')).toHaveTextContent(
        /update server/,
      ),
    );
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // Runs LAST: this test leaves the RNTL render root poisoned (a pending
  // check resolved without act), which empties the tree of any test that
  // renders after it. Self-contained, so nothing follows it.
  it('does not start a second check on a double-tap', async () => {
    let resolve!: (v: 'up-to-date') => void;
    mockCheck.mockReturnValue(
      new Promise<'up-to-date'>((r) => {
        resolve = r;
      }),
    );
    await render(<UpdateCheckRow />);
    const button = screen.getByRole('button', { name: 'Check' });
    fireEvent.press(button);
    fireEvent.press(button);
    resolve('up-to-date');
    // Settle fully inside this test: the resolved check updates state
    // without act, and leaving that update pending bleeds into any test
    // that renders after this one.
    await waitFor(() =>
      expect(screen.getByTestId('update-check-label')).toHaveTextContent(
        /up to date/i,
      ),
    );
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
  });
});
