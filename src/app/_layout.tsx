import '@/lib/installCryptoPolyfill';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { bootstrapWiki } from '@/services/wikiBootstrap';
import { getModelPath, getModelId } from '@/lib/entityStorage';
import { createLlamaProvider } from '@/lib/llamaProvider';
import { MODEL_CATALOG } from '@/catalog/modelManifest';
import { AppReadyProvider } from '@/contexts/AppReadyContext';
import { JournalProvider } from '@/contexts/JournalContext';
import { CitationNavigationProvider } from '@/contexts/CitationNavigationContext';
import { LlmProvider } from '@/contexts/LlmContext';
import { ModelHubCompletionProvider } from '@/contexts/ModelHubCompletionContext';
import { JournalWikiProvider } from '@/hooks/useJournalWiki';

type Phase = 'loading' | 'needsModelHub' | 'ready';

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [wiki, setWiki] = useState<WikiMemory | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null);

  const bootstrap = useCallback(async () => {
    const modelPath = await getModelPath();
    if (!modelPath) {
      setWiki(null);
      setEntityId(null);
      setLlmProvider(null);
      setPhase('needsModelHub');
      return;
    }
    const modelId = await getModelId();
    const model = MODEL_CATALOG.find((entry) => entry.id === modelId);
    const provider = createLlamaProvider({
      modelPath,
      contextSize: model?.llamaConfig.contextSize,
      nGpuLayers: model?.llamaConfig.nGpuLayers,
      useMlock: model?.llamaConfig.useMlock,
    });
    const boot = await bootstrapWiki(provider);
    setWiki(boot.wiki);
    setEntityId(boot.entityId);
    setLlmProvider(provider);
    setPhase('ready');
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const isReady = phase === 'ready' && wiki != null && entityId != null && llmProvider != null;

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" options={{ href: isReady ? undefined : null }} />
      <Stack.Screen name="model-hub" options={{ href: isReady ? null : undefined }} />
      <Stack.Screen
        name="entry/[factId]"
        options={{
          href: isReady ? undefined : null,
          presentation: 'card',
          headerShown: true,
          title: 'Note',
        }}
      />
      <Stack.Screen
        name="night-shift"
        options={{ href: isReady ? undefined : null, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="import"
        options={{
          href: isReady ? undefined : null,
          presentation: 'modal',
          headerShown: true,
          title: 'Import',
        }}
      />
    </Stack>
  );

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {phase === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppReadyProvider ready={isReady}>
            <ModelHubCompletionProvider onComplete={bootstrap}>
              {isReady ? (
                <WikiProvider wiki={wiki}>
                  <LlmProvider provider={llmProvider}>
                    <JournalWikiProvider wiki={wiki} entityId={entityId}>
                      <JournalProvider entityId={entityId}>
                        <CitationNavigationProvider>{stack}</CitationNavigationProvider>
                      </JournalProvider>
                    </JournalWikiProvider>
                  </LlmProvider>
                </WikiProvider>
              ) : (
                stack
              )}
            </ModelHubCompletionProvider>
          </AppReadyProvider>
        </GestureHandlerRootView>
      )}
    </SafeAreaProvider>
  );
}
