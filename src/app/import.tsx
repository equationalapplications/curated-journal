import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMachine } from '@xstate/react';
import { parseOkfBundle, useSetOntologyManifest, useWiki } from '@equationalapplications/expo-llm-wiki';
import { getUnzip } from 'react-native-nitro-unzip';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress';
import { ErrorBanner } from '@/components/ui/states';
import { Space } from '@/constants/theme';
import { MAX_ZIP_UNCOMPRESSED_BYTES } from '@/lib/constants';
import { chunkedImportDump } from '@/lib/chunkedImportDump';
import { walkMarkdownFiles } from '@/lib/walkDirectory';
import { useJournal } from '@/contexts/JournalContext';
import { importMachine, type ImportApi, type PreparePhase } from '@/machines/importMachine';

const PHASE_LABEL: Record<PreparePhase, string> = {
  copying: 'Copying…',
  extracting: 'Extracting…',
  reading: 'Reading notes…',
};

export default function ImportScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const wiki = useWiki();
  const { execute: setManifest } = useSetOntologyManifest();

  const api: ImportApi = {
    pick: async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/zip' });
      return picked.canceled || !picked.assets[0] ? null : { uri: picked.assets[0].uri };
    },
    prepare: async (uri, onPhase) => {
      const id = Crypto.randomUUID();
      const zipDest = new File(Paths.cache, `import-${id}.zip`);
      const extractDir = new Directory(Paths.cache, `import-${id}`);
      const cleanup = () => {
        if (zipDest.exists) zipDest.delete();
        if (extractDir.exists) extractDir.delete();
      };
      try {
        onPhase('copying');
        // MUST await: unzip raced this copy and opened a nonexistent file
        // ("Could not open ZIP file", nitro-unzip IOException on device).
        await new File(uri).copy(zipDest, { overwrite: true });
        extractDir.create({ idempotent: true });
        onPhase('extracting');
        const result = await getUnzip().extract(zipDest.uri, extractDir.uri).await();
        if (result.totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new Error('Archive exceeds maximum uncompressed size');
        }
        onPhase('reading');
        const files = await walkMarkdownFiles(extractDir.uri, {
          listEntries: async (dir) =>
            new Directory(dir).list().map((entry) => ({
              name: entry.name,
              isDirectory: entry instanceof Directory,
            })),
          readText: async (path) => new File(path).text(),
        });
        const dump = parseOkfBundle(entityId, files, { defaultSchema: 'fact' });
        const noteCount = Object.values(dump.entities).reduce((n, b) => n + b.facts.length, 0);
        return { dump, noteCount, cleanup };
      } catch (error) {
        cleanup();
        throw error;
      }
    },
    importDump: (dump, onProgress, signal) =>
      chunkedImportDump(wiki, dump, {
        merge: true,
        signal,
        onProgress: (_pct, detail) => onProgress(detail),
      }),
    finalize: async () => {
      await setManifest(entityId, { node_types: [], edge_types: [] }, { mode: 'emergent' });
    },
  };

  const [state, send] = useMachine(importMachine, { input: { api } });
  const { phase, progress, error } = state.context;
  const working = state.matches('working');

  useEffect(() => {
    if (state.matches('done')) router.back();
  }, [state, router]);

  const status = state.matches({ working: 'preparing' })
    ? PHASE_LABEL[phase]
    : state.matches({ working: 'importing' })
      ? `Importing ${progress.factsDone} of ${progress.factsTotal} notes…`
      : state.matches({ working: 'finalizing' })
        ? 'Finishing…'
        : null;
  const fraction =
    state.matches({ working: 'importing' }) && progress.factsTotal > 0
      ? progress.factsDone / progress.factsTotal
      : state.matches({ working: 'finalizing' })
        ? 1
        : 0;

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="onSurfaceVar" style={styles.hint}>
        Complex multi-line YAML or unusual markdown link formats from other apps may be gracefully
        skipped during import.
      </ThemedText>
      {status ? (
        <View style={styles.progressBlock} accessibilityLiveRegion="polite">
          <ThemedText type="small" themeColor="onSurfaceVar">
            {status}
          </ThemedText>
          <ProgressBar value={fraction} />
        </View>
      ) : null}
      {state.matches('failed') && error ? <ErrorBanner message={`Import failed: ${error}`} /> : null}
      <View style={styles.action}>
        {working ? (
          <Button label="Cancel" onPress={() => send({ type: 'CANCEL' })} />
        ) : (
          <Button
            label={state.matches('failed') ? 'Pick another zip' : 'Pick OKF zip'}
            variant="primary"
            disabled={state.matches('picking')}
            onPress={() => send({ type: 'PICK' })}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space[4], gap: Space[3] },
  hint: { lineHeight: 20 },
  progressBlock: { gap: Space[1] },
  action: { marginTop: 'auto' },
});
