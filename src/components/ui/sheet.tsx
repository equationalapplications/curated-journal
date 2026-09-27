import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Right-aligned actions on the `elev1` footer. */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The dialog shape translated to mobile (DESIGN.md Part 3): `surface` panel,
 * `outlineVar` boundary, `r-lg` top corners, a `backdrop-modal` scrim, and an
 * `elev1` footer separated by a `separator` hairline. Tapping the scrim or the
 * hardware back button dismisses.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, style }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[styles.scrim, { backgroundColor: theme.backdropModal }]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.outlineVar,
              paddingBottom: insets.bottom + Space[3],
            },
            style,
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.outlineVar }]} />
          {title ? (
            <View style={styles.header}>
              <ThemedText type="heading">{title}</ThemedText>
              {subtitle ? (
                <ThemedText type="small" themeColor="onSurfaceVar">
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          {children ? <View style={styles.body}>{children}</View> : null}
          {footer ? (
            <View
              style={[
                styles.footer,
                { backgroundColor: theme.elev1, borderTopColor: theme.separator },
              ]}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: Space[2],
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
    marginBottom: Space[2],
  },
  header: { paddingHorizontal: Space[4], paddingBottom: Space[2], gap: Space[1] },
  body: { paddingHorizontal: Space[4], paddingBottom: Space[2], gap: Space[2] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space[2],
    paddingVertical: Space[3],
    paddingHorizontal: Space[4],
    marginTop: Space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
