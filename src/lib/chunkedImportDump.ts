import type { MemoryBundle, MemoryDump, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { IMPORT_CHUNK_SIZE } from '@/lib/constants';
import { yieldToUI } from '@/lib/yieldToUI';

/** Aim for about this many chunks per import, whatever its size. */
export const TARGET_CHUNKS = 8;
export const MAX_IMPORT_CHUNK_SIZE = 500;

/**
 * Facts per `importDump` call. Each call ends with the wiki rebuilding the
 * entity's whole search index, so the rebuild cost grows with the journal,
 * not with the chunk: fixed small chunks made a 1000-note import quadratic
 * (40 rebuilds; ~129s on an emulator, 19s in Node vs 1s in one call). A
 * roughly constant number of chunks keeps it linear *up to the cap*: above
 * ~4000 notes (8 × 500) the chunk count grows as n/500, by design — the cap
 * bounds each write transaction and keeps every chunk well under the
 * transaction/latency budget even for very large journals.
 */
export function chunkSizeFor(factCount: number): number {
  return Math.min(
    MAX_IMPORT_CHUNK_SIZE,
    Math.max(IMPORT_CHUNK_SIZE, Math.ceil(factCount / TARGET_CHUNKS)),
  );
}

export type ImportProgress = { factsDone: number; factsTotal: number };

function chunkBundle(bundle: MemoryBundle, chunkSize: number): MemoryBundle[] {
  const edges = bundle.edges ?? [];
  const slices: MemoryBundle[] = [];
  for (let i = 0; i < bundle.facts.length; i += chunkSize) {
    slices.push({
      facts: bundle.facts.slice(i, i + chunkSize),
      edges: i === 0 ? edges : [],
      events: i === 0 ? bundle.events : [],
      tasks: i === 0 ? bundle.tasks : [],
    });
  }
  if (slices.length === 0) {
    slices.push({ facts: [], edges, events: bundle.events, tasks: bundle.tasks });
  }
  return slices;
}

export async function chunkedImportDump(
  wiki: WikiMemory,
  dump: MemoryDump,
  opts: {
    merge: boolean;
    /** Fixed facts per chunk; by default sized from the dump (chunkSizeFor). */
    chunkSize?: number;
    /**
     * Fraction of notes imported, 0..1, plus the counts. Counted in facts:
     * edges, events and tasks ride along with the first chunk and are cheap,
     * so counting them made the bar jump to ~75% and then crawl.
     */
    onProgress: (pct: number, detail: ImportProgress) => void;
    /** Stops between chunks; chunks already imported stay imported (merge). */
    signal?: AbortSignal;
  },
): Promise<void> {
  const entities = Object.entries(dump.entities);
  const factsTotal = entities.reduce((n, [, b]) => n + b.facts.length, 0);
  let factsDone = 0;

  for (const [entityId, bundle] of entities) {
    const chunkSize = opts.chunkSize ?? chunkSizeFor(bundle.facts.length);
    for (const slice of chunkBundle(bundle, chunkSize)) {
      if (opts.signal?.aborted) return;
      await wiki.importDump(
        { generatedAt: dump.generatedAt, entities: { [entityId]: slice } },
        { merge: opts.merge },
      );
      factsDone += slice.facts.length;
      opts.onProgress(factsTotal === 0 ? 1 : factsDone / factsTotal, { factsDone, factsTotal });
      await yieldToUI();
    }
  }
}
