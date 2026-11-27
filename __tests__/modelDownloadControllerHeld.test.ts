/** Round-3 regressions: joined held reports, the write-failure rowSaved, the relaxed join, and the unrequested pause-failed row. */
import {
  createModelDownloadController,
  type ControllerEvent,
  type StoreLike,
  type TransferDriver,
  WrongModelError,
} from '@/services/modelDownloadController';

jest.mock('@/services/modelDownloadService', () => ({ startDownload: jest.fn(), resumeDownload: jest.fn() }));

const A = 'fast-light' as const;
const P = { url: 'u', fileUri: 'f', isDirectory: false, resumeData: 'rd' };
const tick = async (n = 30) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

function mk(initialRow: { modelId: string | null; status: string; pauseState: typeof P | null } | null = null) {
  let state = 'active';
  let resolvePause!: () => void;
  let settle!: (v: unknown) => void;
  const task = {
    get state() {
      return state;
    },
    set state(v: string) {
      state = v;
    },
    pause: jest.fn(),
    pauseAsync: jest.fn(
      () =>
        new Promise<void>((r) => {
          resolvePause = () => {
            state = 'paused';
            r();
            settle(null);
          };
        }),
    ),
    cancel: jest.fn(() => {
      if (state === 'active') state = 'cancelled';
    }),
    release: jest.fn(),
    savable: jest.fn(() => P),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const writes: string[] = [];
  let block: Promise<void> | null = null;
  let unblock!: () => void;
  let failNext = false;
  let failPaused = false;
  const store: StoreLike = {
    get: async () => initialRow as never,
    set: async (r) => {
      if (block) await block;
      writes.push(`${r.status}:${r.pauseState ? 'P' : 'null'}`);
      if (failNext) {
        failNext = false;
        throw new Error('disk');
      }
      if (failPaused && r.status === 'paused') throw new Error('disk');
    },
    clear: async () => {
      if (block) await block;
      writes.push('clear');
    },
  };
  const driver: TransferDriver = {
    platform: 'android',
    start: () => ({ task: task as never, promise: new Promise((r) => (settle = r)), kind: 'started' }),
    resume: () => ({ task: task as never, promise: new Promise((r) => (settle = r)), kind: 'resumed' }),
    onAppState: (l) => {
      l('active');
      return () => undefined;
    },
  };
  const c = createModelDownloadController({
    driver,
    store,
    timers: { setTimeout: () => ({}), clearTimeout: () => undefined },
  });
  const events: ControllerEvent[] = [];
  c.subscribe((e) => events.push(e));
  return {
    c,
    task,
    writes,
    events,
    label: () => events.map((e) => e.type + ('reason' in e ? `:${e.reason}` : '')),
    resolvePause: () => resolvePause(),
    settle: (v: unknown) => settle(v),
    blockStore: () => {
      block = new Promise<void>((r) => (unblock = r));
    },
    unblockStore: () => {
      const u = unblock;
      block = null;
      u();
    },
    failNextWrite: () => {
      failNext = true;
    },
    failPausedWrites: () => {
      failPaused = true;
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('round 3', () => {
  it('NIT-1 a joined held report: unrequested stop settles first, then the strict stop reports kept with rowSaved true', async () => {
    const k = mk();
    k.failNextWrite();
    await k.c.start(A); // the downloading write fails: a pending write
    k.blockStore();
    const holding = k.c.readRow(); // holds the queue on the retry
    k.task.state = 'paused';
    k.settle(null);
    await tick(10); // the settle step is queued behind readRow
    const pausePromise = k.c.pause(A);
    const strict = k.c.stopForStrict(); // joins: the transfer is still live
    k.failPausedWrites();
    k.unblockStore();
    await holding;
    expect(await strict).toEqual({ kind: 'kept', pauseState: P, rowSaved: true });
    expect(await pausePromise).toMatchObject({ kind: 'paused', strict: true });
    expect(k.label().filter((l) => l.startsWith('stopped'))).toEqual(['stopped:unrequested', 'stopped:strict']);
  });

  it('NIT-2 a joined pause that writes paused reports that write: rowSaved false when it fails', async () => {
    const k = mk();
    await k.c.load();
    k.blockStore();
    const started = k.c.start(A);
    await tick(5);
    const abandoned = k.c.abandon();
    const pausePromise = k.c.pause(A);
    const strict = k.c.stopForStrict();
    k.unblockStore();
    await started;
    await abandoned;
    k.failNextWrite();
    const result = await strict;
    await pausePromise;
    expect(result).toMatchObject({ kind: 'kept', pauseState: null, rowSaved: false });
    expect(k.c.snapshot().rowSaved).toBe(false);
  });

  it('NIT-3 a strict stop arriving while start() is on its write joins the queued pause: kill-window write first, one stopped(strict)', async () => {
    const k = mk();
    await k.c.load();
    k.blockStore();
    const started = k.c.start(A);
    await tick(5);
    const pausePromise = k.c.pause(A);
    const strict = k.c.stopForStrict();
    k.unblockStore();
    await started;
    await tick(15);
    expect(k.task.pauseAsync).toHaveBeenCalledTimes(1);
    expect(k.writes).toEqual(['downloading:null', 'paused:null']); // the kill window precedes step 1
    k.resolvePause();
    expect(await strict).toMatchObject({ kind: 'kept', pauseState: P });
    expect(await pausePromise).toMatchObject({ kind: 'paused', strict: true });
    expect(k.label().filter((l) => l === 'stopped:strict')).toHaveLength(1);
    expect(k.writes).toEqual(['downloading:null', 'paused:null', 'paused:P']);
  });

  it('NIT-4 an unrequested null that ends in failPause leaves the row and phase paused with the kept pause state', async () => {
    for (const prep of [
      (t: ReturnType<typeof mk>) => (t.task.state = 'cancelled'),
      (t: ReturnType<typeof mk>) => {
        t.task.state = 'paused';
        t.task.savable.mockImplementation(() => {
          throw new Error('savable threw');
        });
      },
    ]) {
      const k = mk();
      await k.c.start(A);
      prep(k);
      k.settle(null);
      await tick(40);
      const snap = k.c.snapshot();
      expect(snap).toMatchObject({ phase: 'paused', error: null, row: { modelId: A, status: 'paused' } });
      expect(k.writes.at(-1)).toMatch(/^paused:/);
      expect(k.label()).toContain('stopped:unrequested');
      expect(k.label()).not.toContain('failed');
      // a layout restore from this snapshot is the paused branch, not a continuation
      expect(snap.row?.status).toBe('paused');
      expect((await k.c.pause(A)).kind).toBe('paused');
    }
  });
});

describe('round 4', () => {
  const stopped = (k: ReturnType<typeof mk>, reason: string) =>
    k.events.filter((e) => e.type === 'stopped' && e.reason === reason);

  it('MINOR-1 E2: a strict stop joined to a pause on phase none reports kept, and the record is paused', async () => {
    const k = mk({ modelId: A, status: 'paused', pauseState: P });
    await k.c.load();
    k.blockStore();
    const parked = k.c.park(A);
    await tick(5);
    const abandoned = k.c.abandon();
    const paused = k.c.pause(A);
    const strict = k.c.stopForStrict();
    k.unblockStore();
    await parked;
    await abandoned;
    expect(await paused).toMatchObject({ kind: 'paused', strict: true, pauseState: null });
    expect(await strict).toEqual({ kind: 'kept', pauseState: null, rowSaved: true });
    expect(stopped(k, 'strict')).toHaveLength(1);
    expect(k.c.snapshot()).toMatchObject({ phase: 'paused', stoppedForStrict: true });
    expect(await k.c.stopForStrict()).toEqual({ kind: 'kept', pauseState: null, rowSaved: true });
  });

  it('NIT-1 E3b: a joined pause that rejects runs the strict stop in its own turn, before ops queued after the stop', async () => {
    const k = mk({ modelId: A, status: 'paused', pauseState: P });
    await k.c.load();
    k.blockStore();
    const parked = k.c.park(A);
    await tick(5);
    const recorded = k.c.record('smart-small' as never, 'smoke-testing');
    const paused = k.c.pause(A);
    const strict = k.c.stopForStrict(); // joins (rec.modelId is still A)
    const released = k.c.releaseStrictStop(); // arrives after the stop
    const startedB = k.c.start('smart-small' as never); // arrives after the release
    k.unblockStore();
    await parked;
    await recorded;
    await expect(paused).rejects.toBeInstanceOf(WrongModelError);
    expect(await strict).toEqual({ kind: 'nothing-running', rowSaved: true });
    await released;
    expect(await startedB).toMatchObject({ kind: 'started' }); // the strict stop did not run after the release
    expect(k.task.pauseAsync).not.toHaveBeenCalled();
    expect(stopped(k, 'strict')).toHaveLength(1);
  });
});
