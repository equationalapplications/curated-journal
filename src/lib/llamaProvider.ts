import { AppState, Platform } from 'react-native';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';
import { initLlama, type LlamaContext } from 'llama.rn';

export const LLM_MAX_PREDICT_TOKENS = 512;

export type NightShiftLlmProgress = {
  tokensGenerated: number;
  maxTokens: number;
  isGenerating: boolean;
};

const defaultLlmProgress = (): NightShiftLlmProgress => ({
  tokensGenerated: 0,
  maxTokens: LLM_MAX_PREDICT_TOKENS,
  isGenerating: false,
});

let sharedContext: LlamaContext | null = null;
let nightShiftActive = false;
let llmProgress = defaultLlmProgress();
const llmProgressListeners = new Set<(progress: NightShiftLlmProgress) => void>();

function emitLlmProgress(): void {
  const snapshot = { ...llmProgress };
  for (const listener of llmProgressListeners) {
    listener(snapshot);
  }
}

function resetLlmProgress(): void {
  llmProgress = defaultLlmProgress();
  emitLlmProgress();
}

/** Clears in-step LLM progress when the queue advances to the next pass. */
export function resetNightShiftLlmProgress(): void {
  if (!nightShiftActive) return;
  resetLlmProgress();
}

export function setNightShiftActive(active: boolean): void {
  nightShiftActive = active;
  if (!active) {
    resetLlmProgress();
  }
}

export function getNightShiftLlmProgress(): NightShiftLlmProgress {
  return { ...llmProgress };
}

export function subscribeNightShiftLlmProgress(
  listener: (progress: NightShiftLlmProgress) => void,
): () => void {
  llmProgressListeners.add(listener);
  listener({ ...llmProgress });
  return () => {
    llmProgressListeners.delete(listener);
  };
}

async function releaseContext(): Promise<void> {
  if (sharedContext) {
    await sharedContext.release();
    sharedContext = null;
  }
}

AppState.addEventListener('change', (state) => {
  if (state === 'background' && !nightShiftActive) {
    void releaseContext();
  }
});

export function createLlamaProvider(config: {
  modelPath: string;
  contextSize?: number;
  nGpuLayers?: number;
  useMlock?: boolean;
}): LLMProvider {
  const contextSize = config.contextSize ?? 4096;
  const nGpuLayers = config.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0);
  const useMlock = config.useMlock ?? true;

  async function ensureContext(): Promise<LlamaContext> {
    if (sharedContext) return sharedContext;
    sharedContext = await initLlama({
      model: config.modelPath,
      n_ctx: contextSize,
      n_gpu_layers: nGpuLayers,
      use_mlock: useMlock,
    });
    return sharedContext;
  }

  return {
    generateText: async ({ systemPrompt, userPrompt }) => {
      const ctx = await ensureContext();
      let tokenCount = 0;

      if (nightShiftActive) {
        llmProgress = { ...defaultLlmProgress(), isGenerating: true };
        emitLlmProgress();
      }

      try {
        const result = await ctx.completion(
          {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            n_predict: LLM_MAX_PREDICT_TOKENS,
            temperature: 0.7,
          },
          () => {
            if (!nightShiftActive) return;
            tokenCount += 1;
            llmProgress = { ...llmProgress, tokensGenerated: tokenCount };
            emitLlmProgress();
          },
        );

        if (nightShiftActive) {
          llmProgress = {
            tokensGenerated: result.tokens_predicted ?? tokenCount,
            maxTokens: LLM_MAX_PREDICT_TOKENS,
            isGenerating: false,
          };
          emitLlmProgress();
        }

        return result.text;
      } catch (error) {
        if (nightShiftActive) {
          llmProgress = { ...llmProgress, isGenerating: false };
          emitLlmProgress();
        }
        throw error;
      }
    },
  };
}

export { releaseContext };
