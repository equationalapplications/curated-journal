import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { MemoryBundle } from '@equationalapplications/core-llm-wiki';
import Markdown from 'react-native-markdown-display';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCitationNavigation } from '@/contexts/CitationNavigationContext';
import { useJournal } from '@/contexts/JournalContext';

type JournalPaneProps = {
  facts?: MemoryBundle['facts'];
};

function factTitle(body: string, fallback: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
}

export function JournalPane({ facts }: JournalPaneProps) {
  const { selectedFactId } = useJournal();
  const { target, clearTarget } = useCitationNavigation();
  const scrollRef = useRef<ScrollView>(null);

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
      <ThemedView style={styles.empty}>
        <ThemedText>Select a note to read</ThemedText>
      </ThemedView>
    );
  }

  const title = fact.title ?? factTitle(fact.body ?? '', 'Untitled');
  const markdown = fact.body ?? '';

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <Markdown>{markdown}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
