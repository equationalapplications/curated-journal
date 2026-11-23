import { DownloadTask } from '../node_modules/expo-file-system/build/NetworkTasks';
import {
  createModelDownloadController,
  transferPlatform,
  TransferInFlightError,
  type ControllerEvent,
  type StoreLike,
  type TransferDriver,
  type TransferHandle,
  type ModelDownloadController,
} from '@/services/modelDownloadController';
import type { DownloadPauseStateRecord, ModelDownloadStatus } from '@/services/modelDownloadState';
import { world, flush, FakeNativeTask } from './helpers/fakeNativeDownload';

jest.mock('../node_modules/expo-file-system/build/ExpoFileSystem', () => ({
  __esModule: true,
  default: { FileSystemDownloadTask: require('./helpers/fakeNativeDownload').FakeNativeTask },
}));
jest.mock('../node_modules/expo-file-system/build/File', () => ({
  File: class {
    uri: string;
    size = 1000;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));
jest.mock('../node_modules/expo-file-system/build/Directory', () => ({ Directory: class {} }));
jest.mock('@/services/modelDownloadService', () => ({ startDownload: jest.fn(), resumeDownload: jest.fn() }));

const A = 'fast-light' as const;
const B = 'smart-small' as never;
const P: DownloadPauseStateRecord = { url: 'https://x/f.gguf', fileUri: 'file:///doc/f.gguf', isDirectory: false, resumeData: 'rd' };

// ------------------------------------------------------------ fixtures

function makeTimers() {
  let now = 0;
  const pending: Array<{ fn: () => void; at: number }> = [];
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const h = { fn, at: now + ms };
      pending.push(h);
      return h;
    },
    clearTimeout: (h: unknown) => {
      const i = pending.indexOf(h as (typeof pending)[number]);
      if (i >= 0) pending.splice(i, 1);
    },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = pending.filter((h) => h.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        pending.splice(pending.indexOf(due), 1);
        due.fn();
        await flush(30);
      }
      now = target;
      await flush(30);
    },
    count: () => pending.length,
  };
}

type Row = { modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null };

function makeStore(initial: Row | null = null) {
  let row: Row | null = initial;
  const writes: Array<{ status: string; pauseState: DownloadPauseStateRecord | null } | 'clear'> = [];
  const ctl = {
    failSets: 0,
    failGets: 0,
    hangGet: false,
    gateSet: null as Promise<void> | null,
    writes,
    current: () => row,
  };
  const store: StoreLike = {
    get: jest.fn(async () => {
      if (ctl.hangGet) return new Promise<Row | null>(() => undefined);
      if (ctl.failGets > 0) {
        ctl.failGets -= 1;
        throw new Error('read failed');
      }
      return row;
    }),
    set: jest.fn(async (r) => {
      if (ctl.gateSet) await ctl.gateSet;
      if (ctl.failSets > 0) {
        ctl.failSets -= 1;
        throw new Error('write failed');
      }
      writes.push({ status: r.status, pauseState: r.pauseState });
      row = { ...r };
    }),
    clear: jest.fn(async () => {
      writes.push('clear');
      row = null;
    }),
  };
  return { store, ctl };
}

function makeDriver(platform: 'ios' | 'android' = 'android', initialApp = 'active') {
  const created: DownloadTask[] = [];
  const kit = {
    appState: initialApp,
    appListener: null as null | ((s: string) => void),
    setApp(s: string) {
      kit.appState = s;
      kit.appListener?.(s);
    },
    created,
    native: () => world.instances as FakeNativeTask[],
  };
  const track = (t: DownloadTask, promise: Promise<unknown>, kind: 'started' | 'resumed'): TransferHandle => {
    created.push(t);
    return { task: t as never, promise, kind };
  };
  const driver: TransferDriver = {
    platform,
    start: (_id, { onProgress }) => {
      const t = new DownloadTask(P.url, { uri: P.fileUri } as never, { onProgress });
      return track(t, t.downloadAsync(), 'started');
    },
    resume: (_id, ps, { onProgress }) => {
      const t = DownloadTask.fromSavable(ps, { onProgress });
      return track(t, t.resumeAsync(), 'resumed');
    },
    onAppState: (l) => {
      kit.appListener = l;
      l(kit.appState);
      return () => undefined;
    },
  };
  return { driver, kit };
}

function setup(opts: { row?: Row | null; platform?: 'ios' | 'android'; gate?: never; app?: string } = {}) {
  const timers = makeTimers();
  const { store, ctl } = makeStore(opts.row ?? null);
  const { driver, kit } = makeDriver(opts.platform, opts.app);
  const events: ControllerEvent[] = [];
  const controller = createModelDownloadController({ driver, store, timers, gate: opts.gate });
  controller.subscribe((e) => events.push(e));
  return { controller, store, ctl, timers, kit, events };
}

const native = () => world.instances[world.instances.length - 1];
const statuses = (c: ReturnType<typeof makeStore>['ctl']) => c.writes.map((w) => (w === 'clear' ? 'clear' : w.status));

