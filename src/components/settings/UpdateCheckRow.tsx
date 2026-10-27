import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ListGroup, Row } from '@/components/ui/card';
import {
  checkForAppUpdates,
  describeUpdateCheckResult,
  type UpdateCheckResult,
} from '@/lib/updateCheck';
import { Space } from '@/constants/theme';

type CheckState = 'idle' | 'checking' | 'done' | 'failed';

/**
 * Settings row for the explicit update-check trigger (INTENT.md rule 9:
 * the only update checks are the ones the user starts here).
 */
export function UpdateCheckRow() {
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(
    null,
  );
  const inFlight = useRef(false);

  const runUpdateCheck = async () => {
    // Disabled renders one frame late; guard against a double-tap firing
    // two concurrent checks.
    if (inFlight.current) return;
    inFlight.current = true;
    setCheckState('checking');
    try {
      const result = await checkForAppUpdates();
      setCheckResult(result);
      setCheckState('done');
    } catch (error) {
      console.warn(
        '[updateCheck] failed:',
        error instanceof Error ? error.message : String(error),
      );
      setCheckResult(null);
      setCheckState('failed');
    } finally {
      inFlight.current = false;
    }
  };

  const busy = checkState === 'checking';
  let label: string;
  if (checkState === 'done' && checkResult) {
    label = describeUpdateCheckResult(checkResult);
  } else if (busy) {
    label = 'Checking…';
  } else if (checkState === 'failed') {
    label = 'Couldn’t reach the update server. Check your connection and try again.';
  } else {
    label = 'Check for an app update';
  }

  return (
    <ListGroup>
      <Row style={styles.row} divider={false}>
        <ThemedText type="strong" style={styles.rowLabel} testID="update-check-label">
          {label}
        </ThemedText>
        <Button
          label={busy ? '…' : 'Check'}
          disabled={busy}
          onPress={() => void runUpdateCheck()}
        />
      </Row>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space[3] },
  rowLabel: { flex: 1 },
});
