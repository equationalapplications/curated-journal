import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useAppReady } from '@/contexts/AppReadyContext';

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
  if (!isReady) {
    return <Redirect href="/model-hub" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
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
