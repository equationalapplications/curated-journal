import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Themed text field (DESIGN.md 1.6): `bg` fill, `outlineVar` border, `r-sm`,
 * `outline` placeholder, `onSurface` text. Disabled fields drop the dash — a
 * dashed field reads as a glitch — and lean on the fainter border alone.
 */
export function Input({ style, disabled, ...rest }: TextInputProps & { disabled?: boolean }) {
  const theme = useTheme();
  return (
    <TextInput
      editable={!disabled}
      accessibilityState={{ disabled: Boolean(disabled) }}
      placeholderTextColor={theme.outline}
      selectionColor={theme.primary}
      style={[
        styles.input,
        {
          backgroundColor: disabled ? theme.elev1 : theme.bg,
          borderColor: theme.outlineVar,
          color: theme.onSurface,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Space[3],
    paddingVertical: Space[2],
    fontSize: 16,
    lineHeight: 22,
    minHeight: 44,
  },
});
