import { useRouter } from 'expo-router';
import { Alert, Button, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useWikiExport } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { exportOkfFromDump } from '@/lib/okfExport';
import { setModelPath } from '@/lib/entityStorage';
import { useJournal } from '@/contexts/JournalContext';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';

export default function SettingsScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const { canStart } = useNightShiftGates();
  const { execute: exportDump } = useWikiExport();

  const pickModel = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const name = picked.assets[0].name ?? `model-${Date.now()}.gguf`;
    const dest = new File(Paths.document, name);
    const source = new File(picked.assets[0].uri);
    source.copy(dest);
    await setModelPath(dest.uri);
    Alert.alert('Model saved', 'Restart the app to load the new GGUF model.');
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
      <Button title="Pick GGUF model" onPress={() => void pickModel()} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
