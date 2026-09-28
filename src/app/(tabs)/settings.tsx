import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useWikiExport } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ListGroup, Row } from '@/components/ui/card';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { Screen } from '@/components/screen';
import { exportOkfFromDump, saveOkfToDevice } from '@/lib/okfExport';
import { useJournal } from '@/contexts/JournalContext';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';
import { Space } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const { canStart } = useNightShiftGates();
  const { execute: exportDump } = useWikiExport();
  const { confirm, confirmElement } = useConfirmSheet();

  const performChangeModel = () => {
    router.push('/model-hub' as Href);
  };

  const changeModel = () => {
    confirm({
      title: 'Change AI model',
      message:
        'You will choose a replacement on the next screen. Your current model stays in place until you pick one.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => performChangeModel() },
      ],
    });
  };

  const exportToDevice = async () => {
    try {
      const dump = await exportDump([entityId]);
      const zipUri = await exportOkfFromDump(dump, { share: false });
      await saveOkfToDevice(zipUri, 'curated-journal-export.zip');
    } catch (error) {
      confirm({
        title: 'Export failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const shareExport = async () => {
    try {
      const dump = await exportDump([entityId]);
      await exportOkfFromDump(dump);
    } catch (error) {
      confirm({
        title: 'Export failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    // No top edge: the navigator header already owns the status-bar inset.
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.container}>
        {confirmElement}

        <ThemedText type="label" style={styles.label}>
          AI
        </ThemedText>
        <ListGroup>
          <Row style={styles.row} divider={false}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Run Night Shift
            </ThemedText>
            <Button
              label="Run"
              variant="primary"
              disabled={!canStart}
              onPress={() => router.push('/night-shift')}
            />
          </Row>
        </ListGroup>

        <ThemedText type="label" style={styles.label}>
          Your data
        </ThemedText>
        <ListGroup>
          <Row style={styles.row}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Import OKF
            </ThemedText>
            <Button label="Import" onPress={() => router.push('/import')} />
          </Row>
          <Row style={styles.row}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Export OKF to device
            </ThemedText>
            <Button label="Export" onPress={() => void exportToDevice()} />
          </Row>
          <Row style={styles.row} divider={false}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Share OKF export…
            </ThemedText>
            <Button label="Share" onPress={() => void shareExport()} />
          </Row>
        </ListGroup>

        <ThemedText type="label" style={styles.label}>
          Model
        </ThemedText>
        <ListGroup>
          <Row style={styles.row} divider={false}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Change AI model
            </ThemedText>
            <Button label="Change" variant="danger" onPress={changeModel} />
          </Row>
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space[4], gap: Space[2] },
  label: { marginTop: Space[2], marginBottom: Space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space[3] },
  rowLabel: { flex: 1 },
});
