import { Platform } from 'react-native';
import { initLlama } from 'llama.rn';
import { File } from 'expo-file-system';
import type { LlamaModelConfig } from '@/catalog/modelManifest';

export type SmokeTestResult = { ok: true } | { ok: false; error: Error };

export async function runModelSmokeTest(input: {
  modelPath: string;
  llamaConfig: LlamaModelConfig;
}): Promise<SmokeTestResult> {
  try {
    const ctx = await initLlama({
      model: input.modelPath,
      n_ctx: input.llamaConfig.contextSize,
      n_gpu_layers: input.llamaConfig.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0),
      use_mlock: input.llamaConfig.useMlock ?? true,
    });
    try {
      await ctx.completion(
        {
          messages: [
            { role: 'system', content: 'Reply with OK' },
            { role: 'user', content: 'Go' },
          ],
          n_predict: 10,
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
    const file = new File(input.modelPath);
    if (file.exists) file.delete();
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
