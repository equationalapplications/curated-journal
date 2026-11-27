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
import { clearModelPath, setModelPath, setModelId, getModelPath } from '@/lib/entityStorage';
import { deleteOrphanedCuratedModelFiles } from '@/services/modelFiles';
import { useModelHub } from '@/hooks/useModelHub';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';

export default function ModelHubImportScreen() {
  const router = useRouter();
  const { send, stateValue, clearDownloadState, readDownloadModelId } = useModelHub();
  const completeOnboarding = useModelHubCompletion();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (stateValue === 'complete') {
      void completeOnboarding().then(() => router.replace('/'));
    }
  }, [stateValue, completeOnboarding, router]);

  const runImport = async () => {
    // Read the outgoing path first, and await it here rather than in a mount
    // effect: setModelPath below overwrites MODEL_PATH_KEY with the replacement,
    // after which the old path is unrecoverable — and an effect that has not
    // settled yet would leave the outgoing model orphaned.
    //
    // Its own try/catch because this read sits before the import's: a rejection
    // here would otherwise escape the `void runImport()` call unhandled, opening
    // no picker and telling the user nothing.
    let currentPath: string | null;
    try {
      currentPath = await getModelPath();
    } catch {
      send({
        type: 'IMPORT_FAILED',
        message: 'Could not check which model you have installed. Try again.',
      });
      router.back();
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    // The saved download's partial must survive until this import succeeds: the
    // row stays `paused` with resume data, and a later Resume would
    // setLength(offset) over a deleted file, zero-filling the head into a
    // file that passes the size-only verify. An unreadable row means skip the sweep.
    let keptModelId: Awaited<ReturnType<typeof readDownloadModelId>> = null;
    let rowKnown = true;
    try {
      keptModelId = await readDownloadModelId();
    } catch {
      rowKnown = false;
    }
    if (rowKnown) deleteOrphanedCuratedModelFiles({ keepModelId: keptModelId, currentModelPath: currentPath });
    const dest = new File(Paths.document, uniqueFileName(picked.assets[0].name));
    const source = new File(picked.assets[0].uri);
    // Shown before the copy, not after: a multi-gigabyte .gguf takes a while.
    setStatus('Copying the model and checking it runs on this device…');
    let committedPath = false;
    let rowCleared = false;
    try {
      // File.copy() returns a Promise (Expo SDK 57). Left un-awaited, the smoke
      // test below races a half-written file and reports a perfectly good model
      // as unusable, and a failed copy vanishes as an unhandled rejection.
      //
      // Deliberately not overwriting: the destination name is unique by
      // construction, so an existing file there means something is wrong and
      // should fail loudly here rather than overwrite the installed model.
      await source.copy(dest);
      const result = await runModelSmokeTest({ modelPath: dest.uri, llamaConfig: { contextSize: 4096 } });
      if (!result.ok) {
        deleteIfPresent(dest);
        setStatus('');
        send({ type: 'IMPORT_FAILED', message: 'This model could not run on your device.' });
        router.back();
        return;
      }
      // Clear any abandoned download row BEFORE the identity commit: a kill
      // between the commit and the machine's IMPORT_SMOKE_OK clear would leave
      // the row, and the next Wi-Fi open would download over this import.
      try {
        await clearDownloadState();
        rowCleared = true;
      } catch (cause) {
        console.warn('[model-hub] could not clear the download row before import', cause);
      }
      await setModelPath(dest.uri);
      committedPath = true;
      await setModelId('custom');
    } catch {
      if (committedPath) {
        // The stored path already names the copy: point it back at the
        // installed model before deleting the copy, or the next launch finds a
        // missing file and drops the working model's identity too.
        await (currentPath ? setModelPath(currentPath) : clearModelPath()).catch(() => undefined);
      }
      deleteIfPresent(dest);
      // Smoke test or persistence threw unexpectedly. Without this the status
      // stays nonempty and the picker button is disabled forever — clear it so
      // the user can retry from this screen.
      setStatus('');
      send({ type: 'IMPORT_FAILED', message: 'Import failed. Pick the model again to retry.' });
      router.back();
      return;
    }
    // The import won and the row is gone: the kept download is abandoned, so
    // its partial is now a true orphan.
    if (rowCleared && (keptModelId || !rowKnown)) {
      deleteOrphanedCuratedModelFiles({ keepModelId: null, currentModelPath: currentPath });
    }
    send({ type: 'IMPORT_SMOKE_OK', retirePath: currentPath });
  };

/** The smoke test no longer deletes; the import owns the copy it made. */
function deleteIfPresent(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Best effort: a leftover copy must not mask the import failure.
  }
}

/**
 * Disambiguates the copy we land in the documents directory. Re-importing a
 * file that shares a name with the installed model is the ordinary case, not an
 * edge case: a plain copy would land exactly on the path the machine retires,
 * so the import would delete the model it had just installed. The `.gguf`
 * extension is kept last so the copy still reads as a model file.
 */
function uniqueFileName(name: string | null | undefined): string {
  const safe = name ?? 'model.gguf';
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  return `${stem}-${Date.now()}${ext}`;
}

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
