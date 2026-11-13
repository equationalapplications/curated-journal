import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type JournalListItem = { id: string; title: string; preview: string };

/** An entry in the background save queue (spec R3). Not openable: no fact exists yet. */
export type PendingListItem = { id: string; title: string; status: 'queued' | 'saving' | 'failed' };

const PENDING_LABEL: Record<PendingListItem['status'], string> = {
  saving: 'Saving…',
  queued: 'Waiting to save',
  failed: 'Save failed',
};

type Props = {
  items: JournalListItem[];
  /** Entries still saving in the background, shown above the saved notes. */
  pending?: PendingListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewNote: () => void;
  /** Shown in place of the list when there is nothing to read yet. */
  emptyState?: ReactNode;
};

export function JournalList({
  items,
  pending = [],
  selectedId,
  onSelect,
  onNewNote,
  emptyState,
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.actionBar}>
        <Button
          label="New note"
          variant="primary"
          onPress={onNewNote}
          style={styles.newNote}
          icon={
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={16}
              weight="bold"
              tintColor={theme.onPrimary}
            />
          }
        />
      </View>

      {items.length === 0 && pending.length === 0 ? (
        <View style={styles.empty}>
          {emptyState ?? (
            <EmptyState
              icon={{ ios: 'book', android: 'book', web: 'book' }}
              title="No notes yet"
              hint="Capture a thought, a quote, or what you did today. Everything stays on this device."
            />
          )}
        </View>
      ) : (
        // One scroller for pending and saved notes, so a long save queue can
        // never push the notes (or its own tail) off screen.
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.header}>
              {pending.length > 0 ? (
                <ListGroup>
                  {pending.map((entry, index) => (
                    <ListRow
                      key={entry.id}
                      divider={index < pending.length - 1}
                      disabled
                      accessibilityLabel={`${entry.title}, ${PENDING_LABEL[entry.status]}`}>
                      <ThemedText type="strong">{entry.title}</ThemedText>
                      <ThemedText
                        type="small"
                        themeColor={entry.status === 'failed' ? 'error' : 'onSurfaceVar'}>
                        {PENDING_LABEL[entry.status]}
                      </ThemedText>
                    </ListRow>
                  ))}
                </ListGroup>
              ) : null}
              {items.length > 0 ? <ThemedText type="label">Notes</ThemedText> : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const first = index === 0;
            const last = index === items.length - 1;
            return (
              // The notes card is drawn per row (sides on every row, top and
              // bottom edges on the ends) because the rows share a scroller
              // with the pending group above them.
              <View
                style={[
                  styles.groupRow,
                  { backgroundColor: theme.elev1, borderColor: theme.outlineVar },
                  first && styles.groupFirst,
                  last && styles.groupLast,
                ]}>
                <ListRow
                  divider={!last}
                  onPress={() => onSelect(item.id)}
                  selected={selectedId === item.id}
                  accessibilityLabel={item.title}>
                  <ThemedText
                    type="strong"
                    style={selectedId === item.id ? { color: theme.onPrimaryCont } : undefined}>
                    {item.title}
                  </ThemedText>
                  {item.preview ? (
                    <ThemedText type="small" numberOfLines={2} themeColor="onSurfaceVar">
                      {item.preview}
                    </ThemedText>
                  ) : null}
                </ListRow>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionBar: { paddingHorizontal: Space[4], paddingTop: Space[3], paddingBottom: Space[2] },
  newNote: { alignSelf: 'flex-start' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: Space[4], paddingBottom: Space[4] },
  header: { gap: Space[2], paddingBottom: Space[2] },
  groupRow: { borderLeftWidth: 1, borderRightWidth: 1, overflow: 'hidden' },
  groupFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
  },
  groupLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
  },
  empty: { flex: 1, paddingHorizontal: Space[4], paddingTop: Space[2] },
});
