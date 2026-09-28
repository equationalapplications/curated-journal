import { useMemo } from 'react';

import { Fonts, Radius, Space, Type, tint, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const heading = (size: number, lineHeight: number, weight: '500' | '600', color: string) => ({
  flexDirection: 'row' as const,
  fontSize: size,
  lineHeight,
  fontWeight: weight,
  color,
});

/**
 * `react-native-markdown-display` ships its own palette — hardcoded `#000`
 * rules, `#f5f5f5` code fills, `borderColor: '#000000'` tables. Per DESIGN.md
 * 1.6 ("third-party components"), every one of those chrome values is mapped
 * onto our tokens here. The user's own content (emphasis, strikethrough) is
 * left alone.
 */
export function markdownStyles(theme: Theme) {
  return {
    body: { color: theme.onSurface },

    // Headings — the type roles, not the library's 32/24/18 ladder.
    heading1: heading(24, 32, '600', theme.onSurface),
    heading2: heading(20, 28, '600', theme.onSurface),
    heading3: heading(18, 26, '600', theme.onSurface),
    heading4: heading(16, 24, '600', theme.onSurface),
    heading5: heading(16, 24, '500', theme.onSurfaceVar),
    heading6: { ...heading(14, 20, '600', theme.onSurfaceVar), ...Type.label, fontSize: 14 },

    hr: { backgroundColor: theme.separator, height: 1, marginVertical: Space[4] },

    // Content emphasis is the user's, not the chrome's.
    strong: { fontWeight: '600' as const },
    em: { fontStyle: 'italic' as const },
    s: { textDecorationLine: 'line-through' as const, color: theme.onSurfaceVar },

    blockquote: {
      backgroundColor: theme.elev1,
      borderColor: theme.outlineVar,
      borderLeftWidth: 2,
      marginLeft: 0,
      marginVertical: Space[3],
      paddingHorizontal: Space[3],
      paddingVertical: Space[2],
      borderRadius: Radius.sm,
    },

    bullet_list: { marginVertical: Space[2] },
    ordered_list: { marginVertical: Space[2] },
    list_item: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-start' as const,
      marginBottom: Space[1],
    },
    bullet_list_icon: { marginLeft: 0, marginRight: Space[2], color: theme.onSurfaceVar },
    ordered_list_icon: { marginLeft: 0, marginRight: Space[2], color: theme.onSurfaceVar },
    bullet_list_content: { flex: 1 },
    ordered_list_content: { flex: 1 },

    // Monospace is for identifiers — which is exactly what code is.
    code_inline: {
      borderWidth: 0,
      backgroundColor: theme.elev2,
      color: theme.onSurface,
      paddingHorizontal: Space[1],
      paddingVertical: 2,
      borderRadius: Radius.sm,
      fontFamily: Fonts.mono,
      fontSize: 14,
    },
    code_block: {
      borderWidth: 1,
      borderColor: theme.outlineVar,
      backgroundColor: theme.elev1,
      color: theme.onSurface,
      padding: Space[3],
      borderRadius: Radius.sm,
      fontFamily: Fonts.mono,
      fontSize: 13,
      lineHeight: 20,
    },
    fence: {
      borderWidth: 1,
      borderColor: theme.outlineVar,
      backgroundColor: theme.elev1,
      color: theme.onSurface,
      padding: Space[3],
      borderRadius: Radius.sm,
      fontFamily: Fonts.mono,
      fontSize: 13,
      lineHeight: 20,
    },

    table: { borderWidth: 1, borderColor: theme.outlineVar, borderRadius: Radius.sm },
    thead: { backgroundColor: theme.elev1 },
    tbody: {},
    th: { flex: 1, padding: Space[2] },
    tr: { borderBottomWidth: 1, borderColor: theme.separator, flexDirection: 'row' as const },
    td: { flex: 1, padding: Space[2] },

    link: { textDecorationLine: 'underline' as const, color: theme.primary },
    blocklink: { flex: 1, borderColor: theme.primary, borderBottomWidth: 1 },

    image: { flex: 1, borderRadius: Radius.sm, backgroundColor: tint(theme.onSurface, 6) },

    text: { color: theme.onSurface },
    textgroup: {},
    paragraph: {
      marginTop: Space[3],
      marginBottom: Space[3],
      flexWrap: 'wrap' as const,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'flex-start' as const,
      width: '100%' as const,
    },
    hardbreak: { width: '100%' as const, height: 1 },
    softbreak: {},

    pre: {},
    inline: {},
    span: {},
  };
}

export function useMarkdownStyles() {
  const theme = useTheme();
  return useMemo(() => markdownStyles(theme), [theme]);
}