beforeEach(() => {
  world.reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ------------------------------------------------------------ tests

describe('controller: queue and joins', () => {
  it('T-C1 a pause waits for start()`s pending downloading write', async () => {
    const t = setup();
    let release!: () => void;
    t.ctl.gateSet = new Promise<void>((r) => (release = r));
    const started = t.controller.start(A);
    const paused = t.controller.pause(A);
    await flush();
    expect(world.instances).toHaveLength(0);
    t.ctl.gateSet = null;
    release();
    await started;
    const result = await paused;
    expect(result.kind).toBe('paused');
    expect(statuses(t.ctl)).toEqual(['downloading', 'paused']);
    expect(native().pauseCalls).toBe(1);
  });

  it('T-C2 two pauses during one pause are the same promise, one pauseAsync and one write', async () => {
    const t = setup();
    await t.controller.start(A);
    const p1 = t.controller.pause(A);
    const p2 = t.controller.pause(A);
    expect(p2).toBe(p1);
    await p1;
    expect(native().pauseCalls).toBe(1);
    expect(statuses(t.ctl).filter((s) => s === 'paused')).toHaveLength(1);
  });

  it('T-C17 an abandon issued during a pause waits for it, then clears', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const paused = t.controller.pause(A);
    await flush();
    const abandoned = t.controller.abandon();
    await flush();
    expect(statuses(t.ctl)).toEqual(['downloading']);
    native().deliverPause();
    expect((await paused).kind).toBe('paused');
    await abandoned;
    expect(statuses(t.ctl)).toEqual(['downloading', 'paused', 'clear']);
    expect(t.controller.snapshot()).toMatchObject({ phase: 'none', modelId: null });
  });
});

describe('controller: pause outcomes', () => {
  it('T-C3 completion inside the pause is reported, savable never called, no paused write', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const savable = jest.spyOn(t.kit.created[0], 'savable');
    const paused = t.controller.pause(A);
    await flush();
    native().completeDuringPause();
    expect(await paused).toEqual({ kind: 'completed' });
    expect(savable).not.toHaveBeenCalled();
    expect(statuses(t.ctl)).toEqual(['downloading']);
    expect(t.controller.snapshot().phase).toBe('completed');
  });

  it('T-C4 a completion queued before the pause: completed with no pauseAsync', async () => {
    const t = setup();
    await t.controller.start(A);
    native().finish();
    await flush();
    expect(await t.controller.pause(A)).toEqual({ kind: 'completed' });
    expect(native().pauseCalls).toBe(0);
  });

  it('T-C5 a failed pause cancels the transfer and keeps the pause state', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    await t.controller.resume(A);
    world.config.rejectPause = true;
    const result = await t.controller.pause(A);
    expect(result).toMatchObject({ kind: 'pause-failed', pauseState: P });
    expect(native().cancelCalls).toBe(1);
    expect(t.controller.snapshot().phase).toBe('failed');
    t.events.length = 0;
    await flush();
    expect(t.events).toEqual([]);
  });

  it('T-C13 the pause watchdog cancels after 30 s and reports pause-failed', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.dropPauseBeforeProgress = true;
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(29_999);
    expect(native().cancelCalls).toBe(0);
    await t.timers.advance(2);
    expect(await paused).toMatchObject({ kind: 'pause-failed' });
    expect(native().cancelCalls).toBe(1);
  });

  it('T-C15 a lost pause is re-issued once progress shows the transfer still runs', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.dropPauseBeforeProgress = true;
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(600); // the 500 ms grace has passed: earlier events were stale
    native().emitProgress(10);
    await t.timers.advance(400);
    expect(await paused).toMatchObject({ kind: 'paused', pauseState: expect.objectContaining({ resumeData: 'rd' }) });
    expect(native().cancelCalls).toBe(0);
  });

  it('T-C15 a slow but effective first pause is never re-issued', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(5_000);
    expect(native().pauseCalls).toBe(1);
    native().deliverPause();
    expect(await paused).toMatchObject({ kind: 'paused', pauseState: expect.objectContaining({ resumeData: 'rd' }) });
  });

  it('pause with no resume data holds a null pause state', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.resumeData = undefined;
    expect(await t.controller.pause(A)).toMatchObject({ kind: 'paused', pauseState: null });
  });
});

describe('controller: watchdog counts foreground time only (T-C13b)', () => {
  function stubSetup() {
    const timers = makeTimers();
    const { store } = makeStore();
    let app: (s: string) => void = () => undefined;
    let current = 'active';
    const stub = {
      state: 'active' as string,
      settlePause: null as null | (() => void),
      cancel: jest.fn(),
      release: jest.fn(),
      pause: jest.fn(),
      savable: jest.fn(() => P),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      pauseAsync: jest.fn(() => new Promise<void>((r) => (stub.settlePause = r))),
    };
    const driver: TransferDriver = {
      platform: 'android',
      start: () => ({ task: stub as never, promise: new Promise(() => undefined), kind: 'started' }),
      resume: () => ({ task: stub as never, promise: new Promise(() => undefined), kind: 'resumed' }),
      onAppState: (l) => {
        app = l;
        l(current);
        return () => undefined;
      },
    };
    const controller = createModelDownloadController({ driver, store, timers });
    return { controller, timers, stub, setApp: (s: string) => ((current = s), app(s)) };
  }

  it('cases 1 and 2: a backgrounded wait re-arms with the full window', async () => {
    const t = stubSetup();
    await t.controller.start(A);
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(20_000);
    t.setApp('background');
    await t.timers.advance(120_000);
    expect(t.stub.cancel).not.toHaveBeenCalled();
    t.setApp('active');
    await t.timers.advance(29_000);
    expect(t.stub.cancel).not.toHaveBeenCalled();
    t.stub.state = 'paused';
    t.stub.settlePause?.();
    expect(await paused).toMatchObject({ kind: 'paused' });
    expect(t.stub.cancel).not.toHaveBeenCalled();
  });

  it('case 2: never settling after the return cancels after the full foreground window', async () => {
    const t = stubSetup();
    await t.controller.start(A);
    const paused = t.controller.pause(A);
    await flush();
    t.setApp('background');
    await t.timers.advance(100_000);
    t.setApp('active');
    await t.timers.advance(30_001);
    expect(await paused).toMatchObject({ kind: 'pause-failed' });
    expect(t.stub.cancel).toHaveBeenCalledTimes(1);
  });

  it('case 4: a paused task whose pauseAsync never settles takes the paused branch, never cancelled', async () => {
    const t = stubSetup();
    await t.controller.start(A);
    const paused = t.controller.pause(A);
    await flush();
    t.stub.state = 'paused';
    await t.timers.advance(30_001);
    expect(await paused).toMatchObject({ kind: 'paused', pauseState: P });
    expect(t.stub.cancel).not.toHaveBeenCalled();
  });

  it('case 3 and 5: a pause that starts backgrounded begins suspended; inactive counts as foreground', async () => {
    const t = stubSetup();
    await t.controller.start(A);
    t.setApp('background');
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(100_000);
    expect(t.stub.cancel).not.toHaveBeenCalled();
    t.setApp('inactive');
    await t.timers.advance(30_001);
    expect(await paused).toMatchObject({ kind: 'pause-failed' });
  });
});

