import { FlatList, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export type JournalListItem = { id: string; title: string; preview: string };

type Props = {
  items: JournalListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewNote: () => void;
};

export function JournalList({ items, selectedId, onSelect, onNewNote }: Props) {
  return (
    <ThemedView style={styles.container}>
      <Pressable onPress={onNewNote} style={styles.newButton}>
        <ThemedText type="smallBold">+ New note</ThemedText>
      </Pressable>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            style={[styles.row, selectedId === item.id && styles.selected]}>
            <ThemedText type="smallBold">{item.title}</ThemedText>
            <ThemedText numberOfLines={2}>{item.preview}</ThemedText>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  newButton: { padding: 12 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  selected: { opacity: 0.7 },
});
