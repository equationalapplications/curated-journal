import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { createModelDownloadStateStore } from '@/services/modelDownloadState';
import { createModelHubApi, ModelHubProvider, type ModelHubRestoreState } from '@/hooks/useModelHub';
import { useTheme } from '@/hooks/use-theme';
import { getModelId } from '@/lib/entityStorage';
import type { ModelHubApi } from '@/machines/modelHubMachine';
import type { CuratedModelId } from '@/catalog/modelManifest';

export default function ModelHubStackLayout() {
  const router = useRouter();
  const theme = useTheme();
  const [api, setApi] = useState<ModelHubApi | null>(null);
  const [restore, setRestore] = useState<ModelHubRestoreState | undefined>(undefined);
  const [currentModelId, setCurrentModelId] = useState<CuratedModelId | 'custom' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await SQLite.openDatabaseAsync('curated_journal.db');
      const store = createModelDownloadStateStore(db);
      const downloadState = await store.get();
      if (cancelled) return;
      const storedModelId = await getModelId();
      if (cancelled) return;
      setCurrentModelId((storedModelId as CuratedModelId | 'custom' | null) ?? null);
      setApi(createModelHubApi(store));
      if (downloadState && (downloadState.status === 'downloading' || downloadState.status === 'paused')) {
        if (downloadState.modelId) {
          setRestore({
            modelId: downloadState.modelId as CuratedModelId,
            status: downloadState.status,
            pauseState: downloadState.pauseState,
          });
        }
        router.replace('/model-hub/download' as Href);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!api) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <ModelHubProvider api={api} restore={restore} currentModelId={currentModelId}>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: theme.bg },
          headerShadowVisible: false,
          headerTintColor: theme.onSurface,
          headerTitleStyle: { fontSize: 17, fontWeight: '600', color: theme.onSurface },
          contentStyle: { backgroundColor: theme.bg },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="download" />
        <Stack.Screen
          name="import"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Import custom model',
          }}
        />
      </Stack>
    </ModelHubProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
