export type NetworkGateState = 'wifi' | 'cellular' | 'offline';

/**
 * Loaded on demand so Metro can bundle JS before the dev client is rebuilt with
 * expo-network. If the native module is missing, dev builds assume Wi-Fi (simulator).
 */
async function getNetworkState(): Promise<{
  isConnected: boolean | null;
  type: string | null;
}> {
  try {
    const Network = require('expo-network') as typeof import('expo-network');
    return await Network.getNetworkStateAsync();
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[networkGate] expo-network native module unavailable — assuming Wi-Fi. Rebuild the dev client: npx expo run:ios',
        error,
      );
      return { isConnected: true, type: 'WIFI' };
    }
    throw error;
  }
}

export async function checkNetworkGate(): Promise<NetworkGateState> {
  const state = await getNetworkState();
  if (!state.isConnected) return 'offline';
  if (state.type === 'WIFI') return 'wifi';
  if (state.type === 'CELLULAR') return 'cellular';
  return 'offline';
}
