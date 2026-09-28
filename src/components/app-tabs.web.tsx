import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Radius, Space, TouchTarget } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explore</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={styles.tabButtonView}>
      <ThemedView
        type={isFocused ? 'primaryContainer' : 'elev1'}
        style={styles.tabButtonInner}>
        <ThemedText
          type={isFocused ? 'strong' : 'small'}
          themeColor={isFocused ? 'onPrimaryCont' : 'onSurfaceVar'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="elev1" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          Expo Starter
        </ThemedText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="linkPrimary">Docs</ThemedText>
            <SymbolView
              tintColor={colors.primary}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Space[3],
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Space[2],
    paddingHorizontal: Space[5],
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Space[2],
    maxWidth: MaxContentWidth,
  },
  brandText: { marginRight: 'auto' },
  tabButtonView: { borderRadius: Radius.sm },
  tabButtonInner: {
    paddingVertical: Space[1],
    paddingHorizontal: Space[3],
    borderRadius: Radius.sm,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space[1],
    marginLeft: Space[3],
    minHeight: TouchTarget,
  },
});
