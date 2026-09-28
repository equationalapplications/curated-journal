import { useCallback } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/states';
import { useMarkdownStyles } from '@/components/ui/markdown-styles';
import { useJournal } from '@/contexts/JournalContext';
import { useJournalMemoryRead } from '@/hooks/useJournalMemoryRead';
import { useTheme } from '@/hooks/use-theme';
import { Space } from '@/constants/theme';

export default function EntryScreen() {
  const { factId } = useLocalSearchParams<{ factId: string }>();
  const { entityId } = useJournal();
  const { data, refetch } = useJournalMemoryRead(entityId);
  const theme = useTheme();
  const markdown = useMarkdownStyles();
  const fact = data?.facts?.find((f) => f.id === factId);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (!fact) {
    return (
      <EmptyState
        icon={{ ios: 'questionmark.circle', android: 'help', web: 'help' }}
        title="Note not found"
        style={styles.empty}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} style={{ backgroundColor: theme.bg }}>
      <ThemedText type="title">{fact.title ?? 'Untitled'}</ThemedText>
      <Markdown style={markdown}>{fact.body ?? ''}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Space[4], gap: Space[2], paddingBottom: Space[6] },
  empty: { flex: 1, marginTop: Space[6] },
});
