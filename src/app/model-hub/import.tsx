import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Note } from '@/components/ui/states';
import { Space } from '@/constants/theme';
import { runModelSmokeTest } from '@/lib/modelSmokeTest';
import { setModelPath, setModelId } from '@/lib/entityStorage';
import { useModelHub } from '@/hooks/useModelHub';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';

export default function ModelHubImportScreen() {
  const router = useRouter();
  const { send, stateValue } = useModelHub();
  const completeOnboarding = useModelHubCompletion();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (stateValue === 'complete') {
      void completeOnboarding().then(() => router.replace('/'));
    }
  }, [stateValue, completeOnboarding, router]);

  const runImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const name = picked.assets[0].name ?? `model-${Date.now()}.gguf`;
    const dest = new File(Paths.document, name);
    const source = new File(picked.assets[0].uri);
    source.copy(dest);
    setStatus('Checking the model can run on this device…');
    try {
      const result = await runModelSmokeTest({ modelPath: dest.uri, llamaConfig: { contextSize: 4096 } });
      if (!result.ok) {
        setStatus('');
        send({ type: 'IMPORT_FAILED', message: 'This model could not run on your device.' });
        router.back();
        return;
      }
      await setModelPath(dest.uri);
      await setModelId('custom');
    } catch {
      // Smoke test or persistence threw unexpectedly. Without this the status
      // stays nonempty and the picker button is disabled forever — clear it so
      // the user can retry from this screen.
      setStatus('');
      send({ type: 'IMPORT_FAILED', message: 'Import failed. Pick the model again to retry.' });
      router.back();
      return;
    }
    send({ type: 'IMPORT_SMOKE_OK' });
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="onSurfaceVar" style={styles.hint}>
        Pick any compatible `.gguf` file from your device. It will be checked with a short test
        completion before your journal opens.
      </ThemedText>
      {status ? (
        <Note>
          <ThemedText type="small" themeColor="onSurfaceVar">
            {status}
          </ThemedText>
        </Note>
      ) : null}
      <View style={styles.action}>
        <Button
          label="Pick a .gguf file"
          variant="primary"
          disabled={status !== ''}
          onPress={() => void runImport()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space[4], gap: Space[3] },
  hint: { lineHeight: 20 },
  action: { marginTop: 'auto' },
});
