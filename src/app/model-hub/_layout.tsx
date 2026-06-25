import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { createModelDownloadStateStore } from '@/services/modelDownloadState';
import { createModelHubApi, ModelHubProvider, type ModelHubRestoreState } from '@/hooks/useModelHub';
import type { ModelHubApi } from '@/machines/modelHubMachine';
import type { CuratedModelId } from '@/catalog/modelManifest';

export default function ModelHubStackLayout() {
  const router = useRouter();
  const [api, setApi] = useState<ModelHubApi | null>(null);
  const [restore, setRestore] = useState<ModelHubRestoreState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await SQLite.openDatabaseAsync('curated_journal.db');
      const store = createModelDownloadStateStore(db);
      const downloadState = await store.get();
      if (cancelled) return;
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ModelHubProvider api={api} restore={restore}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="download" />
        <Stack.Screen name="import" options={{ presentation: 'modal', headerShown: true, title: 'Import custom model' }} />
      </Stack>
    </ModelHubProvider>
  );
}
