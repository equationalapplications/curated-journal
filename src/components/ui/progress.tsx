import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** 0–1. Clamped. */
  value: number;
  style?: StyleProp<ViewStyle>;
};

/** 4px pill track on `elev-2` with a `primary` fill (DESIGN.md 1.6). */
export function ProgressBar({ value, style }: Props) {
  const theme = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      style={[styles.track, { backgroundColor: theme.elev2 }, style]}>
      <View style={[styles.fill, { backgroundColor: theme.primary, width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginVertical: Space[2],
  },
  fill: { height: 4, borderRadius: Radius.pill },
});
