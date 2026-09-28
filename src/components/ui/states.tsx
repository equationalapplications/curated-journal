import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';

import { Radius, Space, tint } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

type IconTileProps = {
  name: SymbolViewProps['name'];
  size?: number;
  tone?: 'quiet' | 'accent';
  style?: StyleProp<ViewStyle>;
};

/** Empty-state / dialog-header icon tile: a glyph centred in an `r-lg` box. */
export function IconTile({ name, size = 20, tone = 'quiet', style }: IconTileProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: tone === 'accent' ? theme.primaryContainer : theme.elev1 },
        style,
      ]}>
      <SymbolView
        name={name}
        size={size}
        weight="regular"
        tintColor={tone === 'accent' ? theme.primary : theme.onSurfaceVar}
      />
    </View>
  );
}

type EmptyStateProps = {
  icon: SymbolViewProps['name'];
  title: string;
  hint?: string;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one empty state (DESIGN.md 1.6): 34px icon tile, 500-weight headline,
 * muted hint, then actions. Never a lone floating line, never italic.
 */
export function EmptyState({ icon, title, hint, actions, style }: EmptyStateProps) {
  return (
    <View style={[styles.empty, style]}>
      <IconTile name={icon} />
      <ThemedText type="strong" style={styles.emptyTitle}>
        {title}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="onSurfaceVar" style={styles.emptyHint}>
          {hint}
        </ThemedText>
      ) : null}
      {actions ? <View style={styles.emptyActions}>{actions}</View> : null}
    </View>
  );
}

type ErrorBannerProps = {
  message: string;
  /** Optional inline recovery action. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Status is a tint, never a solid slab behind small text (DESIGN.md 1.2):
 * `error` text on a 10% `error` fill with a 30% `error` border.
 */
export function ErrorBanner({ message, action, style }: ErrorBannerProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          backgroundColor: tint(theme.error, 10),
          borderColor: tint(theme.error, 30),
        },
        style,
      ]}>
      <ThemedText type="small" style={[styles.bannerText, { color: theme.error }]}>
        {message}
      </ThemedText>
      {action}
    </View>
  );
}

/**
 * Informational chrome that is not a failure — a quiet `elev1` card with an
 * `outlineVar` boundary, the same shape as a dialog body panel. Reserved for
 * status that is neither `error` nor `success`.
 */
export function Note({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.elev1, borderColor: theme.outlineVar },
        style,
      ]}>
      <ThemedText type="small" themeColor="onSurfaceVar" style={styles.bannerText}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space[6],
    paddingHorizontal: Space[5],
    gap: Space[2],
  },
  emptyTitle: { textAlign: 'center' },
  emptyHint: { textAlign: 'center', maxWidth: 320 },
  emptyActions: { marginTop: Space[2], flexDirection: 'row', gap: Space[2] },
  banner: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Space[3],
    gap: Space[2],
  },
  bannerText: { lineHeight: 20 },
});