describe('controller: abandon, one transfer, settlement', () => {
  it('T-C6 a cancel that never settles does not block abandon or a later start', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.neverSettleOnCancel = true;
    await t.controller.abandon();
    expect((await t.controller.start(A)).kind).toBe('started');
    expect(world.instances).toHaveLength(2);
  });

  it('T-C7 one transfer: a second start attaches, another model is rejected', async () => {
    const t = setup();
    expect((await t.controller.start(A)).kind).toBe('started');
    expect((await t.controller.start(A)).kind).toBe('attached');
    expect(world.instances).toHaveLength(1);
    await expect(t.controller.start(B)).rejects.toBeInstanceOf(TransferInFlightError);
    expect(world.instances).toHaveLength(1);
  });

  it('T-C9 unobserved settlement writes nothing and sets the phase', async () => {
    const t = setup();
    await t.controller.start(A);
    native().finish();
    await flush();
    expect(t.controller.snapshot().phase).toBe('completed');
    expect(statuses(t.ctl)).toEqual(['downloading']);
    const t2 = setup();
    await t2.controller.start(A);
    native().failTransfer(new Error('boom'));
    await flush();
    expect(t2.controller.snapshot()).toMatchObject({ phase: 'failed', error: expect.objectContaining({ message: 'boom' }) });
    expect(statuses(t2.ctl)).toEqual(['downloading']);
  });

  it('T-C10 a completed phase is reported, not refetched, until acknowledged', async () => {
    const t = setup();
    await t.controller.start(A);
    native().finish();
    await flush();
    expect((await t.controller.resume(A)).kind).toBe('completed');
    expect(world.instances).toHaveLength(1);
    await t.controller.record(A, 'failed');
    expect((await t.controller.start(A)).kind).toBe('started');
    expect(world.instances).toHaveLength(2);
  });

  it('T-C11 record() refuses a live transfer and writes nothing', async () => {
    const t = setup();
    await t.controller.start(A);
    await expect(t.controller.record(A, 'failed')).rejects.toBeInstanceOf(TransferInFlightError);
    expect(statuses(t.ctl)).toEqual(['downloading']);
  });

  it('T-C16 settlement bookkeeping: unasked null, retired generations, cleared pause state', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    await t.controller.resume(A);
    native().endTransfer(null); // nobody asked
    await flush();
    expect(t.events.filter((e) => e.type === 'stopped')).toEqual([
      expect.objectContaining({ reason: 'unrequested', modelId: A }),
    ]);
    expect(t.controller.snapshot().phase).toBe('paused');
    // completion clears a held pause state
    const t2 = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    await t2.controller.resume(A);
    native().finish();
    await flush();
    await t2.controller.record(A, 'failed');
    const last = t2.ctl.writes.at(-1);
    expect(last).toMatchObject({ status: 'failed', pauseState: null });
    // a late settle of a retired generation is dropped
    const t3 = setup();
    await t3.controller.start(A);
    await t3.controller.pause(A);
    t3.events.length = 0;
    native().failTransfer(new Error('late'));
    native().finish();
    await flush();
    expect(t3.events).toEqual([]);
    expect(t3.controller.snapshot().phase).toBe('paused');
  });
});

describe('controller: rows, load, store bounds', () => {
  it('T-C8 a failed save does not fail the op, is retried first, and a newer row supersedes it', async () => {
    const t = setup();
    await t.controller.start(A);
    t.ctl.failSets = 1;
    const result = await t.controller.pause(A);
    expect(result).toMatchObject({ kind: 'paused', rowSaved: false });
    expect(t.controller.snapshot().rowSaved).toBe(false);
    await t.controller.load();
    expect(t.ctl.current()?.status).toBe('paused');
    expect(t.controller.snapshot().rowSaved).toBe(true);
    // superseded
    const t2 = setup();
    await t2.controller.start(A);
    t2.ctl.failSets = 2; // the paused write fails, and so does its retry at the next op
    await t2.controller.pause(A);
    await t2.controller.abandon();
    expect(t2.ctl.current()).toBeNull();
    expect(t2.ctl.writes.filter((w) => w !== 'clear' && w.status === 'paused')).toHaveLength(0);
  });

  it('T-C12 load reads once, retries a pending write, starts nothing, holds a failed pause state', async () => {
    const t = setup({ row: { modelId: A, status: 'failed', pauseState: P } });
    const snap = await t.controller.load();
    expect(snap).toMatchObject({ modelId: A, phase: 'none', pauseState: P, row: { status: 'failed' } });
    await t.controller.load();
    expect(t.store.get).toHaveBeenCalledTimes(1);
    expect(world.instances).toHaveLength(0);
    const t2 = setup({ row: { modelId: A, status: 'downloading', pauseState: null } });
    expect(await t2.controller.load()).toMatchObject({ phase: 'none', modelId: A, pauseState: null });
  });

  it('T-C12 a failed first read leaves the controller unloaded and the next op retries', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    t.ctl.failGets = 1;
    await expect(t.controller.load()).rejects.toThrow('read failed');
    expect(t.controller.snapshot().row).toBeNull();
    expect(await t.controller.readRow()).toEqual({ modelId: A, status: 'paused' });
  });

  it('T-C12 a failed or hung open is never cached; a late settle of a dropped open is discarded', async () => {
    const timers = makeTimers();
    const { driver } = makeDriver();
    const a = makeStore();
    const b = makeStore();
    let resolveA!: (s: StoreLike) => void;
    const openStore = jest
      .fn()
      .mockImplementationOnce(() => new Promise<StoreLike>((r) => (resolveA = r)))
      .mockImplementationOnce(async () => b.store);
    const controller = createModelDownloadController({ driver, openStore, timers });
    const first = controller.load();
    await flush();
    const firstRejected = expect(first).rejects.toThrow('timed out');
    await timers.advance(10_001);
    await firstRejected;
    await expect(controller.load()).resolves.toMatchObject({ phase: 'none' });
    expect(openStore).toHaveBeenCalledTimes(2);
    resolveA(a.store);
    await flush();
    await controller.record(A, 'smoke-failed');
    expect(b.store.set).toHaveBeenCalled();
    expect(a.store.set).not.toHaveBeenCalled();
    // a rejected open is also retried, and a late rejection is not unhandled
    const open2 = jest.fn().mockRejectedValueOnce(new Error('open failed')).mockResolvedValueOnce(b.store);
    const c2 = createModelDownloadController({ driver, openStore: open2, timers });
    await expect(c2.load()).rejects.toThrow('open failed');
    await expect(c2.load()).resolves.toBeDefined();
  });

  it('T-C19 a store write that never settles is rowSaved:false after 10 s; a hung first read rejects', async () => {
    const t = setup();
    await t.controller.start(A);
    t.ctl.gateSet = new Promise<void>(() => undefined);
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(10_001);
    expect(await paused).toMatchObject({ kind: 'paused', rowSaved: false });
    const h = setup();
    h.ctl.hangGet = true;
    const loaded = expect(h.controller.load()).rejects.toThrow('timed out');
    await flush();
    await h.timers.advance(10_001);
    await loaded;
  });

  it('T-C18 never loaded: start awaits the lazy load; snapshot is empty', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    expect(t.controller.snapshot()).toMatchObject({ phase: 'none', modelId: null, row: null });
    await t.controller.start(A);
    expect(t.store.get).toHaveBeenCalledTimes(1);
    expect(statuses(t.ctl)).toEqual(['downloading']);
    const hung = setup();
    hung.ctl.hangGet = true;
    const started = hung.controller.start(A);
    const strict = await hung.controller.stopForStrict();
    expect(strict).toEqual({ kind: 'nothing-running', rowSaved: true });
    const startedRejected = expect(started).rejects.toThrow('timed out');
    await hung.timers.advance(10_001);
    await startedRejected;
    expect(hung.events).toEqual([]);
  });
});

