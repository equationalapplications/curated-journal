import { initLlama } from '@/lib/llamaRuntime';
import { currentDeviceMemory, resolveModelLoadParams } from '@/lib/modelLoadParams';
import type { LlamaModelConfig } from '@/catalog/modelManifest';

export type SmokeTestResult = { ok: true } | { ok: false; error: Error };

export async function runModelSmokeTest(input: {
  modelPath: string;
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
}): Promise<SmokeTestResult> {
  try {
    const ctx = await initLlama({
      model: input.modelPath,
      ...resolveModelLoadParams({
        llamaConfig: input.llamaConfig,
        minComfortableRamBytes: input.minComfortableRamBytes,
        device: currentDeviceMemory(),
      }),
    });
    try {
      await ctx.completion(
        {
          messages: [
            { role: 'system', content: 'Reply with OK' },
            { role: 'user', content: 'Go' },
          ],
          n_predict: 10,
          jinja: true,
          enable_thinking: false,
        },
        () => undefined,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      await ctx.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
