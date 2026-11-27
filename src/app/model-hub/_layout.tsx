import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { getModelDownloadController } from '@/services/modelDownloadController';
import { createModelHubApi, ModelHubProvider, toRestoreState, type ModelHubRestoreState } from '@/hooks/useModelHub';
import { CellularConfirm } from '@/components/model-hub/cellular-confirm';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { getModelId } from '@/lib/entityStorage';
import { smokeTestSettled, type ModelHubApi } from '@/machines/modelHubMachine';
import type { CuratedModelId } from '@/catalog/modelManifest';

export default function ModelHubStackLayout() {
  const router = useRouter();
  const theme = useTheme();
  const [api, setApi] = useState<ModelHubApi | null>(null);
  const [restore, setRestore] = useState<ModelHubRestoreState | undefined>(undefined);
  const [currentModelId, setCurrentModelId] = useState<CuratedModelId | 'custom' | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by the Retry button only. The layout never retries on its own.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A smoke test started before the hub was last closed may still be
        // loading; its `smoke-testing` marker only means a kill once it settles.
        await smokeTestSettled();
        if (cancelled) return;
        const downloads = getModelDownloadController();
        const snapshot = await downloads.load();
        if (cancelled) return;
        const storedModelId = await getModelId();
        if (cancelled) return;
        setCurrentModelId((storedModelId as CuratedModelId | 'custom' | null) ?? null);
        setApi(createModelHubApi(downloads));
        const row = snapshot.row;
        const source = row ? { modelId: row.modelId, status: row.status, pauseState: snapshot.pauseState } : null;
        let restoreState: ModelHubRestoreState | null;
        if (snapshot.phase === 'active' && snapshot.modelId) {
          // A transfer is running in this process: attach to it, no network check (H9).
          restoreState = { modelId: snapshot.modelId, status: 'downloading', pauseState: snapshot.pauseState, live: true };
        } else if (snapshot.phase === 'completed' && snapshot.modelId) {
          // The file finished while no hub was open: verify it (H9b).
          restoreState = {
            modelId: snapshot.modelId,
            status: 'downloading',
            pauseState: snapshot.pauseState,
            finished: true,
          };
        } else {
          restoreState = toRestoreState(source, storedModelId);
        }
        setLoadFailed(false);
        if (restoreState) {
          setRestore(restoreState);
          router.replace('/model-hub/download' as Href);
        } else if (row && row.status !== 'idle' && row.status !== 'failed') {
          // A saved install this bundle cannot restore (removed model, unknown
          // status), or a smoke-testing marker for a model already committed.
          try {
            await downloads.abandon();
          } catch (cause) {
            console.warn('[model-hub] could not clear an unrestorable download state', cause);
          }
        }
      } catch (cause) {
        if (cancelled) return;
        console.warn('[model-hub] could not load the download state', cause);
        setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  const retry = useCallback(() => {
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  if (!api && loadFailed) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ThemedText type="small" testID="model-hub-load-error">
          Could not load your model downloads. Try again.
        </ThemedText>
        <Button label="Retry" variant="primary" onPress={retry} testID="model-hub-load-retry" />
      </View>
    );
  }

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
      <CellularConfirm />
    </ModelHubProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
});