describe('controller: park, gate, attach', () => {
  it('T-C20 park writes downloading with no pause state, starts nothing, keeps the latch', async () => {
    const t = setup();
    await t.controller.stopForStrict();
    await t.controller.load();
    await t.controller.park(A);
    expect(ctlLast(t)).toMatchObject({ status: 'downloading', pauseState: null });
    expect(world.instances).toHaveLength(0);
    // pause on phase none writes paused and still reports the latch
    expect(await t.controller.pause(A)).toMatchObject({ kind: 'paused', strict: true });
    expect(ctlLast(t)).toMatchObject({ status: 'paused' });
    expect((await t.controller.start(A)).kind).toBe('refused');
    await t.controller.releaseStrictStop();
    await t.controller.park(A);
    expect(await t.controller.pause(A)).toMatchObject({ kind: 'paused', strict: false });
    const live = setup();
    await live.controller.start(A);
    await expect(live.controller.park(A)).rejects.toBeInstanceOf(TransferInFlightError);
  });

  it('T-C21 the gate runs after the latch and before any write; refusals change nothing', async () => {
    const gate = jest.fn(async () => ({ allowed: false as const, reason: 'strict-mode' }));
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P }, gate: gate as never });
    const r = await t.controller.resume(A);
    expect(r).toEqual({ kind: 'refused', reason: 'strict-mode' });
    expect(t.ctl.writes).toEqual([]);
    expect(world.instances).toHaveLength(0);
    expect(t.controller.snapshot().pauseState).toEqual(P);
    await t.controller.attach(A);
    await t.controller.park(A);
    expect(gate).toHaveBeenCalledTimes(1);
    const latched = setup({ gate: gate as never });
    await latched.controller.load();
    await latched.controller.stopForStrict();
    gate.mockClear();
    expect((await latched.controller.start(A))).toEqual({ kind: 'refused', reason: 'stopped-for-strict' });
    expect(gate).not.toHaveBeenCalled();
    const allow = setup({ gate: (async () => ({ allowed: true })) as never });
    expect((await allow.controller.start(A)).kind).toBe('started');
  });

  it('T-C21b refusal then release then resume resumes from the kept pause state', async () => {
    const t = setup();
    await t.controller.start(A);
    await t.controller.pause(A);
    await t.controller.stopForStrict();
    expect((await t.controller.resume(A)).kind).toBe('refused');
    expect(t.ctl.current()).toMatchObject({ status: 'paused', pauseState: expect.objectContaining({ resumeData: 'rd' }) });
    await t.controller.releaseStrictStop();
    expect((await t.controller.resume(A)).kind).toBe('resumed');
  });

  it('T-C22 attach never creates a task or writes', async () => {
    const t = setup();
    await t.controller.start(A);
    const writesBefore = t.ctl.writes.length;
    expect((await t.controller.attach(A)).kind).toBe('attached');
    expect(world.instances).toHaveLength(1);
    expect(t.ctl.writes).toHaveLength(writesBefore);
    native().finish();
    await flush();
    expect((await t.controller.attach(A)).kind).toBe('completed');
    const t2 = setup();
    await t2.controller.start(A);
    native().failTransfer(new Error('x'));
    await flush();
    expect((await t2.controller.attach(A)).kind).toBe('failed');
    world.reset();
    const t3 = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    expect((await t3.controller.attach(A)).kind).toBe('not-live');
    expect(world.instances).toHaveLength(0);
  });
});

function ctlLast(t: ReturnType<typeof setup>) {
  return t.ctl.writes.at(-1);
}

