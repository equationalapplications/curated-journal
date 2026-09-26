import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { getModelPath } from '@/lib/entityStorage';

export function useNightShiftGates() {
  const [charging, setCharging] = useState(false);
  const [hasModel, setHasModel] = useState(false);

  useEffect(() => {
    // Web policy: Night Shift skips the charging gate. The Battery API is only
    // reliable in Chromium (navigator.getBattery); elsewhere expo-battery
    // reports UNKNOWN, which would permanently block canStart. Night Shift's
    // heavy inference does not threaten a desktop/laptop power budget.
    if (Platform.OS === 'web') {
      setCharging(true);
      (async () => {
        setHasModel(Boolean(await getModelPath()));
      })();
      return;
    }
    let sub: Battery.Subscription | undefined;
    (async () => {
      const state = await Battery.getPowerStateAsync();
      setCharging(
        state.batteryState === Battery.BatteryState.CHARGING ||
          state.batteryState === Battery.BatteryState.FULL,
      );
      sub = Battery.addBatteryStateListener(({ batteryState }) => {
        setCharging(
          batteryState === Battery.BatteryState.CHARGING ||
            batteryState === Battery.BatteryState.FULL,
        );
      });
      setHasModel(Boolean(await getModelPath()));
    })();
    return () => sub?.remove();
  }, []);

  const simulatorDevBypass = __DEV__ && !Device.isDevice;
  const chargingOk = charging || simulatorDevBypass;

  return { charging: chargingOk, hasModel, canStart: chargingOk && hasModel };
}
