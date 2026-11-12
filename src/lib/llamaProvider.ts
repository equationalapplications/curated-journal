import { AppState } from 'react-native';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';
import type { LlamaContext } from 'llama.rn';
import { initLlama } from '@/lib/llamaRuntime';
import { currentDeviceMemory, resolveModelLoadParams } from '@/lib/modelLoadParams';
import type { LlamaModelConfig } from '@/catalog/modelManifest';

// core-llm-wiki facts carry bodies up to 800 chars; 512 tokens truncated multi-fact
// librarian/heal JSON. Also passed to the wiki as maxOutputTokens to size batches.
export const LLM_MAX_PREDICT_TOKENS = 2048;

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
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
}): LLMProvider {
  async function ensureContext(): Promise<LlamaContext> {
    if (sharedContext) return sharedContext;
    sharedContext = await initLlama({
      model: config.modelPath,
      ...resolveModelLoadParams({
        llamaConfig: config.llamaConfig,
        minComfortableRamBytes: config.minComfortableRamBytes,
        device: currentDeviceMemory(),
      }),
    });
    return sharedContext;
  }

  return {
    maxOutputTokens: LLM_MAX_PREDICT_TOKENS,
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
            // Qwen's recommended non-thinking sampling. Thinking must stay off:
            // core-llm-wiki parses from the first '{', so reasoning text breaks it.
            jinja: true,
            enable_thinking: false,
            temperature: 0.7,
            top_p: 0.8,
            top_k: 20,
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