describe('controller: stopForStrict and the latch', () => {
  it('T-C14 kill-window write precedes pauseAsync; kept; latch set; event emitted', async () => {
    const t = setup();
    await t.controller.start(A);
    const strict = t.controller.stopForStrict();
    const result = await strict;
    expect(result).toMatchObject({ kind: 'kept', rowSaved: true, pauseState: expect.objectContaining({ resumeData: 'rd' }) });
    expect(statuses(t.ctl)).toEqual(['downloading', 'paused', 'paused']);
    expect(t.ctl.writes[1]).toMatchObject({ pauseState: null });
    expect(t.events.filter((e) => e.type === 'stopped')).toEqual([expect.objectContaining({ reason: 'strict' })]);
    expect(t.controller.snapshot().stoppedForStrict).toBe(true);
  });

  it('T-C14 outcomes: no resume data, failed pause, failed, completed, nothing-running, failing kill-window write', async () => {
    const a = setup();
    await a.controller.start(A);
    world.config.resumeData = undefined;
    expect(await a.controller.stopForStrict()).toMatchObject({ kind: 'not-keepable', why: 'no-resume-data' });
    const b = setup();
    await b.controller.start(A);
    world.config.resumeData = 'rd';
    world.config.rejectPause = true;
    expect(await b.controller.stopForStrict()).toMatchObject({ kind: 'not-keepable', why: 'pause-failed' });
    world.config.rejectPause = false;
    const c = setup();
    await c.controller.start(A);
    world.config.slowFirstPause = true;
    const cs = c.controller.stopForStrict();
    await flush();
    native().failDuringPause(new Error('boom'));
    expect(await cs).toMatchObject({ kind: 'not-keepable', why: 'failed' });
    world.config.slowFirstPause = false;
    const d = setup();
    await d.controller.start(A);
    native().finish();
    await flush();
    expect(await d.controller.stopForStrict()).toMatchObject({ kind: 'completed' });
    expect(d.events.filter((e) => e.type === 'completed')).toHaveLength(1); // the settlement's; the strict stop only reports it
    const e = setup();
    await e.controller.load();
    expect(await e.controller.stopForStrict()).toEqual({ kind: 'nothing-running', rowSaved: true });
    expect(e.events).toEqual([]);
    const f = setup();
    await f.controller.start(A);
    f.ctl.failSets = 1;
    const fr = await f.controller.stopForStrict();
    expect(fr).toMatchObject({ kind: 'kept' });
    expect(fr.rowSaved).toBe(true); // the paused write after the failed kill-window write landed
  });

  it('T-C14 held records: paused with null pause state is kept; a model held on phase none emits stopped', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: null } });
    expect(await t.controller.stopForStrict()).toEqual({ kind: 'nothing-running', rowSaved: true }); // before load
    await t.controller.load();
    expect(await t.controller.stopForStrict()).toMatchObject({ kind: 'kept', pauseState: null });
    expect(t.events.filter((e) => e.type === 'stopped')).toHaveLength(1);
    const n = setup({ row: { modelId: A, status: 'downloading', pauseState: null } });
    await n.controller.load();
    expect(await n.controller.stopForStrict()).toMatchObject({ kind: 'nothing-running' });
    expect(n.events).toEqual([expect.objectContaining({ type: 'stopped', reason: 'strict' })]);
  });

  it('T-C14b case 1: a strict stop joining a queued pause runs one pauseAsync and emits once', async () => {
    const t = setup();
    await t.controller.start(A);
    let release!: () => void;
    t.ctl.gateSet = new Promise<void>((r) => (release = r));
    const blocker = t.controller.park(A).catch(() => undefined); // keeps the queue busy
    await flush();
    t.ctl.gateSet = null;
    const hubPause = t.controller.pause(A);
    const strict = t.controller.stopForStrict();
    release();
    await blocker;
    const pr = await hubPause;
    expect(pr).toMatchObject({ kind: 'paused', strict: true });
    expect(await strict).toMatchObject({ kind: 'kept' });
    expect(native().pauseCalls).toBe(1);
    expect(t.events.filter((e) => e.type === 'stopped')).toHaveLength(1);
    expect(t.ctl.writes.filter((w) => w !== 'clear' && w.status === 'paused' && w.pauseState === null)).toHaveLength(1);
  });

  it('T-C14b case 2/5: joining a running pause skips the kill-window write and returns its own promise', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const hubPause = t.controller.pause(A);
    await flush();
    const strict = t.controller.stopForStrict();
    native().deliverPause();
    const pr = await hubPause;
    expect(pr).toMatchObject({ kind: 'paused', strict: true });
    expect(await strict).toMatchObject({ kind: 'kept' });
    expect(native().pauseCalls).toBe(1);
    expect(t.ctl.writes.filter((w) => w !== 'clear' && w.status === 'paused' && w.pauseState === null)).toHaveLength(0);
    expect(t.events.filter((e) => e.type === 'stopped')).toHaveLength(1);
  });

  it('T-C14b case 3: after a pause returned, the strict stop reports kept from the record', async () => {
    const t = setup();
    await t.controller.start(A);
    const pr = await t.controller.pause(A);
    expect(pr).toMatchObject({ kind: 'paused', strict: false });
    expect(await t.controller.stopForStrict()).toMatchObject({ kind: 'kept' });
    expect(t.events.filter((e) => e.type === 'stopped')).toEqual([
      expect.objectContaining({ reason: 'strict', pauseState: expect.objectContaining({ resumeData: 'rd' }) }),
    ]);
  });

  it('T-C14b case 4: the latch refuses and only releaseStrictStop clears it', async () => {
    const t = setup();
    await t.controller.start(A);
    await t.controller.pause(A);
    await t.controller.stopForStrict();
    const before = t.ctl.writes.length;
    for (const r of [await t.controller.start(A), await t.controller.resume(A)]) {
      expect(r).toEqual({ kind: 'refused', reason: 'stopped-for-strict' });
    }
    expect(t.ctl.writes).toHaveLength(before);
    expect(world.instances).toHaveLength(1);
    await t.controller.record(A, 'failed');
    await t.controller.pause(A);
    await t.controller.abandon();
    expect((await t.controller.start(A)).kind).toBe('refused');
    expect(await t.controller.releaseStrictStop()).toEqual({ kind: 'released', wasSet: true });
    expect((await t.controller.start(A)).kind).toBe('started');
  });

  it('T-C14b case 6: a release queued behind a long op does not clear a later stop', async () => {
    const t = setup();
    await t.controller.load();
    let open!: () => void;
    t.ctl.gateSet = new Promise<void>((r) => (open = r));
    const parked = t.controller.park(A);
    const released = t.controller.releaseStrictStop();
    const strict = t.controller.stopForStrict();
    expect(t.controller.snapshot().stoppedForStrict).toBe(true);
    t.ctl.gateSet = null;
    open();
    await Promise.all([parked, released, strict]);
    expect(t.controller.snapshot().stoppedForStrict).toBe(true);
    expect((await t.controller.start(A)).kind).toBe('refused');
    const alone = setup();
    await alone.controller.stopForStrict();
    const r = alone.controller.releaseStrictStop();
    expect(alone.controller.snapshot().stoppedForStrict).toBe(false);
    expect(await r).toEqual({ kind: 'released', wasSet: true });
  });

  it('T-C14b case 7: a start queued ahead and not begun is refused by a later strict stop', async () => {
    const t = setup();
    await t.controller.load();
    let release!: () => void;
    t.ctl.gateSet = new Promise<void>((r) => (release = r));
    const blocker = t.controller.park(A);
    const started = t.controller.start(A);
    const strict = t.controller.stopForStrict();
    t.ctl.gateSet = null;
    release();
    await blocker;
    expect(await started).toEqual({ kind: 'refused', reason: 'stopped-for-strict' });
    await strict;
    expect(world.instances).toHaveLength(0);
  });

  it('T-C14b case 8: a start held on its write creates one task, which the strict stop pauses', async () => {
    const t = setup();
    await t.controller.load();
    let release!: () => void;
    t.ctl.gateSet = new Promise<void>((r) => (release = r));
    const started = t.controller.start(A);
    await flush();
    const strict = t.controller.stopForStrict();
    t.ctl.gateSet = null;
    release();
    expect((await started).kind).toBe('started');
    expect(await strict).toMatchObject({ kind: 'kept' });
    expect(world.instances).toHaveLength(1);
    expect(t.controller.snapshot().stoppedForStrict).toBe(true);
  });
});

