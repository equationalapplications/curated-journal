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

describe('chunkedImportDump sizing and progress', () => {
  const dumpOf = (facts: number, edges = 0) =>
    ({
      generatedAt: 0,
      entities: {
        e1: {
          facts: Array.from({ length: facts }, (_, i) => ({ id: `f${i}` })),
          edges: Array.from({ length: edges }, (_, i) => ({ id: `x${i}` })),
          events: [],
          tasks: [],
        },
      },
    }) as never;

  it('keeps the number of importDump calls roughly constant as journals grow', async () => {
    // Each importDump call rebuilds the whole search index; call count is
    // what made large imports quadratic.
    for (const n of [100, 1000, 3000]) {
      const importDump = jest.fn(async () => undefined);
      await chunkedImportDump({ importDump } as never, dumpOf(n), { merge: true, onProgress: () => {} });
      expect(importDump.mock.calls.length).toBeLessThanOrEqual(8);
    }
  });

  it('never goes below 25 or above 500 notes per call', async () => {
    const { chunkSizeFor } = require('@/lib/chunkedImportDump');
    expect(chunkSizeFor(10)).toBe(25);
    expect(chunkSizeFor(1000)).toBe(125);
    expect(chunkSizeFor(100_000)).toBe(500);
  });

  it('reports progress in notes, not items, so edges do not make it jump', async () => {
    const seen: number[] = [];
    await chunkedImportDump({ importDump: jest.fn(async () => undefined) } as never, dumpOf(100, 3000), {
      merge: true,
      chunkSize: 25,
      onProgress: (pct, d) => {
        seen.push(pct);
        expect(d.factsTotal).toBe(100);
      },
    });
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('stops between chunks when aborted', async () => {
    const controller = new AbortController();
    const importDump = jest.fn(async () => {
      if (importDump.mock.calls.length === 2) controller.abort();
    });
    await chunkedImportDump({ importDump } as never, dumpOf(100), {
      merge: true,
      chunkSize: 25,
      signal: controller.signal,
      onProgress: () => {},
    });
    expect(importDump).toHaveBeenCalledTimes(2);
  });
});
