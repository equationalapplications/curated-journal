import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';

// React 19 + react-test-renderer needs this for act-aware scheduling of hook renders.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import * as Battery from 'expo-battery';
import { getModelPath } from '@/lib/entityStorage';

jest.mock('expo-battery', () => ({
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 },
  getPowerStateAsync: jest.fn(),
  addBatteryStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@/lib/entityStorage', () => ({
  getModelPath: jest.fn(),
}));

const BATTERY = jest.mocked(Battery, true);
const STORE = jest.mocked(getModelPath);

function setPlatformOS(os: string) {
  Object.defineProperty(Platform, 'OS', {
    value: os,
    configurable: true,
  });
}

describe('useNightShiftGates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS('ios');
  });

  describe('web (explicit policy: no charging gate)', () => {
    it('starts with a model even when the browser reports no battery state', async () => {
      setPlatformOS('web');
      BATTERY.getPowerStateAsync.mockResolvedValue({
        batteryState: Battery.BatteryState.UNKNOWN,
      } as Battery.BatteryState);
      STORE.mockResolvedValue('/docs/model.gguf');

      const { result } = await renderHook(() => useNightShiftGates());
      await waitFor(() => expect(result.current.hasModel).toBe(true));
      expect(result.current.canStart).toBe(true);
      expect(BATTERY.addBatteryStateListener).not.toHaveBeenCalled();
    });
  });

  describe('native (charging gate preserved)', () => {
    it('starts when charging and a model is present', async () => {
      BATTERY.getPowerStateAsync.mockResolvedValue({
        batteryState: Battery.BatteryState.CHARGING,
      } as Battery.BatteryState);
      STORE.mockResolvedValue('/docs/model.gguf');

      const { result } = await renderHook(() => useNightShiftGates());
      await waitFor(() => expect(result.current.canStart).toBe(true));
      expect(BATTERY.addBatteryStateListener).toHaveBeenCalled();
    });

    it('stays blocked when the battery state is unknown', async () => {
      BATTERY.getPowerStateAsync.mockResolvedValue({
        batteryState: Battery.BatteryState.UNKNOWN,
      } as Battery.BatteryState);
      STORE.mockResolvedValue('/docs/model.gguf');

      const { result } = await renderHook(() => useNightShiftGates());
      await waitFor(() => expect(result.current.hasModel).toBe(true));
      expect(result.current.canStart).toBe(false);
    });
  });
});
