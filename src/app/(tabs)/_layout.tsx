import { StyleSheet, type ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useAppReady } from '@/contexts/AppReadyContext';
import { useTheme } from '@/hooks/use-theme';

function TabIcon({
  name,
  color,
  size,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export default function TabsLayout() {
  const isReady = useAppReady();
  const theme = useTheme();
  if (!isReady) {
    return <Redirect href="/model-hub" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 17, fontWeight: '600', color: theme.onSurface },
        // Bottom tab bar: elev-1 with a separator hairline; active = primary
        // glyph and label, no filled pill (DESIGN.md Part 3).
        tabBarStyle: {
          backgroundColor: theme.elev1,
          borderTopColor: theme.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.onSurfaceVar,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
      }}>
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          // Without this the tab's accessible name is the SymbolView glyph
          // followed by the label, so a screen reader announces the raw glyph.
          tabBarAccessibilityLabel: 'Journal',
          tabBarIcon: ({ color, size }) => (
            <TabIcon
              name={{ ios: 'book', android: 'book', web: 'book' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="graph"
        options={{
          title: 'Graph',
          tabBarAccessibilityLabel: 'Graph',
          tabBarIcon: ({ color, size }) => (
            <TabIcon
              name={{ ios: 'point.3.connected.trianglepath.dotted', android: 'hub', web: 'hub' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <TabIcon
              name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
