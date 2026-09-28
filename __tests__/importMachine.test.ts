import { createActor, waitFor } from 'xstate';
import { importMachine, type ImportApi, type PreparedImport } from '@/machines/importMachine';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeApi(overrides: Partial<ImportApi> = {}) {
  const cleanup = jest.fn();
  const prepared: PreparedImport = { dump: { generatedAt: 0, entities: {} } as never, noteCount: 3, cleanup };
  const api: ImportApi = {
    pick: jest.fn(async () => ({ uri: 'file:///a.zip' })),
    prepare: jest.fn(async (_uri, onPhase) => {
      onPhase('extracting');
      onPhase('reading');
      return prepared;
    }),
    importDump: jest.fn(async (_dump, onProgress) => {
      onProgress({ factsDone: 3, factsTotal: 3 });
      return { completed: true };
    }),
    finalize: jest.fn(async () => undefined),
    ...overrides,
  };
  return { api, cleanup };
}

describe('importMachine', () => {
  it('picks, prepares, imports, finalizes, and cleans up temp files', async () => {
    const { api, cleanup } = fakeApi();
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches('done'));
    expect(api.finalize).toHaveBeenCalled();
    expect(actor.getSnapshot().context.progress).toEqual({ factsDone: 3, factsTotal: 3 });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('returns to idle when the picker is cancelled', async () => {
    const { api } = fakeApi({ pick: jest.fn(async () => null) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it('shows the import count as soon as the bundle is parsed', async () => {
    const gate = deferred<{ completed: boolean }>();
    const { api } = fakeApi({ importDump: jest.fn(() => gate.promise) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches({ working: { importing: 'active' } }));
    expect(actor.getSnapshot().context.progress).toEqual({ factsDone: 0, factsTotal: 3 });
    gate.resolve({ completed: true });
  });

  it('cancel waits for the in-flight chunk, then goes idle without finalizing', async () => {
    let signal: AbortSignal | undefined;
    const gate = deferred<{ completed: boolean }>();
    const { api, cleanup } = fakeApi({
      importDump: jest.fn((_d, _p, c: AbortController) => {
        signal = c.signal;
        return gate.promise;
      }),
    });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches({ working: { importing: 'active' } }));
    actor.send({ type: 'CANCEL' });
    // Handshake: still importing (invoke alive) while the chunk settles.
    expect(actor.getSnapshot().matches({ working: { importing: 'cancelling' } })).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();
    gate.resolve({ completed: false });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(cleanup).toHaveBeenCalledTimes(1);
    // setTimeout(0), not Promise.resolve(): the finalize-guard assertion must
    // run after the import actor's .then handlers, not just microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect(api.finalize).not.toHaveBeenCalled();
  });

  it('leaving the screen mid-import aborts at the chunk boundary and cleans up', async () => {
    let signal: AbortSignal | undefined;
    const gate = deferred<{ completed: boolean }>();
    const { api, cleanup } = fakeApi({
      importDump: jest.fn((_d, _p, c: AbortController) => {
        signal = c.signal;
        return gate.promise;
      }),
    });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches({ working: { importing: 'active' } }));
    actor.stop(); // unmount
    expect(signal?.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    gate.resolve({ completed: false }); // settles after teardown; must not corrupt anything
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a failed import shows the error, cleans up, and can pick again', async () => {
    const { api, cleanup } = fakeApi({ importDump: jest.fn(async () => Promise.reject(new Error('disk full'))) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches('failed'));
    expect(actor.getSnapshot().context.error).toBe('disk full');
    expect(cleanup).toHaveBeenCalledTimes(1);
    actor.send({ type: 'PICK' });
    expect(actor.getSnapshot().matches('picking')).toBe(true);
  });

  it('a prepare failure (bad zip) lands in failed', async () => {
    const { api } = fakeApi({ prepare: jest.fn(async () => Promise.reject(new Error('Could not open ZIP file'))) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches('failed'));
    expect(actor.getSnapshot().context.error).toBe('Could not open ZIP file');
  });

  it('cancel during finalizing is ignored (the manifest write cannot be cancelled)', async () => {
    const gate = deferred<void>();
    const { api } = fakeApi({ finalize: jest.fn(() => gate.promise) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches({ working: 'finalizing' }));
    actor.send({ type: 'CANCEL' });
    expect(actor.getSnapshot().matches({ working: 'finalizing' })).toBe(true);
    gate.resolve();
    await waitFor(actor, (s) => s.matches('done'));
  });

  it('cancelling while preparing still cleans up what prepare created', async () => {
    const gate = deferred<PreparedImport>();
    const { api, cleanup } = fakeApi({ prepare: jest.fn(() => gate.promise) });
    const actor = createActor(importMachine, { input: { api } }).start();
    actor.send({ type: 'PICK' });
    await waitFor(actor, (s) => s.matches({ working: 'preparing' }));
    actor.send({ type: 'CANCEL' });
    gate.resolve({ dump: {} as never, noteCount: 1, cleanup });
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
  });
});
