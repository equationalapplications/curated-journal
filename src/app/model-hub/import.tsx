import { useEffect, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ThemedText } from '@/components/themed-text';
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
    const result = await runModelSmokeTest({ modelPath: dest.uri, llamaConfig: { contextSize: 4096 } });
    if (!result.ok) {
      setStatus('');
      send({ type: 'IMPORT_FAILED', message: 'This model could not run on your device.' });
      router.back();
      return;
    }
    await setModelPath(dest.uri);
    await setModelId('custom');
    send({ type: 'IMPORT_SMOKE_OK' });
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">
        Pick any compatible `.gguf` file from your device. It will be checked with a short test
        completion before your journal opens.
      </ThemedText>
      <ThemedText>{status}</ThemedText>
      <Button title="Pick a .gguf file" onPress={() => void runImport()} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
