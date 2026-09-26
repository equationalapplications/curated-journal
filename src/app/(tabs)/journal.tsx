import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMachine } from '@xstate/react';
import { useWikiIngest } from '@equationalapplications/expo-llm-wiki';
import { countIngestFailures } from '@/lib/ingestReport';
import { journalSaveMachine } from '@/machines/journalSaveMachine';
import { JournalList, type JournalListItem } from '@/components/journal/JournalList';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';
import { JournalPane } from '@/components/journal/JournalPane';
import { SynthesisPane } from '@/components/synthesis/SynthesisPane';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalMemoryRead } from '@/hooks/useJournalMemoryRead';
import { useSplitPaneLayout } from '@/hooks/useSplitPaneLayout';

export default function JournalScreen() {
  const { entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode } = useJournal();
  const { data, refetch } = useJournalMemoryRead(entityId);
  const { execute: ingest } = useWikiIngest();
  const [composing, setComposing] = useState(false);
  const { isWide } = useSplitPaneLayout();

  const saveInput = useMemo(
    () => ({ entityId, ingest, saveTimeoutMs: 120_000 }),
    [entityId, ingest],
  );
  const [saveState, send] = useMachine(journalSaveMachine, { input: saveInput });
  const saveInProgress = saveState.matches('hashing') || saveState.matches('ingesting');

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const items: JournalListItem[] = useMemo(() => {
    const facts = data?.facts ?? [];
    return facts.map((f) => ({
      id: f.id,
      title: f.title ?? 'Untitled',
      preview: f.body?.slice(0, 120) ?? '',
    }));
  }, [data]);

  const handleSave = useCallback(
    ({ title, body }: { title: string; body: string }) => {
      send({ type: 'START_SAVE', title, body });
    },
    [send],
  );

  useEffect(() => {
    const { value, context } = saveState;
    if (value === 'saved') {
      const result = context.lastResult;
      if (result && countIngestFailures(result) > 0) {
        const failures = countIngestFailures(result);
        Alert.alert(
          'Saved with warnings',
          `${failures} chunk${failures === 1 ? '' : 's'} failed to process. ` +
            'Try running Night Shift, or edit and re-save this entry.',
        );
      }
      setComposing(false);
      refetch();
      send({ type: 'DISMISS' });
    } else if (value === 'failed' && context.lastError) {
      Alert.alert('Save failed', context.lastError.message, [
        { text: 'Cancel', style: 'cancel', onPress: () => {
          send({ type: 'DISMISS' });
          setComposing(false);
        } },
        { text: 'Try again', onPress: () => send({ type: 'RETRY' }) },
      ]);
    }
  }, [saveState, send, refetch]);

  if (composing) {
    return (
      <JournalEntryEditor
        onSave={handleSave}
        onCancel={() => {
          if (saveInProgress) {
            send({ type: 'CANCEL' });
          }
          setComposing(false);
        }}
        saving={saveInProgress}
      />
    );
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
          <JournalPane facts={data?.facts} />
        </View>
        <View style={styles.chatPane}>
          <SynthesisPane />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggle} accessibilityRole="tablist">
        <PaneTab
          label="Notes"
          selected={paneMode === 'notes'}
          onPress={() => {
            // Re-selecting Notes while reading a note returns to the list.
            setSelectedFactId(null);
            setPaneMode('notes');
          }}
        />
        <PaneTab label="Chat" selected={paneMode === 'chat'} onPress={() => setPaneMode('chat')} />
      </View>
      {items.length === 0 && paneMode === 'notes' ? <TutorialCard /> : null}
      {paneMode === 'notes' ? (
        selectedFactId ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="All notes"
              onPress={() => setSelectedFactId(null)}
              style={styles.back}>
              <ThemedText type="link">‹ All notes</ThemedText>
            </Pressable>
            <JournalPane facts={data?.facts} />
          </>
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

function PaneTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}>
      <ThemedView type={selected ? 'backgroundSelected' : 'background'} style={styles.paneTab}>
        <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
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
  paneTab: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 },
  back: { paddingHorizontal: 12, paddingTop: 4 },
  tutorial: { margin: 12, padding: 12, borderRadius: 8, gap: 6 },
});
