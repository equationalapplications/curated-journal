import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { bootstrapWiki } from '@/services/wikiBootstrap';
import { createMockLlmProvider } from '@/lib/mockLlmProvider';
import { getModelPath } from '@/lib/entityStorage';
import { createLlamaProvider } from '@/lib/llamaProvider';
import { JournalProvider } from '@/contexts/JournalContext';
import { CitationNavigationProvider } from '@/contexts/CitationNavigationContext';
import { LlmProvider } from '@/contexts/LlmContext';
import { JournalWikiProvider } from '@/hooks/useJournalWiki';

export default function RootLayout() {
  const [wiki, setWiki] = useState<WikiMemory | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const modelPath = await getModelPath();
      const provider = modelPath ? createLlamaProvider({ modelPath }) : createMockLlmProvider();
      const boot = await bootstrapWiki(provider);
      if (!cancelled) {
        setWiki(boot.wiki);
        setEntityId(boot.entityId);
        setLlmProvider(provider);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wiki || !entityId || !llmProvider) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WikiProvider wiki={wiki}>
        <LlmProvider provider={llmProvider}>
          <JournalWikiProvider wiki={wiki} entityId={entityId}>
            <JournalProvider entityId={entityId}>
              <CitationNavigationProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="entry/[factId]"
                    options={{ presentation: 'card', headerShown: true, title: 'Note' }}
                  />
                  <Stack.Screen name="night-shift" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen
                    name="import"
                    options={{ presentation: 'modal', headerShown: true, title: 'Import' }}
                  />
                </Stack>
              </CitationNavigationProvider>
            </JournalProvider>
          </JournalWikiProvider>
        </LlmProvider>
      </WikiProvider>
    </GestureHandlerRootView>
  );
}
