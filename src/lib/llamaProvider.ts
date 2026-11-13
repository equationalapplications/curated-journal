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
/**
 * Tail of the generateText chain. A background save, a chat question and
 * Night Shift share one llama context, and llama.rn throws "Context is busy"
 * if a second completion starts while one is running, so calls queue here
 * (spec specs/2026-11-12-background-save R8).
 */
let generationTail: Promise<unknown> = Promise.resolve();

/** Thrown by a generateText call cancelled through a generation scope. */
export class GenerationCancelledError extends Error {
  constructor() {
    super('LLM generation cancelled');
    this.name = 'GenerationCancelledError';
  }
}

type PendingGeneration = {
  cancelled: boolean;
  /** The context running this call's completion, set only while it runs. */
  running: LlamaContext | null;
  /** Ends a foreground wait early when the call is cancelled. */
  wake: (() => void) | null;
};

type GenerationScope = { floor: number; cancelled: boolean };

/** Every generateText call not yet settled, keyed by call order. */
const pendingGenerations = new Map<number, PendingGeneration>();
/** Scopes not yet closed. A cancelled one also cancels calls made later. */
const openScopes = new Set<GenerationScope>();
let generationSeq = 0;

function cancelPending(pending: PendingGeneration): void {
  if (pending.cancelled) return;
  pending.cancelled = true;
  // The completion settles once stopped; serialization holds until then.
  pending.running?.stopCompletion().catch(() => undefined);
  pending.wake?.();
}

function serialized<T>(run: (pending: PendingGeneration) => Promise<T>): Promise<T> {
  const seq = ++generationSeq;
  const pending: PendingGeneration = { cancelled: false, running: null, wake: null };
  for (const scope of openScopes) {
    if (scope.cancelled && seq > scope.floor) pending.cancelled = true;
  }
  pendingGenerations.set(seq, pending);
  const start = () => {
    if (pending.cancelled) return Promise.reject(new GenerationCancelledError());
    return run(pending);
  };
  const result = generationTail.then(start, start).finally(() => {
    pendingGenerations.delete(seq);
  });
  // The next caller waits for this one to settle, success or failure.
  generationTail = result.catch(() => undefined);
  return result;
}

/**
 * Opens a scope over every generateText call made from now until `close()`.
 * `cancel()` stops the scope's running completion (llama.rn `stopCompletion`)
 * and rejects its queued calls, and any it makes later, with
 * `GenerationCancelledError` before they start. Calls made before the scope
 * opened, or after it closed, are untouched.
 *
 * The save queue opens one per save, cancels it on timeout and closes it when
 * the save ends, so a timed-out save frees the chain instead of holding every
 * later call behind it. A chat question or Night Shift call made while a save
 * is cancelled is cancelled with it (calls are not tagged by caller).
 */
export function openGenerationScope(): { cancel: () => void; close: () => void } {
  const scope: GenerationScope = { floor: generationSeq, cancelled: false };
  openScopes.add(scope);
  return {
    cancel: () => {
      scope.cancelled = true;
      for (const [seq, pending] of pendingGenerations) {
        if (seq > scope.floor) cancelPending(pending);
      }
    },
    close: () => {
      openScopes.delete(scope);
    },
  };
}

/**
 * Outside Night Shift the context is released in the background, so a queued
 * background save would otherwise reload the model there (memory pressure,
 * Jetsam on iOS). Wait for the foreground instead; a cancel ends the wait.
 */
function waitForForeground(pending: PendingGeneration): Promise<void> {
  if (nightShiftActive || AppState.currentState !== 'background') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') done();
    });
    function done() {
      subscription.remove();
      pending.wake = null;
      resolve();
    }
    pending.wake = done;
  });
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
    generateText: ({ systemPrompt, userPrompt }) => serialized(async (pending) => {
      await waitForForeground(pending);
      if (pending.cancelled) throw new GenerationCancelledError();
      const ctx = await ensureContext();
      if (pending.cancelled) throw new GenerationCancelledError();
      let tokenCount = 0;

      if (nightShiftActive) {
        llmProgress = { ...defaultLlmProgress(), isGenerating: true };
        emitLlmProgress();
      }

      try {
        pending.running = ctx;
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
        ).finally(() => {
          pending.running = null;
        });
        // A stopped completion resolves with partial text; never hand that on.
        if (pending.cancelled) throw new GenerationCancelledError();
        // So does one whose context was released mid-run (the app went to the
        // background): llama.rn flags it `interrupted`. That is a failure, not
        // output — a background save must not ingest a truncated answer.
        if (result.interrupted) {
          throw new Error('LLM generation interrupted: the model was released');
        }

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
