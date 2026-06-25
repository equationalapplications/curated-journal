import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { MODEL_CATALOG, type CuratedModel } from '@/catalog/modelManifest';
import { useModelHub } from '@/hooks/useModelHub';

export default function ModelHubIndexScreen() {
  const router = useRouter();
  const { send, stateValue, error } = useModelHub();
  const [warningFor, setWarningFor] = useState<CuratedModel | null>(null);

  useEffect(() => {
    if (stateValue === 'downloading') {
      router.push('/model-hub/download' as Href);
      return;
    }
    if (stateValue === 'cellularConfirm') {
      Alert.alert(
        'Download over cellular',
        'This model is a large file and may use a significant amount of cellular data.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => send({ type: 'CELLULAR_CANCEL' }) },
          { text: 'Download over cellular', onPress: () => send({ type: 'CELLULAR_CONFIRM' }) },
        ],
      );
    }
  }, [stateValue, router, send]);

  const selectModel = (model: CuratedModel) => {
    if (model.deviceWarning) {
      setWarningFor(model);
      return;
    }
    send({ type: 'SELECT_MODEL', modelId: model.id });
  };

  const confirmWarning = () => {
    if (!warningFor) return;
    send({ type: 'SELECT_MODEL', modelId: warningFor.id });
    setWarningFor(null);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Choose Your AI</ThemedText>
      <ThemedText type="small">
        Your journal stays fully offline. Pick a model to download once — everything after that runs
        on your device.
      </ThemedText>
      {error && <ThemedText themeColor="textSecondary">{error.message}</ThemedText>}
      {stateValue === 'awaitingWifi' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Connect to Wi-Fi to continue</ThemedText>
          <Pressable onPress={() => send({ type: 'CHECK_NETWORK' })}>
            <ThemedText type="link">Try again</ThemedText>
          </Pressable>
        </ThemedView>
      )}
      {MODEL_CATALOG.map((model) => (
        <Pressable key={model.id} onPress={() => selectModel(model)}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">{model.displayName}</ThemedText>
            <ThemedText type="small">{model.tagline}</ThemedText>
            <ThemedText type="smallBold">{model.sizeLabel}</ThemedText>
            {model.deviceHint === 'recommended-high-ram' && (
              <ThemedText type="small" themeColor="textSecondary">
                Recommended for newer devices
              </ThemedText>
            )}
          </ThemedView>
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          send({ type: 'IMPORT_CUSTOM' });
          router.push('/model-hub/import' as Href);
        }}>
        <ThemedText type="linkPrimary">Import custom .gguf</ThemedText>
      </Pressable>
      {warningFor && (
        <View style={styles.sheet}>
          <ThemedText type="small">{warningFor.deviceWarning}</ThemedText>
          <Pressable onPress={confirmWarning}>
            <ThemedText type="link">Continue</ThemedText>
          </Pressable>
          <Pressable onPress={() => setWarningFor(null)}>
            <ThemedText type="link">Cancel</ThemedText>
          </Pressable>
        </View>
      )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  sheet: { borderRadius: Spacing.three, padding: Spacing.four, gap: Spacing.two },
});
