import '@/lib/installCryptoPolyfill';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { bootstrapWiki } from '@/services/wikiBootstrap';
import { getModelPath, getModelId } from '@/lib/entityStorage';
import { createLlamaProvider } from '@/lib/llamaProvider';
import { createMockLlmProvider } from '@/lib/mockLlmProvider';
import { adoptCachedModel, devLlmMode } from '@/lib/devModel';
import { MODEL_CATALOG } from '@/catalog/modelManifest';
import { AppReadyProvider } from '@/contexts/AppReadyContext';
import { JournalProvider } from '@/contexts/JournalContext';
import { CitationNavigationProvider } from '@/contexts/CitationNavigationContext';
import { LlmProvider } from '@/contexts/LlmContext';
import { ModelHubCompletionProvider } from '@/contexts/ModelHubCompletionContext';
import { JournalWikiProvider } from '@/hooks/useJournalWiki';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type Phase = 'loading' | 'needsModelHub' | 'ready';

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [wiki, setWiki] = useState<WikiMemory | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null);
  const colorScheme = useColorScheme();

  const bootstrap = useCallback(async () => {
    const devMode = devLlmMode();
    if (devMode === 'mock') {
      // Dev only (EXPO_PUBLIC_DEV_LLM=mock): for emulators where llama.rn
      // can't load a model. Skips the model hub entirely.
      const mock = createMockLlmProvider();
      const boot = await bootstrapWiki(mock);
      setWiki(boot.wiki);
      setEntityId(boot.entityId);
      setLlmProvider(mock);
      setPhase('ready');
      return;
    }
    // Dev only: adopt a model already on the device (npm run dev:model)
    // instead of sending a fresh dev install through the model hub.
    const modelPath = (await getModelPath()) ?? (devMode === 'auto' ? await adoptCachedModel() : null);
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

  const navTheme = useMemo(() => {
    const dark = colorScheme === 'dark';
    const base = dark ? DarkTheme : DefaultTheme;
    const t = Colors[dark ? 'dark' : 'light'];
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: t.primary,
        background: t.bg,
        card: t.bg,
        text: t.onSurface,
        border: t.separator,
        notification: t.error,
      },
    };
  }, [colorScheme]);
  const bg = navTheme.colors.background;
  const t = colorScheme === 'dark' ? Colors.dark : Colors.light;

  const isReady = phase === 'ready' && wiki != null && entityId != null && llmProvider != null;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        // Navigator chrome is app chrome: quiet `bg` with a `separator`
        // hairline, no elevation (DESIGN.md 1.1).
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTintColor: t.onSurface,
        headerTitleStyle: { fontSize: 17, fontWeight: '600', color: t.onSurface },
        contentStyle: { backgroundColor: t.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="model-hub" />
      <Stack.Screen
        name="entry/[factId]"
        options={{
          presentation: 'card',
          headerShown: true,
          title: 'Note',
        }}
      />
      <Stack.Screen
        name="night-shift"
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="import"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Import',
        }}
      />
    </Stack>
  );

  return (
    <ThemeProvider value={navTheme}>
      {/* Without this the system keeps whatever the splash screen set, which in
          light theme is white icons on cream. `auto` follows the OS scheme. */}
      <StatusBar style="auto" />
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
        {phase === 'loading' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
            <ActivityIndicator color={navTheme.colors.primary} />
          </View>
        ) : (
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
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
        </KeyboardProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
