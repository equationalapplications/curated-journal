import { useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { parseOkfBundle, useSetOntologyManifest, useWiki } from '@equationalapplications/expo-llm-wiki';
import { getUnzip } from 'react-native-nitro-unzip';
import { ThemedText } from '@/components/themed-text';
import { MAX_ZIP_UNCOMPRESSED_BYTES } from '@/lib/constants';
import { chunkedImportDump } from '@/lib/chunkedImportDump';
import { walkMarkdownFiles } from '@/lib/walkDirectory';
import { useJournal } from '@/contexts/JournalContext';

export default function ImportScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const wiki = useWiki();
  const { execute: setManifest } = useSetOntologyManifest();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const runImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/zip' });
    if (picked.canceled || !picked.assets[0]) return;
    const id = Crypto.randomUUID();
    const zipDest = new File(Paths.cache, `import-${id}.zip`);
    const source = new File(picked.assets[0].uri);
    source.copy(zipDest);
    const extractDir = new Directory(Paths.cache, `import-${id}`);
    extractDir.create({ idempotent: true });
    setStatus('Extracting…');
    const unzip = getUnzip();
    const task = unzip.extract(zipDest.uri, extractDir.uri);
    const result = await task.await();
    if (result.totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error('Archive exceeds maximum uncompressed size');
    }
    setStatus('Reading markdown…');
    const files = await walkMarkdownFiles(extractDir.uri, {
      listEntries: async (dir) => {
        const d = new Directory(dir);
        return d.list().map((entry) => ({
          name: entry.name,
          isDirectory: entry instanceof Directory,
        }));
      },
      readText: async (path) => {
        const file = new File(path);
        return await file.text();
      },
    });
    const dump = parseOkfBundle(entityId, files, { defaultSchema: 'fact' });
    setStatus('Importing…');
    await chunkedImportDump(wiki, dump, { merge: true, onProgress: setProgress });
    await setManifest(entityId, { node_types: [], edge_types: [] }, { mode: 'emergent' });
    setStatus('Done');
    router.back();
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">
        Complex multi-line YAML or unusual markdown link formats from other apps may be gracefully
        skipped during import.
      </ThemedText>
      <ThemedText>{status}</ThemedText>
      <ThemedText>{Math.round(progress * 100)}%</ThemedText>
      <Button title="Pick OKF zip" onPress={() => void runImport()} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
