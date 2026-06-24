import { AppState, Platform } from 'react-native';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';
import { initLlama, type LlamaContext } from 'llama.rn';

let sharedContext: LlamaContext | null = null;
let nightShiftActive = false;

export function setNightShiftActive(active: boolean): void {
  nightShiftActive = active;
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
}): LLMProvider {
  const contextSize = config.contextSize ?? 4096;
  const nGpuLayers = config.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0);

  async function ensureContext(): Promise<LlamaContext> {
    if (sharedContext) return sharedContext;
    sharedContext = await initLlama({
      model: config.modelPath,
      n_ctx: contextSize,
      n_gpu_layers: nGpuLayers,
      use_mlock: true,
    });
    return sharedContext;
  }

  return {
    generateText: async ({ systemPrompt, userPrompt }) => {
      const ctx = await ensureContext();
      const result = await ctx.completion(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          n_predict: 512,
          temperature: 0.7,
        },
        (data) => {
          void data.token;
        },
      );
      return result.text;
    },
  };
}

export { releaseContext };
