import { useRouter, type Href } from 'expo-router';
import { Alert, Button, StyleSheet, View } from 'react-native';
import { File } from 'expo-file-system';
import { useWikiExport } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { exportOkfFromDump } from '@/lib/okfExport';
import { getModelPath, clearModelPath } from '@/lib/entityStorage';
import { useJournal } from '@/contexts/JournalContext';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';

export default function SettingsScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const { canStart } = useNightShiftGates();
  const { execute: exportDump } = useWikiExport();
  const rebootstrap = useModelHubCompletion();

  const performChangeModel = async () => {
    const path = await getModelPath();
    if (path) {
      const file = new File(path);
      if (file.exists) file.delete();
    }
    await clearModelPath();
    await rebootstrap();
    router.replace('/model-hub' as Href);
  };

  const changeModel = () => {
    Alert.alert(
      'Change AI model',
      'This will delete your current model immediately. You will not be able to use the AI until the new download completes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => void performChangeModel() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle">Settings</ThemedText>
      <Button
        title="Run Night Shift"
        disabled={!canStart}
        onPress={() => router.push('/night-shift')}
      />
      <Button title="Import OKF" onPress={() => router.push('/import')} />
      <Button
        title="Export OKF"
        onPress={async () => {
          const dump = await exportDump([entityId]);
          await exportOkfFromDump(dump);
        }}
      />
      <Button title="Change AI model" onPress={changeModel} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
