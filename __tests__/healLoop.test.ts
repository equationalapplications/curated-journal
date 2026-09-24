import { runHealToCompletion, type HealStepSummary } from '@/lib/healLoop';
import type { HealResult } from '@equationalapplications/core-llm-wiki';

function makeHealResult(overrides: Partial<HealResult> = {}): HealResult {
  return {
    scanned: 1,
    downgraded: 0,
    deleted: 0,
    newFactsCreated: 0,
    skipped: [],
    degraded: [],
    remaining: 0,
    deferred: 0,
    ...overrides,
  } as HealResult;
}

describe('runHealToCompletion', () => {
  it('drains remaining to 0 and accumulates counts', async () => {
    const results = [
      makeHealResult({ remaining: 2, skipped: [{ id: 'a', reason: 'non_convergent' }], degraded: [{ id: 'd1', originalBodyChars: 100, truncatedBodyChars: 50 }], scanned: 5, downgraded: 1, deleted: 1, newFactsCreated: 2 }),
      makeHealResult({ remaining: 1 }),
      makeHealResult({ remaining: 0 }),
    ];
    const runBatch = jest.fn(async () => results.shift()!);
    const summary = await runHealToCompletion(runBatch, 'e1');

    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(summary.batches).toBe(3);
    expect(summary.scanned).toBe(7);
    expect(summary.skipped).toBe(1);
    expect(summary.degraded).toBe(1);
    expect(summary.downgraded).toBe(1);
    expect(summary.deleted).toBe(1);
    expect(summary.newFactsCreated).toBe(2);
    expect(summary.remaining).toBe(0);
    expect(summary.exhausted).toBe(false);
    expect(summary.noProgress).toBe(false);
    expect(summary.aborted).toBe(false);
  });

  it('stops after the current batch when shouldContinue returns false', async () => {
    const runBatch = jest.fn(async () => makeHealResult({ remaining: 5 }));
    const summary = await runHealToCompletion(runBatch, 'e1', {
      shouldContinue: () => false,
    });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(summary.batches).toBe(1);
    expect(summary.aborted).toBe(true);
    expect(summary.exhausted).toBe(false);
    expect(summary.remaining).toBe(5);
  });

  it('stops with noProgress when remaining stops shrinking', async () => {
    let call = 0;
    const runBatch = jest.fn(async () => {
      call += 1;
      return makeHealResult({ remaining: call === 1 ? 4 : 4 });
    });
    const summary = await runHealToCompletion(runBatch, 'e1');

    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(summary.noProgress).toBe(true);
    expect(summary.exhausted).toBe(false);
  });

  it('stops at the cap with exhausted: true', async () => {
    let remaining = 6;
    const runBatch = jest.fn(async () => {
      remaining -= 1;
      return makeHealResult({ remaining });
    });
    const summary = await runHealToCompletion(runBatch, 'e1', { maxBatches: 3 });

    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(summary.batches).toBe(3);
    expect(summary.exhausted).toBe(true);
    expect(summary.remaining).toBe(3);
  });

  it('clamps maxBatches below 1 to a single batch', async () => {
    const runBatch = jest.fn(async () => makeHealResult({ remaining: 5 }));
    const summary = await runHealToCompletion(runBatch, 'e1', { maxBatches: 0 });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(summary.exhausted).toBe(true);
  });

  it('reports a clean finish when the cap-limited final batch returns remaining 0', async () => {
    const runBatch = jest.fn(async () => makeHealResult({ remaining: 0 }));
    const summary = await runHealToCompletion(runBatch, 'e1', { maxBatches: 3 });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(summary.exhausted).toBe(false);
    expect(summary.remaining).toBe(0);
  });

  it('does not consult shouldContinue before the first batch', async () => {
    const runBatch = jest.fn(async () => makeHealResult({ remaining: 0 }));
    const shouldContinue = jest.fn(() => false);
    const summary: HealStepSummary = await runHealToCompletion(runBatch, 'e1', {
      shouldContinue,
    });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(shouldContinue).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(0);
  });
});
