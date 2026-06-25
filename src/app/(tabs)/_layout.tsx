import { Redirect, Tabs } from 'expo-router';
import { useAppReady } from '@/contexts/AppReadyContext';

export default function TabsLayout() {
  const isReady = useAppReady();
  if (!isReady) {
    return <Redirect href="/model-hub" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="graph" options={{ title: 'Graph' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
