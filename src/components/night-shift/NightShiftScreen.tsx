import { useEffect, useMemo } from 'react';
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
import { setNightShiftActive } from '@/lib/llamaProvider';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalWiki } from '@/hooks/useJournalWiki';

function phaseCopy(status: ReturnType<typeof useEntityStatus>): string {
  if (status.ingesting) return 'Reading your notes…';
  if (status.librarian) return 'Synthesizing insights…';
  if (status.heal) return 'Healing memory graph…';
  return 'Waiting for next pass…';
}

export function NightShiftScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const status = useEntityStatus(entityId);
  const { send, queueIndex, queueLength } = useJournalWiki();
  const pulse = useSharedValue(1);

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

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, ringStyle]} />
      <ThemedText type="title">{clock}</ThemedText>
      <ThemedText type="subtitle">{phaseCopy(status)}</ThemedText>
      <ThemedText>
        Step {Math.min(queueIndex + 1, queueLength)} / {queueLength || 2}
      </ThemedText>
      <Button
        title="Stop"
        onPress={() => {
          send({ type: 'ABORT_NIGHT_SHIFT' });
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#0d1117',
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: '#6ea8fe',
  },
});
