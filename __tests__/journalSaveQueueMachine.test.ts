import { createActor } from 'xstate';
import {
  journalSaveQueueMachine,
  type JournalSaveQueueInput,
} from '@/machines/journalSaveQueueMachine';
import type { IngestResult } from '@/lib/ingestReport';

const clean: IngestResult = { truncated: false, chunks: 1, ingestedChunks: 1, failedChunks: 0 };

/** A controllable ingest: each call parks until the test resolves or rejects it. */
function deferredIngest() {
  const calls: {
    documentChunk: string;
    resolve: (r: IngestResult) => void;
    reject: (e: Error) => void;
  }[] = [];
  const ingest: JournalSaveQueueInput['ingest'] = jest.fn(
    (_entityId, params) =>
      new Promise<IngestResult>((resolve, reject) => {
        calls.push({ documentChunk: params.documentChunk, resolve, reject });
      }),
  );
  return { ingest, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const actors: { stop: () => void }[] = [];
afterEach(() => {
  actors.splice(0).forEach((a) => a.stop());
});

function start(ingest: JournalSaveQueueInput['ingest'], saveTimeoutMs = 5_000) {
  const actor = createActor(journalSaveQueueMachine, {
    input: { entityId: 'e1', ingest, saveTimeoutMs },
  });
  actor.start();
  actors.push(actor);
  return actor;
}

const statuses = (actor: ReturnType<typeof start>) =>
  actor.getSnapshot().context.entries.map((e) => `${e.title}:${e.status}`);

describe('journalSaveQueueMachine', () => {
  it('saves one entry and removes it from the queue (R1)', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: 'one' });
    expect(statuses(actor)).toEqual(['A:saving']);

    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].documentChunk).toBe('# A\n\none');

    calls[0].resolve(clean);
    await flush();
    expect(statuses(actor)).toEqual([]);
    expect(actor.getSnapshot().context.savedCount).toBe(1);
    expect(actor.getSnapshot().context.warnings).toEqual([]);
  });

  it('queues entries added mid-save and runs them in order, one at a time (R2)', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    await flush();
    actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
    actor.send({ type: 'ENQUEUE', title: 'C', body: '3' });
    expect(statuses(actor)).toEqual(['A:saving', 'B:queued', 'C:queued']);
    expect(calls).toHaveLength(1);

    calls[0].resolve(clean);
    await flush();
    await flush();
    expect(statuses(actor)).toEqual(['B:saving', 'C:queued']);
    expect(calls).toHaveLength(2);
    expect(calls[1].documentChunk).toBe('# B\n\n2');

    calls[1].resolve(clean);
    await flush();
    await flush();
    calls[2].resolve(clean);
    await flush();
    expect(statuses(actor)).toEqual([]);
    expect(actor.getSnapshot().context.savedCount).toBe(3);
  });

  it('keeps a failed entry with its text and error, and continues the queue (R4)', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
    await flush();
    calls[0].reject(new Error('boom'));
    await flush();
    await flush();

    const [a, b] = actor.getSnapshot().context.entries;
    expect(a).toMatchObject({ title: 'A', body: '1', status: 'failed' });
    expect(a.error?.message).toBe('boom');
    expect(b.status).toBe('saving');
  });

  it('RETRY re-queues a failed entry at the back; DISCARD removes it (R4)', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
    await flush();
    calls[0].reject(new Error('boom'));
    await flush();
    await flush();
    const failedId = actor.getSnapshot().context.entries[0].id;

    actor.send({ type: 'RETRY', id: failedId });
    expect(statuses(actor)).toEqual(['B:saving', 'A:queued']);

    calls[1].resolve(clean);
    await flush();
    await flush();
    expect(statuses(actor)).toEqual(['A:saving']);
    expect(calls[2].documentChunk).toBe('# A\n\n1');

    calls[2].reject(new Error('again'));
    await flush();
    actor.send({ type: 'DISCARD', id: failedId });
    expect(statuses(actor)).toEqual([]);
  });

  it('RETRY from idle restarts the queue', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    await flush();
    calls[0].reject(new Error('boom'));
    await flush();
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'RETRY', id: actor.getSnapshot().context.entries[0].id });
    expect(statuses(actor)).toEqual(['A:saving']);
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('records a warning for a save with chunk failures until acknowledged (R6)', async () => {
    const { ingest, calls } = deferredIngest();
    const actor = start(ingest);

    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    await flush();
    calls[0].resolve({ ...clean, chunks: 2, ingestedChunks: 1, failedChunks: 1 });
    await flush();

    const { warnings, entries } = actor.getSnapshot().context;
    expect(entries).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].failures).toBe(1);

    actor.send({ type: 'ACK_WARNING', id: warnings[0].id });
    expect(actor.getSnapshot().context.warnings).toEqual([]);
  });

  it('on timeout cancels the generations, waits for the ingest, then fails the entry (R10)', async () => {
    jest.useFakeTimers();
    try {
      const { ingest, calls } = deferredIngest();
      const cancel = jest.fn(() => calls[0].reject(new Error('LLM generation cancelled')));
      const actor = createActor(journalSaveQueueMachine, {
        input: { entityId: 'e1', ingest, saveTimeoutMs: 1_000, openGenerationScope: () => ({ cancel, close: jest.fn() }) },
      });
      actor.start();
      actors.push(actor);
      actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
      actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
      await jest.advanceTimersByTimeAsync(1_100);

      expect(cancel).toHaveBeenCalledTimes(1);
      const [a] = actor.getSnapshot().context.entries;
      expect(a.status).toBe('failed');
      expect(a.error?.message).toMatch(/timed out/i);
      expect(statuses(actor)).toEqual(['A:failed', 'B:saving']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a timed-out entry saving until its ingest settles, so the queue never overlaps it', async () => {
    jest.useFakeTimers();
    try {
      const { ingest, calls } = deferredIngest();
      const cancel = jest.fn();
      const actor = createActor(journalSaveQueueMachine, {
        input: { entityId: 'e1', ingest, saveTimeoutMs: 1_000, openGenerationScope: () => ({ cancel, close: jest.fn() }) },
      });
      actor.start();
      actors.push(actor);
      actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
      actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
      await jest.advanceTimersByTimeAsync(1_100);

      // Cancelled, but the ingest has not settled: A cannot be discarded yet
      // and B has not started.
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(statuses(actor)).toEqual(['A:saving', 'B:queued']);
      actor.send({ type: 'DISCARD', id: actor.getSnapshot().context.entries[0].id });
      expect(statuses(actor)).toEqual(['A:saving', 'B:queued']);
      expect(calls).toHaveLength(1);

      // The ingest finished its write anyway: the note is saved, not failed.
      calls[0].resolve(clean);
      await jest.advanceTimersByTimeAsync(0);
      expect(statuses(actor)).toEqual(['B:saving']);
      expect(actor.getSnapshot().context.savedCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails a timed-out save that resolved with chunk failures, keeping its text', async () => {
    jest.useFakeTimers();
    try {
      const { ingest, calls } = deferredIngest();
      const actor = createActor(journalSaveQueueMachine, {
        input: {
          entityId: 'e1',
          ingest,
          saveTimeoutMs: 1_000,
          openGenerationScope: () => ({ cancel: jest.fn(), close: jest.fn() }),
        },
      });
      actor.start();
      actors.push(actor);
      actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
      await jest.advanceTimersByTimeAsync(1_100);
      calls[0].resolve({ ...clean, chunks: 2, ingestedChunks: 1, failedChunks: 1 });
      await jest.advanceTimersByTimeAsync(0);
      const [a] = actor.getSnapshot().context.entries;
      expect(a.status).toBe('failed');
      expect(a.body).toBe('1');
      expect(a.error?.message).toMatch(/timed out/i);
      expect(actor.getSnapshot().context.savedCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails the entry after the grace period when the cancelled ingest never settles', async () => {
    jest.useFakeTimers();
    try {
      const close = jest.fn();
      const actor = createActor(journalSaveQueueMachine, {
        input: {
          entityId: 'e1',
          ingest: jest.fn(() => new Promise<never>(() => {})),
          saveTimeoutMs: 1_000,
          cancelGraceMs: 500,
          openGenerationScope: () => ({ cancel: jest.fn(), close }),
        },
      });
      actor.start();
      actors.push(actor);
      actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
      actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
      await jest.advanceTimersByTimeAsync(1_100);
      expect(statuses(actor)).toEqual(['A:saving', 'B:queued']);
      await jest.advanceTimersByTimeAsync(500);
      expect(statuses(actor)).toEqual(['A:failed', 'B:saving']);
      // The hung ingest never settled, so its scope stays open and cancelling.
      expect(close).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens a fresh generation scope per save and never cancels one that finished in time', async () => {
    const { ingest, calls } = deferredIngest();
    const cancel = jest.fn();
    const close = jest.fn();
    const openGenerationScope = jest.fn(() => ({ cancel, close }));
    const actor = createActor(journalSaveQueueMachine, {
      input: { entityId: 'e1', ingest, saveTimeoutMs: 5_000, openGenerationScope },
    });
    actor.start();
    actors.push(actor);
    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    actor.send({ type: 'ENQUEUE', title: 'B', body: '2' });
    await flush();
    calls[0].resolve(clean);
    await flush();
    await flush();
    calls[1].resolve(clean);
    await flush();
    expect(openGenerationScope).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('SET_ENGINE rebinds the ingest used by later saves', async () => {
    const first = deferredIngest();
    const second = deferredIngest();
    const actor = start(first.ingest);

    actor.send({ type: 'SET_ENGINE', entityId: 'e2', ingest: second.ingest });
    actor.send({ type: 'ENQUEUE', title: 'A', body: '1' });
    await flush();
    expect(first.calls).toHaveLength(0);
    expect(second.ingest).toHaveBeenCalledWith('e2', expect.anything());
  });
});
