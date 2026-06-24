import { useEffect, useState } from 'react';
import * as Battery from 'expo-battery';
import { getModelPath } from '@/lib/entityStorage';

export function useNightShiftGates() {
  const [charging, setCharging] = useState(false);
  const [hasModel, setHasModel] = useState(false);

  useEffect(() => {
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

  return { charging, hasModel, canStart: charging && hasModel };
}
