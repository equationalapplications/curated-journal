import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, ListGroup, ListRow } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/states';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { Screen } from '@/components/screen';
import { Space } from '@/constants/theme';
import { MODEL_CATALOG, type CuratedModel } from '@/catalog/modelManifest';
import { useModelHub } from '@/hooks/useModelHub';

export default function ModelHubIndexScreen() {
  const router = useRouter();
  const { send, stateValue, error } = useModelHub();
  const [warningFor, setWarningFor] = useState<CuratedModel | null>(null);
  const { confirm, confirmElement } = useConfirmSheet();

  useEffect(() => {
    if (stateValue === 'downloading') {
      router.push('/model-hub/download' as Href);
      return;
    }
    if (stateValue === 'cellularConfirm') {
      confirm({
        title: 'Download over cellular',
        message:
          'This model is a large file and may use a significant amount of cellular data.',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => send({ type: 'CELLULAR_CANCEL' }) },
          { text: 'Download over cellular', onPress: () => send({ type: 'CELLULAR_CONFIRM' }) },
        ],
      });
    }
  }, [stateValue, router, send, confirm]);

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
      {confirmElement}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">Choose Your AI</ThemedText>
          <ThemedText type="small" themeColor="onSurfaceVar">
            Your journal stays fully offline. Pick a model to download once — everything after that
            runs on your device.
          </ThemedText>
        </View>

        {error ? <ErrorBanner message={error.message} /> : null}

        {stateValue === 'awaitingWifi' ? (
          <View style={styles.wifi}>
            <ThemedText type="strong">Connect to Wi-Fi to continue</ThemedText>
            <Button
              label="Try again"
              variant="default"
              onPress={() => send({ type: 'CHECK_NETWORK' })}
            />
          </View>
        ) : null}

        <ThemedText type="label">Models</ThemedText>
        <ListGroup>
          {MODEL_CATALOG.map((model, index) => (
            <ListRow
              key={model.id}
              divider={index < MODEL_CATALOG.length - 1}
              onPress={() => selectModel(model)}
              accessibilityLabel={`Select ${model.displayName}`}>
              <ThemedText type="strong">{model.displayName}</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVar">
                {model.tagline}
              </ThemedText>
              <ThemedText type="meta" themeColor="outline">
                {model.sizeLabel}
              </ThemedText>
              {model.deviceHint === 'recommended-high-ram' ? (
                <ThemedText type="small" themeColor="onSurfaceVar">
                  Recommended for newer devices
                </ThemedText>
              ) : null}
            </ListRow>
          ))}
        </ListGroup>

        <ListGroup>
          <ListRow
            divider={false}
            onPress={() => {
              send({ type: 'IMPORT_CUSTOM' });
              router.push('/model-hub/import' as Href);
            }}>
            <ThemedText type="linkPrimary">Import custom .gguf</ThemedText>
          </ListRow>
        </ListGroup>

        {warningFor ? (
          <Card style={styles.warning}>
            <ThemedText type="small" themeColor="onSurfaceVar">
              {warningFor.deviceWarning}
            </ThemedText>
            <View style={styles.warningActions}>
              <Button label="Cancel" variant="default" onPress={() => setWarningFor(null)} />
              <Button label="Continue" variant="primary" onPress={confirmWarning} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Space[4], gap: Space[3] },
  intro: { gap: Space[2] },
  wifi: { gap: Space[3] },
  warning: { gap: Space[3] },
  warningActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space[2] },
});
