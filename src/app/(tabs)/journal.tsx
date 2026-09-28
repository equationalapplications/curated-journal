import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMachine } from '@xstate/react';
import { useWiki } from '@equationalapplications/expo-llm-wiki';
import { countIngestFailures } from '@/lib/ingestReport';
import { journalSaveMachine } from '@/machines/journalSaveMachine';
import { JournalList, type JournalListItem } from '@/components/journal/JournalList';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';
import { JournalPane } from '@/components/journal/JournalPane';
import { SynthesisPane } from '@/components/synthesis/SynthesisPane';
import { Card } from '@/components/ui/card';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { ThemedText } from '@/components/themed-text';
import { useJournal } from '@/contexts/JournalContext';
import { createJournalIngest } from '@/lib/journalIngest';
import { notePreview, noteTitle } from '@/lib/noteText';
import { useJournalMemoryRead } from '@/hooks/useJournalMemoryRead';
import { useSplitPaneLayout } from '@/hooks/useSplitPaneLayout';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Space, TouchTarget } from '@/constants/theme';

export default function JournalScreen() {
  const { entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode } = useJournal();
  const { data, refetch } = useJournalMemoryRead(entityId);
  const wiki = useWiki();
  const ingest = useMemo(() => createJournalIngest(wiki), [wiki]);
  const [composing, setComposing] = useState(false);
  const { isWide } = useSplitPaneLayout();
  const theme = useTheme();
  const { confirm, confirmElement } = useConfirmSheet();

  const [saveState, send] = useMachine(journalSaveMachine, {
    input: { entityId, ingest, saveTimeoutMs: 120_000 },
  });
  const saveInProgress = saveState.matches('hashing') || saveState.matches('ingesting');

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const items: JournalListItem[] = useMemo(() => {
    const facts = data?.facts ?? [];
    return facts.map((f) => {
      const title = f.title ?? noteTitle(f.body, 'Untitled');
      return {
        id: f.id,
        title,
        // The row already shows the title, so the preview starts below it.
        preview: notePreview(f.body, title),
      };
    });
  }, [data]);

  const handleSave = useCallback(
    ({ title, body }: { title: string; body: string }) => {
      send({ type: 'START_SAVE', title, body, entityId, ingest });
    },
    [send, entityId, ingest],
  );

  useEffect(() => {
    const { value, context } = saveState;
    if (value === 'saved') {
      const result = context.lastResult;
      if (result && countIngestFailures(result) > 0) {
        const failures = countIngestFailures(result);
        confirm({
          title: 'Saved with warnings',
          message:
            `${failures} chunk${failures === 1 ? '' : 's'} failed to process. ` +
            'Try running Night Shift, or edit and re-save this entry.',
        });
      }
      setComposing(false);
      refetch();
      send({ type: 'DISMISS' });
    } else if (value === 'failed' && context.lastError) {
      confirm({
        title: 'Save failed',
        message: context.lastError.message,
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => {
            send({ type: 'DISMISS' });
            setComposing(false);
          } },
          { text: 'Try again', onPress: () => send({ type: 'RETRY' }) },
        ],
      });
    }
  }, [saveState, send, refetch, confirm]);

  if (composing) {
    return (
      <>
        {confirmElement}
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
      </>
    );
  }

  if (isWide) {
    return (
      <View style={styles.split}>
        {confirmElement}
        <View style={styles.listPane}>
          <JournalList
            items={items}
            selectedId={selectedFactId}
            onSelect={setSelectedFactId}
            onNewNote={() => setComposing(true)}
            emptyState={<TutorialCard />}
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
      {confirmElement}
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
      {paneMode === 'notes' ? (
        selectedFactId ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="All notes"
              onPress={() => setSelectedFactId(null)}
              style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.elev2 }]}>
              <ThemedText type="linkPrimary">‹ All notes</ThemedText>
            </Pressable>
            <JournalPane facts={data?.facts} />
          </>
        ) : (
          <JournalList
            items={items}
            selectedId={selectedFactId}
            onSelect={setSelectedFactId}
            onNewNote={() => setComposing(true)}
            emptyState={<TutorialCard />}
          />
        )
      ) : (
        <SynthesisPane />
      )}
    </View>
  );
}

/**
 * Segmented control. This is a two-way switch, not a filled-pill tab bar: the
 * active segment is `primaryContainer` + `onPrimaryCont` at weight 500.
 */
function PaneTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paneTab,
        selected && { backgroundColor: theme.primaryContainer },
        !selected && { backgroundColor: 'transparent' },
        pressed && !selected && { backgroundColor: theme.elev2 },
      ]}>
      <ThemedText
        type={selected ? 'strong' : 'small'}
        style={selected ? { color: theme.onPrimaryCont } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TutorialCard() {
  return (
    <Card style={styles.tutorial}>
      <ThemedText type="strong">Welcome to Curated Journal</ThemedText>
      <ThemedText type="small" themeColor="onSurfaceVar">
        Capture notes, run Night Shift while charging to organize your graph, then ask questions in
        Chat.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { flex: 0.3 },
  readPane: { flex: 0.35, borderLeftWidth: StyleSheet.hairlineWidth },
  chatPane: { flex: 0.35, borderLeftWidth: StyleSheet.hairlineWidth },
  toggle: {
    flexDirection: 'row',
    gap: Space[2],
    paddingHorizontal: Space[4],
    paddingTop: Space[3],
    paddingBottom: Space[1],
  },
  paneTab: {
    minHeight: TouchTarget - 8,
    paddingHorizontal: Space[4],
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  back: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Space[2],
    marginHorizontal: Space[2],
    borderRadius: Radius.sm,
  },
  tutorial: { gap: Space[2], marginTop: Space[2] },
});
