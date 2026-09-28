import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEntityStatus } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress';
import { Screen } from '@/components/screen';
import { resetNightShiftLlmProgress, setNightShiftActive } from '@/lib/llamaProvider';
import {
  nightShiftDetailLabel,
  nightShiftOperationTitle,
  nightShiftPhaseLabel,
  nightShiftStepLabel,
} from '@/lib/nightShiftCopy';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalWiki } from '@/hooks/useJournalWiki';
import { useNightShiftProgress } from '@/hooks/useNightShiftProgress';
import { useTheme } from '@/hooks/use-theme';
import { tint } from '@/constants/theme';

export function NightShiftScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const status = useEntityStatus(entityId);
  const {
    send,
    queueIndex,
    queueLength,
    currentOperation,
    isStepRunning,
    isAdvancing,
    isNightShift,
    nightShiftOutcome,
  } = useJournalWiki();
  const { progress, llm } = useNightShiftProgress(
    queueIndex,
    queueLength,
    isStepRunning,
    isNightShift,
  );
  const theme = useTheme();
  const [hasStartedNightShift, setHasStartedNightShift] = useState(false);
  const prevOperationRef = useRef(currentOperation);
  const pulse = useSharedValue(1);
  // hasStartedNightShift guards the first render, before START resets a
  // 'completed' outcome left over from a previous visit.
  const nightShiftFinished = nightShiftOutcome === 'completed';
  const finished = hasStartedNightShift && nightShiftFinished && !isNightShift;
  const stepLabel = nightShiftStepLabel({
    queueIndex,
    queueLength,
    isNightShift,
    isAdvancing,
    hasStarted: hasStartedNightShift,
    nightShiftFinished,
  });

  useEffect(() => {
    // Best-effort: browsers may deny the Wake Lock (e.g. hidden tab).
    activateKeepAwakeAsync('night-shift').catch(() => {});
    setNightShiftActive(true);
    setHasStartedNightShift(true);
    send({
      type: 'START_NIGHT_SHIFT',
      queue: [
        { operation: 'librarian', entityId },
        { operation: 'heal', entityId },
      ],
    });
    return () => {
      deactivateKeepAwake('night-shift');
      setNightShiftActive(false);
    };
  }, [entityId, send]);

  useEffect(() => {
    if (
      prevOperationRef.current &&
      currentOperation &&
      prevOperationRef.current !== currentOperation
    ) {
      resetNightShiftLlmProgress();
    }
    prevOperationRef.current = currentOperation;
  }, [currentOperation]);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.08, { duration: 1200 }), -1, true);
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.35,
  }));

  const clock = useMemo(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, []);

  const progressPct = finished ? 100 : Math.min(99, Math.round(progress * 100));

  return (
    <Screen>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.ring,
            ringStyle,
            { borderColor: tint(theme.primary, 45) },
          ]}
        />
        <View style={styles.copyBlock}>
          <ThemedText type="meta" themeColor="outline" style={styles.clock}>
            {clock}
          </ThemedText>
          <ThemedText type="title" style={styles.operationTitle}>
            {nightShiftOperationTitle(currentOperation)}
          </ThemedText>
          <ThemedText type="strong" style={styles.phaseText}>
            {nightShiftPhaseLabel(currentOperation, status, llm, finished)}
          </ThemedText>
          <ThemedText type="small" themeColor="onSurfaceVar" style={styles.detailText}>
            {nightShiftDetailLabel(currentOperation, finished)}
          </ThemedText>
          <ThemedText type="small" themeColor="outline" style={styles.stepText}>
            {stepLabel}
          </ThemedText>
          <View style={styles.progressBlock}>
            <ProgressBar value={finished ? 1 : Math.min(0.99, progress)} />
            <ThemedText type="meta" themeColor="outline" style={styles.progressLabel}>
              {finished ? 'Complete' : `~${progressPct}%`}
            </ThemedText>
          </View>
        </View>
        {finished ? (
          <Button label="Done" variant="primary" onPress={() => router.back()} />
        ) : (
          <Button
            label="Stop"
            variant="default"
            onPress={() => {
              send({ type: 'ABORT_NIGHT_SHIFT' });
              router.back();
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  copyBlock: {
    width: '100%',
    // Bounded so the copy sits inside the halo rather than running under it.
    maxWidth: 260,
    paddingHorizontal: 24,
    gap: 10,
    alignItems: 'stretch',
  },
  clock: { textAlign: 'center' },
  operationTitle: { textAlign: 'center' },
  phaseText: { textAlign: 'center' },
  detailText: { textAlign: 'center' },
  stepText: { textAlign: 'center' },
  progressBlock: { gap: 6, marginTop: 6 },
  progressLabel: { textAlign: 'center' },
  ring: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 2,
  },
});
