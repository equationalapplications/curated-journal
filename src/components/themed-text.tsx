import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'heading'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'label'
    | 'meta'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

// Default colour per type: section labels are muted, meta is tertiary,
// link-style text is the accent. `themeColor` overrides.
const DEFAULT_COLOR: Partial<Record<NonNullable<ThemedTextProps['type']>, ThemeColor>> = {
  label: 'onSurfaceVar',
  meta: 'outline',
  linkPrimary: 'primary',
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? DEFAULT_COLOR[type] ?? 'onSurface'] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: Type.body,
  title: Type.title,
  heading: Type.heading,
  subtitle: Type.heading,
  small: Type.secondary,
  smallBold: { ...Type.secondary, fontWeight: '600' },
  label: Type.label,
  meta: Type.meta,
  link: { ...Type.secondary, lineHeight: 30 },
  linkPrimary: { ...Type.secondary, lineHeight: 30, fontWeight: '500' },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
});
