import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useMemoryRead } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { useJournal } from '@/contexts/JournalContext';

export default function EntryScreen() {
  const { factId } = useLocalSearchParams<{ factId: string }>();
  const { entityId } = useJournal();
  const { data } = useMemoryRead(entityId, '');
  const fact = data?.facts?.find((f) => f.id === factId);

  if (!fact) {
    return <ThemedText style={styles.pad}>Note not found</ThemedText>;
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <ThemedText type="subtitle">{fact.title ?? 'Untitled'}</ThemedText>
      <Markdown>{fact.body ?? ''}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ pad: { padding: 16, gap: 12 } });
