import * as Updates from 'expo-updates';

import {
  checkForAppUpdates,
  describeUpdateCheckResult,
  UpdateCheckError,
} from '../src/lib/updateCheck';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  UpdateCheckResultNotAvailableReason: {
    NO_UPDATE_AVAILABLE_ON_SERVER: 'noUpdateAvailableOnServer',
    UPDATE_REJECTED_BY_SELECTION_POLICY: 'updateRejectedBySelectionPolicy',
    UPDATE_PREVIOUSLY_FAILED: 'updatePreviouslyFailed',
    ROLLBACK_REJECTED_BY_SELECTION_POLICY: 'rollbackRejectedBySelectionPolicy',
  },
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
}));

const mockedList = Updates as jest.Mocked<typeof Updates>;
const realDev = (global as { __DEV__?: boolean }).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.isEnabled = true;
  (global as { __DEV__?: boolean }).__DEV__ = false;
});

afterEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = realDev;
});

describe('checkForAppUpdates', () => {
  it('is unavailable in dev builds', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    await expect(checkForAppUpdates()).resolves.toBe('unavailable');
    expect(mockedList.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('is unavailable when OTA is not enabled', async () => {
    mockedList.isEnabled = false;
    await expect(checkForAppUpdates()).resolves.toBe('unavailable');
  });

  it('reports up-to-date when no update is available', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
    });
    await expect(checkForAppUpdates()).resolves.toBe('up-to-date');
    expect(mockedList.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('downloads and reports a found update', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: true,
    });
    (mockedList.fetchUpdateAsync as jest.Mock).mockResolvedValue({
      isNew: true,
    });
    await expect(checkForAppUpdates()).resolves.toBe('update-downloaded');
    expect(mockedList.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('treats a rollback directive as actionable', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: true,
    });
    (mockedList.fetchUpdateAsync as jest.Mock).mockResolvedValue({
      isNew: false,
      isRollBackToEmbedded: true,
    });
    await expect(checkForAppUpdates()).resolves.toBe('update-downloaded');
    expect(mockedList.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('fetches when the check reports a rollback even with isNew false', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: true,
      isRollBackToEmbedded: false,
    });
    (mockedList.fetchUpdateAsync as jest.Mock).mockResolvedValue({
      isNew: false,
      isRollBackToEmbedded: true,
    });
    await expect(checkForAppUpdates()).resolves.toBe('update-downloaded');
  });

  it('distinguishes a device-blocked update from benign no-update reasons', async () => {
    // UPDATE_PREVIOUSLY_FAILED is the only real dead end; the selection
    // policy rejections are the steady state on an up-to-date install.
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      reason: 'updatePreviouslyFailed',
    });
    await expect(checkForAppUpdates()).resolves.toBe('blocked-on-device');
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      reason: 'noUpdateAvailableOnServer',
    });
    await expect(checkForAppUpdates()).resolves.toBe('up-to-date');
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      reason: 'updateRejectedBySelectionPolicy',
    });
    await expect(checkForAppUpdates()).resolves.toBe('up-to-date');
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      reason: 'rollbackRejectedBySelectionPolicy',
    });
    await expect(checkForAppUpdates()).resolves.toBe('up-to-date');
  });

  it('reports up-to-date when a found update is already fetched', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: true,
    });
    (mockedList.fetchUpdateAsync as jest.Mock).mockResolvedValue({
      isNew: false,
    });
    await expect(checkForAppUpdates()).resolves.toBe('up-to-date');
  });

  it('wraps API failures in UpdateCheckError', async () => {
    (mockedList.checkForUpdateAsync as jest.Mock).mockRejectedValue(
      new Error('offline'),
    );
    await expect(checkForAppUpdates()).rejects.toThrow(UpdateCheckError);
  });
});

describe('describeUpdateCheckResult', () => {
  it('renders honest user-facing copy', () => {
    expect(describeUpdateCheckResult('up-to-date')).toMatch(/up to date/i);
    expect(describeUpdateCheckResult('update-downloaded')).toMatch(
      /restart/i,
    );
    expect(describeUpdateCheckResult('blocked-on-device')).toMatch(
      /can’t install/i,
    );
    expect(describeUpdateCheckResult('unavailable')).toMatch(
      /aren’t available/i,
    );
  });
});
