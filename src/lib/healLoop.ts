import type { HealResult } from '@equationalapplications/core-llm-wiki';

/**
 * A single library heal batch: `useWikiMaintenance().runHeal(entityId)`
 * resolves to the raw `HealResult` (wiki 7.x batched semantics).
 */
export type HealBatchRunner = (entityId: string) => Promise<HealResult>;

export type HealStepSummary = {
  batches: number;
  scanned: number;
  downgraded: number;
  deleted: number;
  newFactsCreated: number;
  skipped: number;
  degraded: number;
  exhausted: boolean;
  noProgress: boolean;
  aborted: boolean;
  remaining: number;
};

export type HealLoopOptions = {
  /**
   * Consulted AFTER each batch (never before the first). Returning false
   * stops the loop once the in-flight batch finishes — abort latency is
   * exactly one batch.
   */
  shouldContinue?: () => boolean;
  /** Safety cap. Default 200; values below 1 are clamped to 1. */
  maxBatches?: number;
};

export const HEAL_LOOP_MAX_BATCHES = 200;

/**
 * Drain library heal batches until convergence. Termination, checked in
 * order AFTER each batch (never before the first):
 *   1. remaining === 0         -> done (exhausted: false; beats the cap)
 *   2. !shouldContinue()       -> stop (aborted: true)
 *   3. remaining not shrinking -> stop (noProgress: true)
 *   4. batches >= maxBatches   -> stop (exhausted: true)
 */
export async function runHealToCompletion(
  runBatch: HealBatchRunner,
  entityId: string,
  opts: HealLoopOptions = {},
): Promise<HealStepSummary> {
  const maxBatches = Math.max(1, opts.maxBatches ?? HEAL_LOOP_MAX_BATCHES);
  const shouldContinue = opts.shouldContinue ?? (() => true);

  const summary: HealStepSummary = {
    batches: 0,
    scanned: 0,
    downgraded: 0,
    deleted: 0,
    newFactsCreated: 0,
    skipped: 0,
    degraded: 0,
    exhausted: false,
    noProgress: false,
    aborted: false,
    remaining: 0,
  };

  let previousRemaining: number | null = null;

  while (summary.batches < maxBatches) {
    const result = await runBatch(entityId);
    summary.batches += 1;
    summary.scanned += result.scanned;
    summary.downgraded += result.downgraded;
    summary.deleted += result.deleted;
    summary.newFactsCreated += result.newFactsCreated;
    summary.skipped += result.skipped.length;
    summary.degraded += result.degraded.length;
    summary.remaining = result.remaining;

    if (result.remaining === 0) {
      return summary;
    }
    if (!shouldContinue()) {
      summary.aborted = true;
      console.warn(
        `[healLoop] heal interrupted after ${summary.batches} batch(es): ` +
          `${summary.skipped} skipped, ${summary.degraded} degraded, ` +
          `${summary.remaining} candidate(s) left for the next Night Shift`,
      );
      return summary;
    }
    if (previousRemaining !== null && result.remaining >= previousRemaining) {
      summary.noProgress = true;
      console.warn(
        `[healLoop] heal made no progress (remaining ${previousRemaining} -> ` +
          `${result.remaining}) after ${summary.batches} batch(es); stopping`,
      );
      return summary;
    }
    previousRemaining = result.remaining;
  }

  summary.exhausted = true;
  console.warn(
    `[healLoop] heal hit the ${maxBatches}-batch cap with ` +
      `${summary.remaining} candidate(s) still eligible; ` +
      'the rest will be picked up by the next Night Shift',
  );
  return summary;
}
