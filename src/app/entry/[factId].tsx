import { useCallback } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ThemedText } from '@/components/themed-text';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalMemoryRead } from '@/hooks/useJournalMemoryRead';

export default function EntryScreen() {
  const { factId } = useLocalSearchParams<{ factId: string }>();
  const { entityId } = useJournal();
  const { data, refetch } = useJournalMemoryRead(entityId);
  const fact = data?.facts?.find((f) => f.id === factId);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

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
