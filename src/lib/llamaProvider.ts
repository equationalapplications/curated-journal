import { AppState, Platform } from 'react-native';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';
import type { LlamaContext } from 'llama.rn';
import { initLlama } from '@/lib/llamaRuntime';

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
/**
 * Tail of the generateText chain. A background save, a chat question and
 * Night Shift share one llama context, and llama.rn throws "Context is busy"
 * if a second completion starts while one is running, so calls queue here
 * (spec specs/2026-11-12-background-save R8).
 */
let generationTail: Promise<unknown> = Promise.resolve();

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = generationTail.then(run, run);
  // The next caller waits for this one to settle, success or failure.
  generationTail = result.catch(() => undefined);
  return result;
}
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
    maxOutputTokens: LLM_MAX_PREDICT_TOKENS,
    generateText: ({ systemPrompt, userPrompt }) => serialized(async () => {
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
          // A token callback switches on llama.rn's per-token partial output
          // (a full re-parse plus a JS-thread hop per token), so pass one only
          // while Night Shift shows token progress (spec R9).
          nightShiftActive
            ? () => {
                if (!nightShiftActive) return;
                tokenCount += 1;
                llmProgress = { ...llmProgress, tokensGenerated: tokenCount };
                emitLlmProgress();
              }
            : undefined,
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
    }),
  };
}

export { releaseContext };
