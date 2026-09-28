import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Note } from '@/components/ui/states';
import { ProgressBar } from '@/components/ui/progress';
import { Screen } from '@/components/screen';
import { getCuratedModel } from '@/catalog/modelManifest';
import { Space, TouchTarget } from '@/constants/theme';
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const samples = useRef<{ t: number; bytes: number }[]>([]);

  // SDK 57 edge-to-edge: lift the name input above the keyboard ourselves
  // (KeyboardAvoidingView is unreliable here; KeyboardAwareScrollView needs
  // the whole screen as a scroll view, which fights the fixed progress UI).
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    // Best-effort: browsers may deny the Wake Lock (e.g. hidden tab).
    activateKeepAwakeAsync('model-download').catch(() => {});
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
      <View style={[styles.container, { paddingBottom: keyboardHeight }]}>
        <View style={styles.intro}>
          <ThemedText type="title">Downloading your AI</ThemedText>
          {model ? <ThemedText type="heading">{model.displayName}</ThemedText> : null}
          {model ? (
            <ThemedText type="small" themeColor="onSurfaceVar">
              {model.tagline}
            </ThemedText>
          ) : null}
          <ThemedText type="small">Keep this screen open for the fastest download.</ThemedText>
        </View>

        {pct === null ? (
          <ThemedText type="small" themeColor="onSurfaceVar">
            Starting download…
          </ThemedText>
        ) : (
          <ProgressBar value={pct / 100} />
        )}

        {speedBps > 0 ? (
          <ThemedText type="small" themeColor="onSurfaceVar">
            {formatSpeed(speedBps)} — {formatEta(etaSeconds)}
          </ThemedText>
        ) : null}

        {stateValue === 'downloading' ? (
          <Button
            label="Pause"
            variant="default"
            style={styles.compact}
            onPress={() => send({ type: 'PAUSE' })}
          />
        ) : null}
        {stateValue === 'paused' ? (
          <View style={styles.row}>
            <ThemedText type="small" style={styles.rowCopy}>
              {pausedReason === 'background' ? 'Paused (resuming…)' : 'Paused'}
            </ThemedText>
            <Button label="Resume" variant="primary" onPress={() => send({ type: 'RESUME' })} />
          </View>
        ) : null}
        {stateValue === 'failed' && error ? (
          <View style={styles.row}>
            <ThemedText type="small" style={styles.rowCopy}>
              {ERROR_COPY[error.code] ?? error.message}
            </ThemedText>
            <Button label="Retry" variant="primary" onPress={() => send({ type: 'RETRY' })} />
          </View>
        ) : null}

        <Note style={styles.tip}>{TIPS[tipIndex]}</Note>

        <View style={styles.composerSlot}>
          <Input
            style={styles.input}
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
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space[4], gap: Space[3] },
  intro: { gap: Space[2] },
  compact: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Space[3] },
  rowCopy: { flex: 1 },
  tip: { marginTop: Space[2] },
  input: { minHeight: TouchTarget },
  // Bottom-anchor the name input so the keyboard-height paddingBottom lifts
  // it (flex-start content alone would just clip under the keyboard).
  composerSlot: { marginTop: 'auto' },
});