describe('controller: lost cancel guard (T-C23)', () => {
  it('iOS: release once, straight after cancel, no listener, native cancel once', async () => {
    const t = setup({ platform: 'ios' });
    await t.controller.start(A);
    world.config.dropCancelUntilRelease = true;
    await t.controller.abandon();
    const n = native();
    expect(n.releaseCalls).toBe(1);
    expect(n.cancelCalls).toBe(1);
    expect(n.listeners.size).toBe(0);
    expect(n.running).toBe(false);
  });

  it('Android: the guard listener releases on the first progress event, then removes itself', async () => {
    const t = setup({ platform: 'android' });
    await t.controller.start(A);
    world.config.dropCancelUntilRelease = true;
    await t.controller.abandon();
    const n = native();
    expect(n.releaseCalls).toBe(0);
    expect(n.listeners.size).toBe(1);
    n.emitProgress(5);
    expect(n.releaseCalls).toBe(1);
    expect(n.cancelCalls).toBe(1);
    expect(n.running).toBe(false);
    expect(t.events.filter((e) => e.type === 'progress')).toEqual([]);
    expect(t.controller.snapshot().phase).toBe('none');
  });

  it('Android: a cancel that takes effect leaves no listener after the retired promise settles', async () => {
    const t = setup({ platform: 'android' });
    await t.controller.start(A);
    await t.controller.abandon();
    await flush();
    expect(native().listeners.size).toBe(0);
    expect(native().releaseCalls).toBe(0);
  });

  it('both platforms: a pause-failed cancel long after the start is guarded too', async () => {
    for (const platform of ['ios', 'android'] as const) {
      world.reset();
      const t = setup({ platform });
      await t.controller.start(A);
      native().emitProgress(1);
      world.config.rejectPause = true;
      world.config.dropNextCancel = true;
      expect(await t.controller.pause(A)).toMatchObject({ kind: 'pause-failed' });
      if (platform === 'ios') expect(native().releaseCalls).toBe(1);
      else {
        native().emitProgress(2);
        expect(native().releaseCalls).toBe(1);
      }
    }
  });

  it('transferPlatform maps web and android to the android guard', () => {
    expect(transferPlatform('ios')).toBe('ios');
    expect(transferPlatform('android')).toBe('android');
    expect(transferPlatform('web')).toBe('android');
  });
});

