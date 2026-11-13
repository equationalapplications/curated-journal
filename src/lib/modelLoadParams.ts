import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { LlamaModelConfig } from '@/catalog/modelManifest';

export const GIB = 1024 ** 3;
export const LOW_MEMORY_KV_CACHE_TYPE = 'q8_0' as const;
// Not applied: spec A5 lever 2 does not fit (heal prompt up to 40000 chars); see the spec's implementation record.
export const LOW_MEMORY_CONTEXT_SIZE: number | null = null;

export type DeviceMemory = { platform: string; totalMemoryBytes: number | null };

export type ModelLoadParams = {
  n_ctx: number;
  n_gpu_layers: number;
  use_mlock: boolean;
  cache_type_k?: 'q8_0';
  cache_type_v?: 'q8_0';
  flash_attn_type?: 'on';
};

export function isPositiveFinite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function isBelowComfortableRam(
  minComfortableRamBytes: number | undefined,
  totalMemoryBytes: number | null,
): boolean {
  if (!isPositiveFinite(minComfortableRamBytes) || !isPositiveFinite(totalMemoryBytes)) return false;
  return totalMemoryBytes < minComfortableRamBytes;
}

export function resolveModelLoadParams(input: {
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
  device: DeviceMemory;
}): ModelLoadParams {
  const { llamaConfig, minComfortableRamBytes, device } = input;
  const ios = device.platform === 'ios';
  const params: ModelLoadParams = {
    n_ctx: llamaConfig?.contextSize ?? 4096,
    n_gpu_layers: llamaConfig?.nGpuLayers ?? (ios ? 99 : 0),
    use_mlock: ios ? false : (llamaConfig?.useMlock ?? true),
  };
  if (ios && isBelowComfortableRam(minComfortableRamBytes, device.totalMemoryBytes)) {
    params.cache_type_k = LOW_MEMORY_KV_CACHE_TYPE;
    params.cache_type_v = LOW_MEMORY_KV_CACHE_TYPE;
    params.flash_attn_type = 'on';
    if (LOW_MEMORY_CONTEXT_SIZE !== null) {
      params.n_ctx = Math.min(params.n_ctx, LOW_MEMORY_CONTEXT_SIZE);
    }
  }
  return params;
}

export function currentDeviceMemory(): DeviceMemory {
  return { platform: Platform.OS, totalMemoryBytes: Device.totalMemory ?? null };
}
