import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/screen';
import { getCuratedModel } from '@/catalog/modelManifest';
import { Spacing } from '@/constants/theme';
import { setDisplayName } from '@/lib/entityStorage';
import { useModelHub } from '@/hooks/useModelHub';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';

const TIPS = [
  'Night Shift runs the librarian pass while your device is charging.',
  'The emergent graph invents its own types as it learns about your notes during maintenance.',
  'Export an OKF backup any time from Settings — your notes are always portable.',
];

const ERROR_COPY: Record<string, string> = {
  'disk-full': 'Not enough storage space. Please free up at least 3GB and try again.',
  network: 'Download failed. Check your connection and try again.',
};

function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const mins = Math.round(seconds / 60);
  return mins <= 1 ? '~1 min remaining' : `~${mins} mins remaining`;
}

export default function ModelHubDownloadScreen() {
  const router = useRouter();
  const { send, stateValue, modelId, progress, error, pausedReason, displayName } = useModelHub();
  const completeOnboarding = useModelHubCompletion();
  const [name, setName] = useState(displayName ?? '');
  const [tipIndex, setTipIndex] = useState(0);
  const samples = useRef<{ t: number; bytes: number }[]>([]);

  useEffect(() => {
    void activateKeepAwakeAsync('model-download');
    return () => {
      void deactivateKeepAwake('model-download');
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    samples.current.push({ t: Date.now(), bytes: progress.bytesWritten });
    if (samples.current.length > 5) samples.current.shift();
  }, [progress.bytesWritten]);

  useEffect(() => {
    if (stateValue === 'complete') {
      void completeOnboarding().then(() => router.replace('/'));
    }
  }, [stateValue, completeOnboarding, router]);

  const oldest = samples.current[0];
  const newest = samples.current.at(-1);
  const elapsedSeconds = oldest && newest ? (newest.t - oldest.t) / 1000 : 0;
  const bytesDelta = oldest && newest ? newest.bytes - oldest.bytes : 0;
  const speedBps = elapsedSeconds > 0 ? bytesDelta / elapsedSeconds : 0;
  const remainingBytes = progress.totalBytes - progress.bytesWritten;
  const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : -1;
  const pct = progress.totalBytes > 0 ? Math.min(100, (progress.bytesWritten / progress.totalBytes) * 100) : null;
  const model = modelId ? getCuratedModel(modelId) : null;

  return (
    <Screen>
      <View style={styles.container}>
      <ThemedText type="title">Downloading your AI</ThemedText>
      {model ? <ThemedText type="subtitle">{model.displayName}</ThemedText> : null}
      {model ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.tagline}
        </ThemedText>
      ) : null}
      <ThemedText type="small">Keep this screen open for the fastest download.</ThemedText>

      {pct === null ? (
        <ThemedText type="small">Starting download…</ThemedText>
      ) : (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      )}

      {speedBps > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {formatSpeed(speedBps)} — {formatEta(etaSeconds)}
        </ThemedText>
      )}

      {stateValue === 'downloading' && (
        <Pressable onPress={() => send({ type: 'PAUSE' })}>
          <ThemedText type="link">Pause</ThemedText>
        </Pressable>
      )}
      {stateValue === 'paused' && (
        <View style={styles.row}>
          <ThemedText type="small">{pausedReason === 'background' ? 'Paused (resuming…)' : 'Paused'}</ThemedText>
          <Pressable onPress={() => send({ type: 'RESUME' })}>
            <ThemedText type="link">Resume</ThemedText>
          </Pressable>
        </View>
      )}
      {stateValue === 'failed' && error && (
        <View style={styles.row}>
          <ThemedText type="small">{ERROR_COPY[error.code] ?? error.message}</ThemedText>
          <Pressable onPress={() => send({ type: 'RETRY' })}>
            <ThemedText type="link">Retry</ThemedText>
          </Pressable>
        </View>
      )}

      <ThemedView type="backgroundElement" style={styles.tip}>
        <ThemedText type="small">{TIPS[tipIndex]}</ThemedText>
      </ThemedView>

      <TextInput
        placeholder="Name your journal (optional)"
        value={name}
        onChangeText={setName}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed) {
            send({ type: 'SET_DISPLAY_NAME', displayName: trimmed });
            void setDisplayName(trimmed);
          }
        }}
        style={styles.input}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#3338', overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#3c87f7' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tip: { borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 1, borderColor: '#8888', borderRadius: Spacing.two, padding: Spacing.two },
});
