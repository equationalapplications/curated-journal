import type { useWikiIngest } from '@equationalapplications/expo-llm-wiki';

/**
 * The facade does not export `IngestResult` by name, so derive it from the
 * hook's `execute` signature. Stays attached to the real shape: if the
 * library renames or retypes `failedChunks` / `parseFailures`, tsc fails
 * here — which is exactly the shape-drift protection this helper exists for.
 */
export type IngestResult = Awaited<ReturnType<ReturnType<typeof useWikiIngest>['execute']>>;

/**
 * Total user-visible failures for one ingest: hard chunk failures plus any
 * per-chunk parse/LLM failures. `parseFailures` overlaps `failedChunks`
 * only in the sense that both describe failed chunks of the same document;
 * the library counts them as disjoint buckets (failedChunks = chunks that
 * did not ingest, parseFailures = per-chunk reasons surfaced for triage).
 */
export function countIngestFailures(result: IngestResult | null | undefined): number {
  if (!result) return 0;
  return result.failedChunks + (result.parseFailures?.length ?? 0);
}
