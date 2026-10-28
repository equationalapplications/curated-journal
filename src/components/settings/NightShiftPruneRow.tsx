import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Row } from '@/components/ui/card';
import {
  getNightShiftPruneEnabled,
  setNightShiftPruneEnabled,
} from '@/lib/entityStorage';

/**
 * Opt-in toggle for the Night Shift prune pass. Prune permanently removes
 * soft-deleted content and old events, so it defaults to off and says so.
 */
export function NightShiftPruneRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNightShiftPruneEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (value: boolean) => {
    setEnabled(value);
    void setNightShiftPruneEnabled(value);
  };

  return (
    <Row style={styles.row} divider={false}>
      <View style={styles.copyBlock}>
        <ThemedText type="strong" style={styles.rowLabel}>
          Prune during Night Shift
        </ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVar">
          Permanently remove content you deleted and trim old events. Off by
          default.
        </ThemedText>
      </View>
      <Switch
        value={enabled === true}
        disabled={enabled === null}
        onValueChange={toggle}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copyBlock: { flex: 1, gap: 2 },
  rowLabel: { flex: 1 },
});
