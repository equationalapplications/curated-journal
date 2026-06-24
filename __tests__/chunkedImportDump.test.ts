import { chunkedImportDump } from '@/lib/chunkedImportDump';
import { yieldToUI } from '@/lib/yieldToUI';

jest.mock('@/lib/yieldToUI', () => ({
  yieldToUI: jest.fn(async () => undefined),
}));

describe('chunkedImportDump', () => {
  it('imports in chunks with progress', async () => {
    const importDump = jest.fn(async () => undefined);
    const wiki = { importDump } as never;
    const dump = {
      version: 1,
      entities: {
        e1: {
          facts: Array.from({ length: 30 }, (_, i) => ({ id: `f${i}` })),
          edges: [],
          events: [],
          tasks: [],
        },
      },
    } as never;
    const onProgress = jest.fn();
    await chunkedImportDump(wiki, dump, { merge: true, chunkSize: 25, onProgress });
    expect(importDump).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalled();
    expect(yieldToUI).toHaveBeenCalled();
  });
});
