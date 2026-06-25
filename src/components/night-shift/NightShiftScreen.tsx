import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
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

/** Fixed dark palette — screen background is always #0d1117, not theme-aware. */
const NIGHT_SHIFT_COLORS = {
  background: '#0d1117',
  text: '#f0f6fc',
  textMuted: '#c9d1d9',
  accent: '#6ea8fe',
} as const;

export function NightShiftScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const status = useEntityStatus(entityId);
  const { send, queueIndex, queueLength, currentOperation, isStepRunning, isAdvancing, isNightShift } =
    useJournalWiki();
  const { progress, llm } = useNightShiftProgress(
    queueIndex,
    queueLength,
    isStepRunning,
    isNightShift,
  );
  const [hasBeenNightShift, setHasBeenNightShift] = useState(false);
  const prevOperationRef = useRef(currentOperation);
  const pulse = useSharedValue(1);
  const finished = hasBeenNightShift && !isNightShift && queueLength === 0;
  const stepLabel = nightShiftStepLabel({
    queueIndex,
    queueLength,
    isNightShift,
    isAdvancing,
    hasStarted: hasBeenNightShift,
  });

  useEffect(() => {
    void activateKeepAwakeAsync('night-shift');
    setNightShiftActive(true);
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
    if (isNightShift) {
      setHasBeenNightShift(true);
    }
  }, [isNightShift]);

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

  const progressPct = Math.min(100, Math.round((finished ? 1 : progress) * 100));

  return (
    <Screen style={styles.screen}>
      <View style={styles.container}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <View style={styles.copyBlock}>
          <ThemedText type="title" style={styles.clock}>
            {clock}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.operationTitle}>
            {nightShiftOperationTitle(currentOperation)}
          </ThemedText>
          <ThemedText style={styles.phaseText}>
            {nightShiftPhaseLabel(currentOperation, status, llm)}
          </ThemedText>
          <ThemedText style={styles.detailText}>
            {nightShiftDetailLabel(currentOperation)}
          </ThemedText>
          <ThemedText style={styles.stepText}>{stepLabel}</ThemedText>
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <ThemedText style={styles.progressLabel}>
              {finished ? 'Complete' : `~${progressPct}%`}
            </ThemedText>
          </View>
        </View>
        <Button
          title="Stop"
          onPress={() => {
            send({ type: 'ABORT_NIGHT_SHIFT' });
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: NIGHT_SHIFT_COLORS.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: NIGHT_SHIFT_COLORS.background,
  },
  copyBlock: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 14,
    alignItems: 'stretch',
  },
  clock: {
    color: NIGHT_SHIFT_COLORS.text,
    textAlign: 'center',
  },
  operationTitle: {
    color: NIGHT_SHIFT_COLORS.text,
    fontSize: 28,
    lineHeight: 36,
    textAlign: 'center',
  },
  phaseText: {
    color: NIGHT_SHIFT_COLORS.text,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '600',
    textAlign: 'center',
  },
  detailText: {
    color: NIGHT_SHIFT_COLORS.textMuted,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
  stepText: {
    color: NIGHT_SHIFT_COLORS.textMuted,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressBlock: {
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#30363d',
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: NIGHT_SHIFT_COLORS.accent,
  },
  progressLabel: {
    color: NIGHT_SHIFT_COLORS.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: NIGHT_SHIFT_COLORS.accent,
  },
});
