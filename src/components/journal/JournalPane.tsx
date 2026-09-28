import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { MemoryBundle } from '@equationalapplications/core-llm-wiki';
import Markdown from 'react-native-markdown-display';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/states';
import { useMarkdownStyles } from '@/components/ui/markdown-styles';
import { useCitationNavigation } from '@/contexts/CitationNavigationContext';
import { useJournal } from '@/contexts/JournalContext';
import { noteBody, noteTitle } from '@/lib/noteText';
import { Space } from '@/constants/theme';

type JournalPaneProps = {
  facts?: MemoryBundle['facts'];
};

export function JournalPane({ facts }: JournalPaneProps) {
  const { selectedFactId } = useJournal();
  const { target, clearTarget } = useCitationNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const markdown = useMarkdownStyles();

  const factId = target?.factId ?? selectedFactId;
  const fact = useMemo(
    () => facts?.find((f) => f.id === factId) ?? null,
    [facts, factId],
  );

  useEffect(() => {
    if (target?.factId) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      clearTarget();
    }
  }, [target, clearTarget]);

  if (!fact) {
    return (
      <EmptyState
        icon={{ ios: 'doc.text', android: 'article', web: 'article' }}
        title="Select a note to read"
        hint="Pick a note from the list to read it here."
        style={styles.empty}
      />
    );
  }

  const title = fact.title ?? noteTitle(fact.body, 'Untitled');
  // The title is rendered above the body, so its `# ` line has to come off or
  // the note reads as though it has two titles.
  const body = noteBody(fact.body, title);

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <ThemedText type="title">{title}</ThemedText>
      <Markdown style={markdown}>{body}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Space[4], gap: Space[2], paddingBottom: Space[6] },
  empty: { flex: 1 },
});
