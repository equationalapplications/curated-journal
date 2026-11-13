import { GIB, isBelowComfortableRam, resolveModelLoadParams } from '@/lib/modelLoadParams';

jest.mock('expo-device', () => ({ totalMemory: null }));

const ios3 = { platform: 'ios', totalMemoryBytes: 2.9 * GIB };
const ios8 = { platform: 'ios', totalMemoryBytes: 7.5 * GIB };
const android3 = { platform: 'android', totalMemoryBytes: 2.9 * GIB };
const fl = { llamaConfig: { contextSize: 8192, useMlock: true }, minComfortableRamBytes: 5 * GIB };

describe('modelLoadParams', () => {
  it('never pins weights on iOS, whatever the manifest says', () => {
    expect(resolveModelLoadParams({ ...fl, device: ios8 })).toEqual({ n_ctx: 8192, n_gpu_layers: 99, use_mlock: false });
  });
  it('adds the quantized KV cache on low-memory iOS', () => {
    expect(resolveModelLoadParams({ ...fl, device: ios3 })).toMatchObject({
      use_mlock: false, cache_type_k: 'q8_0', cache_type_v: 'q8_0', flash_attn_type: 'on',
    });
  });
  it('keeps the 8192 context on low-memory iOS (A5 lever 2 not applied)', () => {
    expect(resolveModelLoadParams({ ...fl, device: ios3 }).n_ctx).toBe(8192);
  });
  it('leaves Android exactly as today, even below comfortable RAM', () => {
    expect(resolveModelLoadParams({ ...fl, device: android3 })).toEqual({ n_ctx: 8192, n_gpu_layers: 0, use_mlock: true });
  });
  it('custom import: 4096 context, no pinning on iOS, no low-memory profile', () => {
    expect(resolveModelLoadParams({ llamaConfig: { contextSize: 4096 }, device: ios3 }))
      .toEqual({ n_ctx: 4096, n_gpu_layers: 99, use_mlock: false });
  });
  it('falls back to a 4096 context when none is given', () => {
    expect(resolveModelLoadParams({ device: ios8 }).n_ctx).toBe(4096);
  });
  it.each([null, 0, NaN, -1])('treats total memory %p as unknown', (m) => {
    expect(isBelowComfortableRam(5 * GIB, m as number | null)).toBe(false);
    expect(resolveModelLoadParams({ ...fl, device: { platform: 'ios', totalMemoryBytes: m as number | null } }))
      .toEqual({ n_ctx: 8192, n_gpu_layers: 99, use_mlock: false });
  });
  it('compares strictly below the threshold', () => {
    expect(isBelowComfortableRam(5 * GIB, 5 * GIB)).toBe(false);
    expect(isBelowComfortableRam(5 * GIB, 5 * GIB - 1)).toBe(true);
  });
});
