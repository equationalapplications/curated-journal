import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import {
  formatGraphContext,
  useWiki,
} from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CitationText } from '@/components/synthesis/CitationText';
import { buildChatPrompt } from '@/lib/buildChatPrompt';
import {
  CHAT_TRAVERSAL_MAX_DEPTH,
  CHAT_TRAVERSAL_NODE_CAP,
} from '@/lib/constants';
import { extractCitationIds } from '@/lib/citationParser';
import { useJournal } from '@/contexts/JournalContext';
import { useLlm } from '@/contexts/LlmContext';
import { createChatStore, type ChatMessage } from '@/services/chatMessages';

const SYSTEM_PROMPT =
  'You are a personal journal assistant. Answer using the provided notes. Cite sources inline as [cite:fact_id].';

export function SynthesisPane() {
  const { entityId } = useJournal();
  const llm = useLlm();
  const wiki = useWiki();
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
    <ThemedView style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' && styles.userBubble]}>
            {item.role === 'assistant' ? (
              <CitationText content={item.content} />
            ) : (
              <ThemedText>{item.content}</ThemedText>
            )}
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your notes…"
          value={query}
          onChangeText={setQuery}
          editable={!sending}
        />
        {sending ? (
          <ActivityIndicator />
        ) : (
          <Button title="Send" onPress={() => void handleSend()} />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, gap: 8 },
  bubble: { padding: 10, borderRadius: 8, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', opacity: 0.9 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
