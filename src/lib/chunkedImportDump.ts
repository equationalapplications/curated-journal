import type { MemoryBundle, MemoryDump, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { IMPORT_CHUNK_SIZE } from '@/lib/constants';
import { yieldToUI } from '@/lib/yieldToUI';

function countItems(dump: MemoryDump): number {
  let total = 0;
  for (const bundle of Object.values(dump.entities)) {
    total +=
      bundle.facts.length +
      (bundle.edges?.length ?? 0) +
      bundle.events.length +
      bundle.tasks.length;
  }
  return Math.max(total, 1);
}

function sliceItemCount(bundle: MemoryBundle): number {
  return (
    bundle.facts.length +
    (bundle.edges?.length ?? 0) +
    bundle.events.length +
    bundle.tasks.length
  );
}

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
  opts: { merge: boolean; chunkSize?: number; onProgress: (pct: number) => void },
): Promise<void> {
  const chunkSize = opts.chunkSize ?? IMPORT_CHUNK_SIZE;
  const entities = Object.entries(dump.entities);
  let processed = 0;
  const total = countItems(dump);

  for (const [entityId, bundle] of entities) {
    for (const slice of chunkBundle(bundle, chunkSize)) {
      await wiki.importDump(
        { generatedAt: dump.generatedAt, entities: { [entityId]: slice } },
        { merge: opts.merge },
      );
      processed += sliceItemCount(slice);
      opts.onProgress(processed / total);
      await yieldToUI();
    }
  }
}
