import { checkNetworkGate } from '@/lib/networkGate';

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE', UNKNOWN: 'UNKNOWN' },
}));

describe('networkGate', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns wifi when connected over WIFI', async () => {
    const Network = require('expo-network');
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.WIFI,
    });
    await expect(checkNetworkGate()).resolves.toBe('wifi');
  });

  it('returns cellular when connected over CELLULAR', async () => {
    const Network = require('expo-network');
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.CELLULAR,
    });
    await expect(checkNetworkGate()).resolves.toBe('cellular');
  });

  it('returns offline when not connected', async () => {
    const Network = require('expo-network');
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
      type: Network.NetworkStateType.NONE,
    });
    await expect(checkNetworkGate()).resolves.toBe('offline');
  });

  it('treats an unknown connected type as offline (fail closed)', async () => {
    const Network = require('expo-network');
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.UNKNOWN,
    });
    await expect(checkNetworkGate()).resolves.toBe('offline');
  });

  it('assumes wifi in dev when the native module is missing', async () => {
    jest.doMock('expo-network', () => {
      throw new Error('Cannot find native module ExpoNetwork');
    });
    jest.resetModules();
    const { checkNetworkGate: check } = require('@/lib/networkGate');
    await expect(check()).resolves.toBe('wifi');
  });
});