describe('controller: remaining spec cases', () => {
  it('T-C13b case 5: a controller built while backgrounded starts its timers suspended; inactive counts as foreground', async () => {
    const t = setup({ app: 'background' });
    await t.controller.start(A);
    world.config.dropPauseBeforeProgress = true;
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(120_000);
    expect(native().cancelCalls).toBe(0);
    t.kit.setApp('inactive');
    await t.timers.advance(29_999);
    expect(native().cancelCalls).toBe(0);
    await t.timers.advance(2);
    expect(await paused).toMatchObject({ kind: 'pause-failed' });
    expect(native().cancelCalls).toBe(1);
  });

  it('T-C12 real store: a failed schema step (first execAsync rejects) is not cached, the second load succeeds', async () => {
    const { createModelDownloadStateStore } = jest.requireActual('@/services/modelDownloadState');
    const exec = jest.fn().mockRejectedValueOnce(new Error('schema failed')).mockResolvedValue(undefined);
    const db = { execAsync: exec, getFirstAsync: jest.fn(async () => null), runAsync: jest.fn(async () => undefined) };
    const openStore = jest.fn(async () => createModelDownloadStateStore(db) as StoreLike);
    const { driver } = makeDriver();
    const controller = createModelDownloadController({ driver, openStore, timers: makeTimers() });
    await expect(controller.load()).rejects.toThrow('schema failed');
    await expect(controller.load()).resolves.toMatchObject({ phase: 'none' });
    expect(openStore).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('T-C12 real store: the same store with a cached ensureSchema failure would never recover (why openStore is reopened)', async () => {
    const { createModelDownloadStateStore } = jest.requireActual('@/services/modelDownloadState');
    const exec = jest.fn().mockRejectedValueOnce(new Error('schema failed')).mockResolvedValue(undefined);
    const db = { execAsync: exec, getFirstAsync: jest.fn(async () => null), runAsync: jest.fn(async () => undefined) };
    const store = createModelDownloadStateStore(db) as StoreLike;
    await expect(store.get()).rejects.toThrow('schema failed');
    await expect(store.get()).rejects.toThrow('schema failed'); // cached rejection
  });

  it('T-C12 late resolve at 15 s of a dropped open is discarded; a later write goes through the new store', async () => {
    const timers = makeTimers();
    const { driver } = makeDriver();
    const a = makeStore();
    const b = makeStore();
    let resolveA!: (s: StoreLike) => void;
    const openStore = jest
      .fn()
      .mockImplementationOnce(() => new Promise<StoreLike>((r) => (resolveA = r)))
      .mockImplementationOnce(async () => b.store);
    const controller = createModelDownloadController({ driver, openStore, timers });
    const first = controller.load();
    await flush();
    const rejected = expect(first).rejects.toThrow('timed out');
    await timers.advance(10_001);
    await rejected;
    await expect(controller.load()).resolves.toBeDefined();
    await timers.advance(5_000);
    resolveA(a.store);
    await flush();
    await controller.record(A, 'smoke-failed');
    expect(b.store.set).toHaveBeenCalled();
    expect(a.store.set).not.toHaveBeenCalled();
  });

  it('T-C12 late reject of a dropped open raises no unhandled rejection', async () => {
    const timers = makeTimers();
    const { driver } = makeDriver();
    const b = makeStore();
    let rejectA!: (e: unknown) => void;
    const openStore = jest
      .fn()
      .mockImplementationOnce(() => new Promise<StoreLike>((_r, rej) => (rejectA = rej)))
      .mockImplementationOnce(async () => b.store);
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const controller = createModelDownloadController({ driver, openStore, timers });
    const first = controller.load();
    await flush();
    const rejected = expect(first).rejects.toThrow('timed out');
    await timers.advance(10_001);
    await rejected;
    await expect(controller.load()).resolves.toBeDefined();
    rejectA(new Error('late open failure'));
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('controller: review round 1', () => {
  function stubKit() {
    const timers = makeTimers();
    const { store } = makeStore();
    let app: (s: string) => void = () => undefined;
    let progress: (p: { bytesWritten: number; totalBytes: number }) => void = () => undefined;
    let settleTransfer: (v: unknown) => void = () => undefined;
    const stub = {
      state: 'active' as string,
      cancel: jest.fn(),
      release: jest.fn(),
      pause: jest.fn(),
      savable: jest.fn(() => P),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      pauseAsync: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const driver: TransferDriver = {
      platform: 'android',
      start: (_id, { onProgress }) => {
        progress = onProgress;
        return { task: stub as never, promise: new Promise((r) => (settleTransfer = r)), kind: 'started' };
      },
      resume: () => ({ task: stub as never, promise: new Promise(() => undefined), kind: 'resumed' }),
      onAppState: (l) => {
        app = l;
        l('active');
        return () => undefined;
      },
    };
    const controller = createModelDownloadController({ driver, store, timers });
    const events: ControllerEvent[] = [];
    controller.subscribe((e) => events.push(e));
    return {
      controller, timers, stub, events,
      setApp: (x: string) => app(x),
      progress: (n: number) => progress({ bytesWritten: n, totalBytes: 1000 }),
      settle: (v: unknown) => settleTransfer(v),
    };
  }

  it('M1 the re-issue is one-shot: background then foreground does not issue a third pause', async () => {
    const k = stubKit();
    await k.controller.start(A);
    const paused = k.controller.pause(A);
    await flush();
    await k.timers.advance(600);
    k.progress(5);
    await k.timers.advance(400);
    expect(k.stub.pause).toHaveBeenCalledTimes(1);
    k.setApp('background');
    await k.timers.advance(100_000);
    k.setApp('active');
    await k.timers.advance(600);
    k.progress(6);
    await k.timers.advance(2_000);
    expect(k.stub.pause).toHaveBeenCalledTimes(1);
    await k.timers.advance(30_000);
    expect(await paused).toMatchObject({ kind: 'pause-failed' });
  });

  it('M2 a stale progress event just after the ask does not re-issue on a slow but effective pause', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const paused = t.controller.pause(A);
    await flush();
    native().emitProgress(5); // emitted before the ask, delivered just after it
    await t.timers.advance(1_000);
    expect(native().pauseCalls).toBe(1);
    native().deliverPause();
    expect(await paused).toMatchObject({ kind: 'paused', pauseState: expect.objectContaining({ resumeData: 'rd' }) });
  });

  it('M5 strict events per outcome: no-resume-data and pause-failed emit stopped; error and completed emit once', async () => {
    const a = setup();
    await a.controller.start(A);
    world.config.resumeData = undefined;
    await a.controller.stopForStrict();
    expect(a.events.filter((e) => e.type === 'stopped')).toHaveLength(1);
    world.config.resumeData = 'rd';
    const b = setup();
    await b.controller.start(A);
    world.config.rejectPause = true;
    await b.controller.stopForStrict();
    expect(b.events.filter((e) => e.type === 'stopped')).toEqual([expect.objectContaining({ reason: 'strict' })]);
    world.config.rejectPause = false;
    const c = setup();
    await c.controller.start(A);
    world.config.slowFirstPause = true;
    const cs = c.controller.stopForStrict();
    await flush();
    native().failDuringPause(new Error('boom'));
    await cs;
    expect(c.events.filter((e) => e.type === 'failed')).toHaveLength(1);
    const d = setup();
    await d.controller.start(A);
    const ds = d.controller.stopForStrict();
    await flush();
    native().completeDuringPause();
    expect(await ds).toMatchObject({ kind: 'completed' });
    expect(d.events.filter((e) => e.type === 'completed')).toHaveLength(1);
    expect(d.events.filter((e) => e.type === 'stopped')).toHaveLength(0);
  });

  it('M5 a strict stop that finds the task completed during its pause with a failing kill-window write: completed, rowSaved false', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    t.ctl.failSets = 1;
    const strict = t.controller.stopForStrict();
    await flush();
    native().completeDuringPause();
    expect(await strict).toEqual({ kind: 'completed', rowSaved: false });
  });

  it('N4 nothing-running and a held kept report rowSaved true when the call asked for no write', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    await t.controller.load();
    t.ctl.failSets = 5;
    expect(await t.controller.stopForStrict()).toEqual({ kind: 'kept', pauseState: P, rowSaved: true });
    const n = setup();
    await n.controller.load();
    expect(await n.controller.stopForStrict()).toEqual({ kind: 'nothing-running', rowSaved: true });
  });

  it('M6 pause() after a strict pause-failed reports pause-failed with the held pause state, and a held report emits nothing', async () => {
    const t = setup({ row: { modelId: A, status: 'paused', pauseState: P } });
    await t.controller.resume(A);
    world.config.rejectPause = true;
    expect(await t.controller.stopForStrict()).toMatchObject({ kind: 'not-keepable', why: 'pause-failed' });
    t.events.length = 0;
    expect(await t.controller.pause(A)).toMatchObject({ kind: 'pause-failed', pauseState: P });
    expect(await t.controller.stopForStrict()).toMatchObject({ kind: 'not-keepable', why: 'pause-failed' });
    expect(t.events).toEqual([]);
  });

  it('N5 an unrequested null whose task is completed, errored, cancelled or unsavable always emits an event', async () => {
    const cases: Array<[string, (stub: { state: string; savable: jest.Mock }) => void, string]> = [
      ['completed', (st) => (st.state = 'completed'), 'completed'],
      ['error', (st) => (st.state = 'error'), 'failed'],
      ['cancelled', (st) => (st.state = 'cancelled'), 'stopped'],
      ['unsavable', (st) => {
        st.state = 'paused';
        st.savable.mockImplementation(() => {
          throw new Error('savable threw');
        });
      }, 'stopped'],
    ];
    for (const [name, prep, expected] of cases) {
      const k = stubKit();
      await k.controller.start(A);
      prep(k.stub);
      k.settle(null);
      await flush(40);
      expect(k.events.map((e) => e.type)).toContain(expected);
      expect(k.controller.snapshot().phase).not.toBe('active');
      void name;
    }
  });
});

describe('controller: review round 2', () => {
  function scanKit() {
    let state = 'active';
    let resolvePause!: () => void;
    const task = {
      get state() {
        return state;
      },
      pause: jest.fn(),
      pauseAsync: jest.fn(
        () =>
          new Promise<void>((r) => {
            resolvePause = () => {
              state = 'paused';
              r();
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
    const { store } = makeStore();
    const driver: TransferDriver = {
      platform: 'android',
      start: () => ({ task: task as never, promise: new Promise(() => undefined), kind: 'started' }),
      resume: () => ({ task: task as never, promise: new Promise(() => undefined), kind: 'resumed' }),
      onAppState: (l) => {
        l('active');
        return () => undefined;
      },
    };
    const controller = createModelDownloadController({
      driver,
      store,
      timers: { setTimeout: () => ({}), clearTimeout: () => undefined },
    });
    const events: ControllerEvent[] = [];
    controller.subscribe((e) => events.push(e));
    return { controller, events, resolvePause: () => resolvePause() };
  }

  it('MINOR 1 a strict stop at every microtask offset after the pause settles is never a fabricated pause-failed', async () => {
    for (let n = 0; n < 40; n++) {
      const k = scanKit();
      await k.controller.start(A);
      const pausePromise = k.controller.pause(A);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      k.resolvePause();
      for (let i = 0; i < n; i++) await Promise.resolve();
      const strict = await k.controller.stopForStrict();
      const pr = await pausePromise;
      expect({ n, kind: strict.kind }).toEqual({ n, kind: 'kept' });
      expect(strict).toMatchObject({ pauseState: P, rowSaved: true });
      expect(pr).toMatchObject({ kind: 'paused' });
      expect(k.events.filter((e) => e.type === 'stopped')).toHaveLength(1);
    }
  });

  it('MINOR 1 a joined pause that rejects: the strict procedure still runs on the live transfer', async () => {
    const t = setup();
    await t.controller.start(A); // live transfer for A
    const abandoned = t.controller.abandon();
    const recordedB = t.controller.record(B, 'failed'); // no live transfer, a record for another model
    const pauseA = t.controller.pause(A); // queued while A is live: registers the join
    const strict = t.controller.stopForStrict(); // joins it
    const rejected = expect(pauseA).rejects.toBeInstanceOf(Error);
    await abandoned;
    await recordedB;
    await rejected;
    const result = await strict;
    expect(result).toEqual({ kind: 'nothing-running', rowSaved: true }); // the strict op ran, not a fabricated pause-failed
    expect(t.controller.snapshot().stoppedForStrict).toBe(true);
    expect(t.controller.snapshot().phase).not.toBe('active');
  });

  it('NIT the 500 ms grace re-runs after a foreground return: earlier progress never triggers the re-issue', async () => {
    const t = setup();
    await t.controller.start(A);
    world.config.slowFirstPause = true;
    const paused = t.controller.pause(A);
    await flush();
    await t.timers.advance(600);
    native().emitProgress(5); // counts so far
    t.kit.setApp('background');
    await t.timers.advance(5_000);
    t.kit.setApp('active');
    await t.timers.advance(1_500); // no progress since the return
    expect(native().pauseCalls).toBe(1);
    native().deliverPause();
    expect(await paused).toMatchObject({ kind: 'paused' });
  });
});

export type { ModelDownloadController };
