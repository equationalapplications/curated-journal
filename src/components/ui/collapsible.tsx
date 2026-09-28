import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Radius, Space, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => [styles.heading, pressed && { backgroundColor: theme.elev2 }]}
        onPress={() => setIsOpen((value) => !value)}>
        <View style={styles.button}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            weight="semibold"
            tintColor={theme.onSurfaceVar}
            style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
          />
        </View>
        <ThemedText type="small">{title}</ThemedText>
      </Pressable>
      {isOpen ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Card style={styles.content}>{children}</Card>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    minHeight: TouchTarget,
    paddingHorizontal: Space[2],
    borderRadius: Radius.sm,
  },
  button: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  content: { marginTop: Space[2], marginLeft: Space[4] },
});
