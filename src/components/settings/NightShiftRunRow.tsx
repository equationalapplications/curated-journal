import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/card';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';
import { NIGHT_SHIFT_CHARGING_HINT } from '@/lib/nightShiftCopy';

/**
 * Settings entry point for Night Shift. Night Shift runs only while the
 * device charges (INTENT.md), so a disabled Run button must say why —
 * otherwise tapping it looks like the app ignored the tap. No model-missing
 * copy: the tabs layout redirects to the model hub until a model is on
 * disk, so Settings is unreachable without one.
 */
export function NightShiftRunRow() {
  const router = useRouter();
  const { charging, canStart } = useNightShiftGates();

  return (
    <Row style={styles.row} divider={false}>
      <View style={styles.copyBlock}>
        <ThemedText type="strong">Run Night Shift</ThemedText>
        {!charging ? (
          <ThemedText type="small" themeColor="onSurfaceVar">
            {NIGHT_SHIFT_CHARGING_HINT}
          </ThemedText>
        ) : null}
      </View>
      <Button
        testID="night-shift-run-button"
        label="Run"
        variant="primary"
        disabled={!canStart}
        onPress={() => router.push('/night-shift')}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copyBlock: { flex: 1, gap: 2 },
});
