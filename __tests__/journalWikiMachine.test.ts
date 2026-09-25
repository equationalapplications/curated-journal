import { createActor, waitFor } from 'xstate';
import { WikiBusyError } from '@equationalapplications/expo-llm-wiki';
import type { HealResult } from '@equationalapplications/core-llm-wiki';
import { journalWikiMachine } from '@/machines/journalWikiMachine';

const makeWiki = () => ({
  importDump: jest.fn(async () => undefined),
  exportDump: jest.fn(async () => ({ version: 1, entities: {} })),
});

const makeHealResult = (overrides: Partial<HealResult> = {}): HealResult => ({
  scanned: 0,
  downgraded: 0,
  deleted: 0,
  newFactsCreated: 0,
  skipped: [],
  degraded: [],
  remaining: 0,
  deferred: 0,
  ...overrides,
});

const maintenance = {
  runLibrarian: jest.fn(async () => undefined),
  runHeal: jest.fn(async (): Promise<HealResult> => makeHealResult()),
  runReembed: jest.fn(async () => undefined),
  runPrune: jest.fn(async () => undefined),
};

describe('journalWikiMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    maintenance.runHeal.mockImplementation(async () => makeHealResult());
  });

  it('runs night shift queue sequentially', async () => {
    const order: string[] = [];
    maintenance.runLibrarian.mockImplementation(async () => {
      order.push('librarian');
    });
    maintenance.runHeal.mockImplementation(async () => {
      order.push('heal');
      return makeHealResult();
    });
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [
        { operation: 'librarian', entityId: 'e1' },
        { operation: 'heal', entityId: 'e1' },
      ],
    });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(order).toEqual(['librarian', 'heal']);
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');
    actor.stop();
  });

  it('drains a heal item across multiple batches', async () => {
    const remainingSequence = [2, 1, 0];
    maintenance.runHeal.mockImplementation(async () =>
      makeHealResult({ remaining: remainingSequence.shift() ?? 0 }),
    );
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'heal', entityId: 'e1' }],
    });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(maintenance.runHeal).toHaveBeenCalledTimes(3);
    actor.stop();
  });

  it('aborts night shift after current step', async () => {
    let healStarted = false;
    maintenance.runLibrarian.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    maintenance.runHeal.mockImplementation(async () => {
      healStarted = true;
      return makeHealResult();
    });
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [
        { operation: 'librarian', entityId: 'e1' },
        { operation: 'heal', entityId: 'e1' },
      ],
    });
    actor.send({ type: 'ABORT_NIGHT_SHIFT' });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(healStarted).toBe(false);
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('aborted');
    actor.stop();
  });

  it('stops the heal loop between batches when ABORT_NIGHT_SHIFT is sent mid-heal', async () => {
    let actorRef: ReturnType<typeof createActor<typeof journalWikiMachine>> | null = null;
    maintenance.runHeal.mockImplementation(async () => {
      actorRef?.send({ type: 'ABORT_NIGHT_SHIFT' });
      return makeHealResult({ remaining: 7 });
    });
    actorRef = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actorRef.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'heal', entityId: 'e1' }],
    });
    await waitFor(actorRef, (s) => s.matches('idle'), { timeout: 5000 });
    expect(maintenance.runHeal).toHaveBeenCalledTimes(1);
    expect(actorRef.getSnapshot().context.nightShiftOutcome).toBe('aborted');
    actorRef.stop();
  });

  it('stops the heal loop and clears night-shift state when an IMPORT interrupts mid-heal', async () => {
    let resolveFirstBatch: (result: HealResult) => void = () => {};
    const firstBatch = new Promise<HealResult>((resolve) => {
      resolveFirstBatch = resolve;
    });
    maintenance.runHeal.mockImplementationOnce(() => firstBatch);
    const wiki = makeWiki();
    const actor = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'heal', entityId: 'e1' }],
    });
    await waitFor(actor, (s) => s.context.queue.length > 0, { timeout: 5000 });
    actor.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    resolveFirstBatch(makeHealResult({ remaining: 4 }));
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    // The interrupted loop must not run further batches.
    expect(maintenance.runHeal).toHaveBeenCalledTimes(1);
    // The import completed through busyRetry.
    expect(wiki.importDump).toHaveBeenCalledTimes(1);
    // Night-shift state is cleared so later imports do not detour through busyRetry.
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.queue.length).toBe(0);
    expect(snapshot.context.pendingImport).toBeNull();
    // An import-interrupted run is neither completed nor user-aborted.
    expect(snapshot.context.nightShiftOutcome).toBe('none');
    const secondImport = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    secondImport.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    expect(secondImport.getSnapshot().matches('importing')).toBe(true);
    secondImport.stop();
    actor.stop();
  });

  it('stores the heal summary in context and resets it on the next START_NIGHT_SHIFT', async () => {
    const remainingSequence = [1, 0];
    maintenance.runHeal.mockImplementation(async () =>
      makeHealResult({
        remaining: remainingSequence.shift() ?? 0,
        skipped: [{ id: 'a', reason: 'non_convergent' }],
        degraded: [{ id: 'd', originalBodyChars: 10, truncatedBodyChars: 5 }],
      }),
    );
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'heal', entityId: 'e1' }],
    });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    const summary = actor.getSnapshot().context.lastHealSummary;
    expect(summary).not.toBeNull();
    expect(summary?.batches).toBe(2);
    // Both batches report the same skipped/degraded entry; the summary accumulates.
    expect(summary?.skipped).toBe(2);
    expect(summary?.degraded).toBe(2);
    expect(summary?.exhausted).toBe(false);
    expect(summary?.aborted).toBe(false);

    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'librarian', entityId: 'e1' }],
    });
    expect(actor.getSnapshot().context.lastHealSummary).toBeNull();
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    actor.stop();
  });

  it('resets the outcome when a new night shift starts after one completes', async () => {
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    const queue = [{ operation: 'librarian' as const, entityId: 'e1' }];
    actor.send({ type: 'START_NIGHT_SHIFT', queue });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');

    actor.send({ type: 'START_NIGHT_SHIFT', queue });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('none');
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');
    actor.stop();
  });

  it('queues import while night shift is active', async () => {
    maintenance.runLibrarian.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const wiki = makeWiki();
    const actor = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    actor.send({
      type: 'START_NIGHT_SHIFT',
      queue: [{ operation: 'librarian', entityId: 'e1' }],
    });
    actor.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    expect(actor.getSnapshot().matches('busyRetry')).toBe(true);
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    actor.stop();
  });

  it('retries import on WikiBusyError', async () => {
    const wiki = makeWiki();
    wiki.importDump
      .mockRejectedValueOnce(new WikiBusyError('import', 'e1'))
      .mockResolvedValueOnce(undefined);
    const actor = createActor(journalWikiMachine, {
      input: { wiki: wiki as never, maintenance },
    }).start();
    actor.send({ type: 'IMPORT', dump: { version: 1, entities: {} }, merge: true });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 3000 });
    expect(wiki.importDump).toHaveBeenCalledTimes(2);
    actor.stop();
  });
});
