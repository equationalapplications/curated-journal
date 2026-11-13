import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import {
  JournalList,
  type JournalListItem,
  type PendingListItem,
} from '@/components/journal/JournalList';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';
import { JournalPane } from '@/components/journal/JournalPane';
import { SynthesisPane } from '@/components/synthesis/SynthesisPane';
import { Card } from '@/components/ui/card';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { ThemedText } from '@/components/themed-text';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalSaveQueue } from '@/contexts/JournalSaveQueueContext';
import { notePreview, noteTitle } from '@/lib/noteText';
import { useJournalMemoryRead } from '@/hooks/useJournalMemoryRead';
import { useSplitPaneLayout } from '@/hooks/useSplitPaneLayout';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Space, TouchTarget } from '@/constants/theme';

export default function JournalScreen() {
  const { entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode } = useJournal();
  const { data, refetch } = useJournalMemoryRead(entityId);
  const saveQueue = useJournalSaveQueue();
  const [composing, setComposing] = useState(false);
  const { isWide } = useSplitPaneLayout();
  const theme = useTheme();
  const { confirm, confirmElement } = useConfirmSheet();
  // Tab screens stay mounted, and the sheet is a native Modal: without this a
  // background save's dialog would pop up over another tab. It waits instead.
  const isFocused = useIsFocused();
  const dialog = isFocused ? confirmElement : null;

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

  const pending: PendingListItem[] = useMemo(
    () =>
      saveQueue.entries.map((e) => ({
        id: e.id,
        title: e.title.trim() || 'Untitled',
        status: e.status,
      })),
    [saveQueue.entries],
  );

  // Save hands the entry to the background queue and closes the editor at
  // once (spec R1). There is no cancel once Save is tapped (R5).
  const { enqueue } = saveQueue;
  const handleSave = useCallback(
    ({ title, body }: { title: string; body: string }) => {
      enqueue({ title, body });
      setComposing(false);
    },
    [enqueue],
  );

  // A finished save adds a note, so the list reads it back. Only on a new
  // save: a remount already refetches through useFocusEffect.
  const { savedCount } = saveQueue;
  const seenSavedCount = useRef(savedCount);
  useEffect(() => {
    if (savedCount === seenSavedCount.current) return;
    seenSavedCount.current = savedCount;
    void refetch();
  }, [savedCount, refetch]);

  // One dialog at a time: warnings first, then the oldest failure (R4, R6).
  const { warnings, entries, ackWarning, retry, discard } = saveQueue;
  const warning = warnings[0];
  const failed = entries.find((e) => e.status === 'failed');
  useEffect(() => {
    if (warning) {
      const { failures } = warning;
      confirm({
        title: 'Saved with warnings',
        message:
          `${failures} chunk${failures === 1 ? '' : 's'} failed to process. ` +
          'Try running Night Shift, or edit and re-save this entry.',
        buttons: [{ text: 'OK', style: 'cancel', onPress: () => ackWarning(warning.id) }],
      });
    } else if (failed) {
      // No cancel-style button, so the sheet is not dismissable: a scrim tap
      // must never throw the user's text away.
      confirm({
        title: 'Save failed',
        message: failed.error?.message ?? 'The note could not be saved.',
        buttons: [
          { text: 'Discard', style: 'destructive', onPress: () => discard(failed.id) },
          { text: 'Try again', onPress: () => retry(failed.id) },
        ],
      });
    }
  }, [warning, failed, confirm, ackWarning, retry, discard]);

  if (composing) {
    return (
      <>
        {dialog}
        <JournalEntryEditor
          onSave={handleSave}
          onCancel={() => setComposing(false)}
        />
      </>
    );
  }

  if (isWide) {
    return (
      <View style={styles.split}>
        {dialog}
        <View style={styles.listPane}>
          <JournalList
            items={items}
            pending={pending}
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
      {dialog}
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
            pending={pending}
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
