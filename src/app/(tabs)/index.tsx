import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMemoryRead, useWikiIngest } from '@equationalapplications/expo-llm-wiki';
import { JournalList, type JournalListItem } from '@/components/journal/JournalList';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';
import { JournalPane } from '@/components/journal/JournalPane';
import { SynthesisPane } from '@/components/synthesis/SynthesisPane';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useJournal } from '@/contexts/JournalContext';
import { useSplitPaneLayout } from '@/hooks/useSplitPaneLayout';

export default function JournalScreen() {
  const { entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode } = useJournal();
  const { data, refetch } = useMemoryRead(entityId, '');
  const { execute: ingest } = useWikiIngest();
  const [composing, setComposing] = useState(false);
  const { isWide } = useSplitPaneLayout();

  const items: JournalListItem[] = useMemo(() => {
    const facts = data?.facts ?? [];
    return facts.map((f) => ({
      id: f.id,
      title: f.title ?? 'Untitled',
      preview: f.body?.slice(0, 120) ?? '',
    }));
  }, [data]);

  const handleSave = useCallback(
    async ({ title, body }: { title: string; body: string }) => {
      const markdown = `# ${title}\n\n${body}`;
      await ingest(entityId, {
        sourceRef: `journal://${Date.now()}`,
        sourceHash: `${Date.now()}`,
        documentChunk: markdown,
      });
      setComposing(false);
      refetch();
    },
    [entityId, ingest, refetch],
  );

  if (composing) {
    return <JournalEntryEditor onSave={handleSave} onCancel={() => setComposing(false)} />;
  }

  if (isWide) {
    return (
      <View style={styles.split}>
        <View style={styles.listPane}>
          {items.length === 0 ? (
            <TutorialCard />
          ) : null}
          <JournalList
            items={items}
            selectedId={selectedFactId}
            onSelect={setSelectedFactId}
            onNewNote={() => setComposing(true)}
          />
        </View>
        <View style={styles.readPane}>
          <JournalPane />
        </View>
        <View style={styles.chatPane}>
          <SynthesisPane />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggle}>
        <Pressable onPress={() => setPaneMode('notes')} style={paneMode === 'notes' && styles.activeTab}>
          <ThemedText type="smallBold">Notes</ThemedText>
        </Pressable>
        <Pressable onPress={() => setPaneMode('chat')} style={paneMode === 'chat' && styles.activeTab}>
          <ThemedText type="smallBold">Chat</ThemedText>
        </Pressable>
      </View>
      {items.length === 0 && paneMode === 'notes' ? <TutorialCard /> : null}
      {paneMode === 'notes' ? (
        selectedFactId ? (
          <JournalPane />
        ) : (
          <JournalList
            items={items}
            selectedId={selectedFactId}
            onSelect={setSelectedFactId}
            onNewNote={() => setComposing(true)}
          />
        )
      ) : (
        <SynthesisPane />
      )}
    </View>
  );
}

function TutorialCard() {
  return (
    <ThemedView style={styles.tutorial}>
      <ThemedText type="smallBold">Welcome to Curated Journal</ThemedText>
      <ThemedText type="small">
        Capture notes, run Night Shift while charging to organize your graph, then ask questions in
        Chat.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { flex: 0.3 },
  readPane: { flex: 0.35, borderLeftWidth: StyleSheet.hairlineWidth },
  chatPane: { flex: 0.35, borderLeftWidth: StyleSheet.hairlineWidth },
  toggle: { flexDirection: 'row', gap: 8, padding: 12 },
  activeTab: { opacity: 0.6 },
  tutorial: { margin: 12, padding: 12, borderRadius: 8, gap: 6 },
});
