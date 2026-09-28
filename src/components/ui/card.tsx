import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Option card: `elev1` fill, `outlineVar` border, `r-sm`, `sp-3` padding. */
export function Card({ children, style }: CardProps) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.elev1, borderColor: theme.outlineVar }, style]}>
      {children}
    </View>
  );
}

/**
 * Grouped list: a bordered `elev1` group with `separator` hairlines between
 * rows. Put `ListRow`s (or plain `Row`s) inside it.
 */
export function ListGroup({ children, style }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.group, { backgroundColor: theme.elev1, borderColor: theme.outlineVar }, style]}>
      {children}
    </View>
  );
}

type RowProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Draws the `separator` hairline under this row. */
  divider?: boolean;
};

/** A static row inside a `ListGroup` — no press affordance. */
export function Row({ children, style, divider = true }: RowProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator },
        style,
      ]}>
      {children}
    </View>
  );
}

type ListRowProps = RowProps & {
  onPress: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
};

/**
 * Pressable row: `elev2` when pressed, `primaryContainer` + weight 500 when
 * selected — selection is structure, not a dimmed copy.
 */
export function ListRow({
  children,
  style,
  selected,
  divider = true,
  accessibilityLabel,
  onPress,
}: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.elev2 },
        selected && { backgroundColor: theme.primaryContainer },
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Space[3],
    gap: Space[1],
  },
  group: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  row: {
    minHeight: TouchTarget,
    paddingHorizontal: Space[3],
    paddingVertical: Space[3],
    gap: Space[1],
  },
});
