import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space, TouchTarget, tint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

/**
 * The one button in the app (DESIGN.md 1.6). RN's platform `<Button>` paints a
 * solid Material slab on Android and ignores the theme entirely, so it is not
 * used anywhere. Touch has no hover, so the table's hover column is the pressed
 * state.
 *
 * Disabled is *structural*, not a dimmed copy: the fill recedes toward the page
 * and the border goes dashed — a state that is not carried by colour alone.
 */
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'link' | 'danger';

type Props = Omit<PressableProps, 'style' | 'children' | 'disabled'> & {
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Trailing or leading glyph. Never the only label. */
  icon?: ReactNode;
  /** Buttons that carry a labelled icon instead of text. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Stretches to the width of its column (sidebar/footer actions). */
  block?: boolean;
};

export function Button({
  label,
  variant = 'default',
  disabled = false,
  icon,
  style,
  block = false,
  ...rest
}: Props) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        block && styles.block,
        variant === 'default' && { backgroundColor: theme.elev2, borderColor: theme.outlineVar },
        variant === 'primary' && { backgroundColor: theme.primary, borderColor: theme.primary },
        variant === 'ghost' && styles.ghost,
        variant === 'link' && styles.ghost,
        variant === 'danger' && {
          backgroundColor: theme.elev2,
          borderColor: theme.outlineVar,
        },
        variant === 'danger' &&
          pressed && { backgroundColor: tint(theme.error, 16), borderColor: theme.error },
        variant === 'primary' && pressed && { backgroundColor: theme.primaryHover },
        variant === 'default' && pressed && { backgroundColor: theme.elev3 },
        (variant === 'ghost' || variant === 'link') && pressed && { backgroundColor: theme.elev2 },
        disabled && {
          backgroundColor: theme.disabledBg,
          borderColor: theme.disabledBorder,
          borderStyle: 'dashed',
        },
        style,
      ]}
      {...rest}>
      {({ pressed }) => (
        <>
          {icon}
          <ThemedText
            type="strong"
            numberOfLines={1}
            style={[
              variant === 'default' && { color: theme.onSurface },
              variant === 'primary' && { color: theme.onPrimary },
              variant === 'ghost' && { color: pressed ? theme.onSurface : theme.onSurfaceVar },
              variant === 'link' && { color: theme.primary },
              variant === 'danger' && { color: theme.error },
              disabled && { color: theme.disabledFg },
            ]}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

/**
 * Icon-only affordance. Transparent at rest, `elev2` when pressed, and always
 * carries an accessible label (DESIGN.md 1.5).
 */
export function IconButton({
  children,
  label,
  style,
  ...rest
}: Omit<Props, 'label' | 'variant'> & { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: theme.elev2 },
        style,
      ]}
      {...rest}>
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TouchTarget,
    paddingHorizontal: Space[4],
    paddingVertical: Space[2],
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    // Explicit, not implied: on Android, removing borderStyle leaves the
    // native view dashed, so a button enabled after being disabled kept the
    // disabled treatment's dashes.
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Space[2],
  },
  block: { alignSelf: 'stretch' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  iconButton: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
});
