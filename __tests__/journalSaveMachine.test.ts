import { createActor } from 'xstate';
import {
  journalSaveMachine,
  type JournalSaveMachineInput,
} from '@/machines/journalSaveMachine';

function makeInput(overrides?: Partial<JournalSaveMachineInput>): JournalSaveMachineInput {
  return {
    entityId: 'e1',
    ingest: jest.fn(async () => ({
      truncated: false,
      chunks: 1,
      ingestedChunks: 1,
      failedChunks: 0,
    })),
    saveTimeoutMs: 5_000,
    ...overrides,
  };
}

describe('journalSaveMachine', () => {
  it('idle -> hashing -> ingesting -> saved on success', async () => {
    const actor = createActor(journalSaveMachine, {
      input: makeInput(),
    });
    actor.start();

    actor.send({ type: 'START_SAVE', title: 'T', body: 'B' });
    expect(actor.getSnapshot().value).toBe('hashing');

    await new Promise((r) => setTimeout(r, 0));
    // With an instantly-resolving mock the machine may pass through
    // 'ingesting' and settle at 'saved' within the same macrotask.
    expect(['ingesting', 'saved']).toContain(actor.getSnapshot().value);

    await new Promise((r) => setTimeout(r, 10));
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('saved');
    expect(snap.context.lastResult).toEqual({
      truncated: false,
      chunks: 1,
      ingestedChunks: 1,
      failedChunks: 0,
    });
  });

  it('moves to failed with lastError when ingest rejects', async () => {
    const boom = new Error('ingest exploded');
    const actor = createActor(journalSaveMachine, {
      input: makeInput({ ingest: jest.fn(async () => Promise.reject(boom)) }),
    });
    actor.start();

    actor.send({ type: 'START_SAVE', title: 'T', body: 'B' });
    await new Promise((r) => setTimeout(r, 20));

    const snap = actor.getSnapshot();
    expect(snap.value).toBe('failed');
    expect(snap.context.lastError).toBe(boom);
  });

  it('RETRY from failed re-runs the ingest with the saved input', async () => {
    const ingest = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce({
        truncated: false,
        chunks: 1,
        ingestedChunks: 1,
        failedChunks: 0,
      });
    const actor = createActor(journalSaveMachine, {
      input: makeInput({ ingest: ingest as never }),
    });
    actor.start();

    actor.send({ type: 'START_SAVE', title: 'T', body: 'B' });
    await new Promise((r) => setTimeout(r, 20));
    expect(actor.getSnapshot().value).toBe('failed');

    actor.send({ type: 'RETRY' });
    await new Promise((r) => setTimeout(r, 20));
    expect(actor.getSnapshot().value).toBe('saved');
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('times out a hung ingest into failed after saveTimeoutMs', async () => {
    jest.useFakeTimers();
    try {
      const actor = createActor(journalSaveMachine, {
        input: makeInput({
          ingest: jest.fn(async () => new Promise<never>(() => {})),
          saveTimeoutMs: 1_000,
        }),
      });
      actor.start();

      actor.send({ type: 'START_SAVE', title: 'T', body: 'B' });
      await jest.advanceTimersByTimeAsync(50);
      expect(actor.getSnapshot().value).toBe('ingesting');

      await jest.advanceTimersByTimeAsync(1_100);
      const snap = actor.getSnapshot();
      expect(snap.value).toBe('failed');
      expect(snap.context.lastError?.message).toMatch(/timed out/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it('DISMISS from failed returns to idle', async () => {
    const actor = createActor(journalSaveMachine, {
      input: makeInput({ ingest: jest.fn(async () => Promise.reject(new Error('x'))) }),
    });
    actor.start();

    actor.send({ type: 'START_SAVE', title: 'T', body: 'B' });
    await new Promise((r) => setTimeout(r, 20));
    expect(actor.getSnapshot().value).toBe('failed');

    actor.send({ type: 'DISMISS' });
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('a new START_SAVE from saved restarts the flow', async () => {
    const actor = createActor(journalSaveMachine, { input: makeInput() });
    actor.start();

    actor.send({ type: 'START_SAVE', title: 'A', body: 'one' });
    await new Promise((r) => setTimeout(r, 20));
    expect(actor.getSnapshot().value).toBe('saved');

    actor.send({ type: 'START_SAVE', title: 'B', body: 'two' });
    expect(actor.getSnapshot().value).toBe('hashing');
  });
});
