import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { ThemedText } from '@/components/themed-text';
import { Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type JournalListItem = { id: string; title: string; preview: string };

type Props = {
  items: JournalListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewNote: () => void;
  /** Shown in place of the list when there is nothing to read yet. */
  emptyState?: ReactNode;
};

export function JournalList({ items, selectedId, onSelect, onNewNote, emptyState }: Props) {
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

      {items.length === 0 ? (
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
        <View style={styles.body}>
          <ThemedText type="label">Notes</ThemedText>
          <ListGroup>
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <ListRow
                  divider={index < items.length - 1}
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
              )}
            />
          </ListGroup>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionBar: { paddingHorizontal: Space[4], paddingTop: Space[3], paddingBottom: Space[2] },
  newNote: { alignSelf: 'flex-start' },
  body: { flex: 1, paddingHorizontal: Space[4], gap: Space[2] },
  empty: { flex: 1, paddingHorizontal: Space[4], paddingTop: Space[2] },
});
