import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import * as SQLite from 'expo-sqlite';
import {
  formatGraphContext,
  useWiki,
} from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { CitationText } from '@/components/synthesis/CitationText';
import { buildChatPrompt } from '@/lib/buildChatPrompt';
import {
  CHAT_TRAVERSAL_MAX_DEPTH,
  CHAT_TRAVERSAL_NODE_CAP,
} from '@/lib/constants';
import { extractCitationIds } from '@/lib/citationParser';
import { useJournal } from '@/contexts/JournalContext';
import { useLlm } from '@/contexts/LlmContext';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Space } from '@/constants/theme';
import { createChatStore, type ChatMessage } from '@/services/chatMessages';

const SYSTEM_PROMPT =
  'You are a personal journal assistant. Answer using the provided notes. Cite sources inline as [cite:fact_id].';

export function SynthesisPane() {
  const { entityId } = useJournal();
  const llm = useLlm();
  const wiki = useWiki();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const chatStore = useMemo(() => {
    let store: ReturnType<typeof createChatStore> | null = null;
    return {
      async get() {
        if (!store) {
          const db = await SQLite.openDatabaseAsync('chat.db');
          store = createChatStore(db);
        }
        return store;
      },
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const store = await chatStore.get();
      setMessages(await store.list());
    })();
  }, [chatStore]);

  const handleSend = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const store = await chatStore.get();
      await store.insert({ role: 'user', content: trimmed, citations: [] });
      const retrieval = await wiki.read(entityId, trimmed, { maxResults: 8 });
      const topHitId = retrieval.facts[0]?.id;
      let graphContext = '';
      if (topHitId) {
        const neighborhood = await wiki.traverseGraph(entityId, {
          sourceId: topHitId,
          maxDepth: CHAT_TRAVERSAL_MAX_DEPTH,
          maxTraversalNodes: CHAT_TRAVERSAL_NODE_CAP,
          minTraversalConfidence: 'inferred',
        });
        graphContext = formatGraphContext(neighborhood);
      }
      const facts = retrieval.facts.map((f) => ({
        id: f.id,
        title: f.title ?? 'Untitled',
        body: f.body ?? '',
      }));
      const { systemPrompt, userPrompt } = buildChatPrompt({
        systemPrompt: SYSTEM_PROMPT,
        userQuery: trimmed,
        facts,
        graphContext,
        contextTokenBudget: 4096,
      });
      const assistantText = await llm.generateText({ systemPrompt, userPrompt });
      const citations = extractCitationIds(assistantText);
      await store.insert({ role: 'assistant', content: assistantText, citations });
      setMessages(await store.list());
      setQuery('');
    } finally {
      setSending(false);
    }
  }, [chatStore, entityId, llm, query, sending, wiki]);

  return (
    <ThemedView style={styles.container} testID="synthesis-pane">
      <KeyboardAwareScrollView
        testID="kbd-aware"
        contentContainerStyle={styles.list}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <EmptyState
            icon={{ ios: 'bubble.left.and.bubble.right', android: 'chat', web: 'chat' }}
            title="Ask about your notes"
            hint="Answers are grounded in your journal and cite the note they came from."
            style={styles.empty}
          />
        ) : null}
        {messages.map((item) => (
          <View
            key={item.id}
            style={[
              styles.bubble,
              // Turns are content, not controls: separated by surface alone.
              // An `outlineVar` border would make them read as text fields.
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              { backgroundColor: item.role === 'user' ? theme.elev2 : theme.elev1 },
            ]}>
            {item.role === 'assistant' ? (
              <CitationText content={item.content} />
            ) : (
              <ThemedText>{item.content}</ThemedText>
            )}
          </View>
        ))}
        <View style={styles.composer}>
          <Input
            style={styles.input}
            placeholder="Ask about your notes…"
            value={query}
            onChangeText={setQuery}
            editable={!sending}
          />
          {sending ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Button label="Send" variant="primary" onPress={() => void handleSend()} />
          )}
        </View>
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Space[4], gap: Space[2], flexGrow: 1 },
  empty: { flex: 1, minHeight: 260 },
  bubble: {
    padding: Space[3],
    borderRadius: Radius.sm,
    maxWidth: '92%',
  },
  assistantBubble: { alignSelf: 'flex-start' },
  userBubble: { alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    gap: Space[2],
    alignItems: 'center',
    marginTop: 'auto',
  },
  input: { flex: 1 },
});
