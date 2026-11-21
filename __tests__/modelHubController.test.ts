/**
 * Hub machine + REAL controller + REAL NetworkTasks.js over the fake native
 * task (spec T-H1 to T-H9b, T-H11). Replaces the RED reproductions, which drove
 * #125's old API and are deleted in the same commit.
 */
import { createActor, waitFor } from 'xstate';
import { DownloadTask } from '../node_modules/expo-file-system/build/NetworkTasks';
import { modelHubMachine, type ModelHubApi, type ModelHubMachineEvents } from '@/machines/modelHubMachine';
import {
  createModelDownloadController,
  type ModelDownloadController,
  type StoreLike,
  type TransferDriver,
} from '@/services/modelDownloadController';
import type { DownloadPauseStateRecord, ModelDownloadStatus } from '@/services/modelDownloadState';
import { world, flush } from './helpers/fakeNativeDownload';

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
const URL = 'https://huggingface.co/x/resolve/main/f.gguf';
const P: DownloadPauseStateRecord = { url: URL, fileUri: 'file:///doc/f.gguf', isDirectory: false, resumeData: 'rd' };
type Row = { modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null };

function build(opts: { row?: Row | null; network?: 'wifi' | 'cellular' | 'offline'; verified?: boolean } = {}) {
  let row: Row | null = opts.row ?? null;
  const writes: string[] = [];
  let gateSet: Promise<void> | null = null;
  const store: StoreLike = {
    get: async () => row,
    set: async (r) => {
      if (gateSet) await gateSet;
      writes.push(r.status);
      row = { ...r };
    },
    clear: async () => {
      writes.push('clear');
      row = null;
    },
  };
  const driver: TransferDriver = {
    platform: 'android',
    start: (_id, { onProgress }) => {
      const t = new DownloadTask(URL, { uri: P.fileUri } as never, { onProgress });
      return { task: t as never, promise: t.downloadAsync(), kind: 'started' };
    },
    resume: (_id, ps, { onProgress }) => {
      const t = DownloadTask.fromSavable(ps, { onProgress });
      return { task: t as never, promise: t.resumeAsync(), kind: 'resumed' };
    },
    onAppState: (l) => {
      l('active');
      return () => undefined;
    },
  };
  const downloads: ModelDownloadController = createModelDownloadController({
    driver,
    store,
    timers: {
      setTimeout: (fn, ms) => {
        const h = setTimeout(fn, ms);
        (h as { unref?: () => void }).unref?.();
        return h;
      },
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  });
  const subscribeSpy = jest.spyOn(downloads, 'subscribe');
  const verified = { value: opts.verified ?? false };
  const api: ModelHubApi = {
    downloads,
    checkNetwork: jest.fn(async () => opts.network ?? 'wifi'),
    verifyDownload: jest.fn(() => verified.value),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    setModelPath: jest.fn(async () => undefined),
    retireCurrentModel: jest.fn(async () => ({ identityCleared: true })),
    deleteModelFile: jest.fn(async () => undefined),
    isLowMemoryFor: jest.fn(() => false),
    deleteOrphanedModelFiles: jest.fn(async () => undefined),
  };
  const spawn = () => createActor(modelHubMachine, { input: { api } }).start();
  return {
    api, downloads, spawn, writes, verified, subscribeSpy, row: () => row,
    setGate: (g: Promise<void> | null) => {
      gateSet = g;
    },
  };
}

const native = (i?: number) => world.instances[i ?? world.instances.length - 1];
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('until: condition not met');
    await new Promise((r) => setTimeout(r, 5));
  }
};
type Actor = ReturnType<ReturnType<typeof build>['spawn']>;
const send = (a: Actor, e: ModelHubMachineEvents) => a.send(e);

async function startDownloading(h: ReturnType<typeof build>) {
  const actor = h.spawn();
  send(actor, { type: 'SELECT_MODEL', modelId: A });
  await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
  await until(() => world.instances.length === 1);
  return actor;
}

beforeEach(() => {
  world.reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('download controller (hub)', () => {
  it('T-H1 APP_BACKGROUND then APP_FOREGROUND before the pause settles resumes from the pause state', async () => {
    const h = build();
    const actor = await startDownloading(h);
    world.config.slowFirstPause = true;
    send(actor, { type: 'APP_BACKGROUND' });
    await waitFor(actor, (s) => s.matches('pausing'), { timeout: 3000 });
    send(actor, { type: 'APP_FOREGROUND' });
    await flush();
    native().deliverPause();
    await until(() => world.instances.length === 2);
    expect(actor.getSnapshot().matches('downloading')).toBe(true);
    expect(native().resumeArgs[2]).toBe('rd');
    actor.stop();
  });

  it('T-H2 no Resume while pausing; a RESUME sent anyway is ignored; Resume works once paused', async () => {
    const h = build();
    const actor = await startDownloading(h);
    world.config.slowFirstPause = true;
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('pausing'), { timeout: 3000 });
    send(actor, { type: 'RESUME' });
    await flush();
    expect(actor.getSnapshot().matches('pausing')).toBe(true);
    native().deliverPause();
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    send(actor, { type: 'RESUME' });
    await until(() => world.instances.length === 2);
    expect(native().resumeArgs[2]).toBe('rd');
    actor.stop();
  });

  it('T-H3 a failed pause lands in failed with the transfer cancelled, never active', async () => {
    const h = build();
    const actor = await startDownloading(h);
    world.config.rejectPause = true;
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.message).toBe('Could not pause the download. Try again.');
    expect(h.downloads.snapshot().phase).not.toBe('active');
    expect(native().cancelCalls).toBe(1);
    actor.stop();
  });

  it('T-H4 a completion during the pause goes on to verify and complete, with no paused write or error', async () => {
    const h = build();
    const actor = await startDownloading(h);
    world.config.slowFirstPause = true;
    h.verified.value = true;
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('pausing'), { timeout: 3000 });
    native().completeDuringPause();
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(h.writes).not.toContain('paused');
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });

  it('T-H5 a hub closed mid-pause: the pause still lands, and a new hub restores paused and resumes', async () => {
    const h = build();
    const actor = await startDownloading(h);
    world.config.slowFirstPause = true;
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('pausing'), { timeout: 3000 });
    actor.stop();
    await until(() => native().pauseCalls === 1);
    native().deliverPause();
    await until(() => h.row()?.status === 'paused');
    expect(h.row()?.pauseState).toMatchObject({ resumeData: 'rd' });
    const next = h.spawn();
    const snap = await h.downloads.load();
    next.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'paused', pauseState: snap.pauseState });
    expect(next.getSnapshot().matches('paused')).toBe(true);
    next.send({ type: 'RESUME' });
    await until(() => world.instances.length === 2);
    expect(native().resumeArgs[2]).toBe('rd');
    next.stop();
  });

  it('T-H6 reopening with a live transfer attaches: one task, no network check, progress seeded, pause works', async () => {
    const h = build();
    const first = await startDownloading(h);
    native().emitProgress(250);
    first.stop();
    (h.api.checkNetwork as jest.Mock).mockClear();
    const snap = await h.downloads.load();
    expect(snap.phase).toBe('active');
    const next = h.spawn();
    next.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'downloading', pauseState: null, live: true });
    await waitFor(next, (s) => s.context.progress.bytesWritten === 250, { timeout: 3000 });
    expect(world.instances).toHaveLength(1);
    expect(h.api.checkNetwork).not.toHaveBeenCalled();
    next.send({ type: 'PAUSE' });
    await waitFor(next, (s) => s.matches('paused'), { timeout: 3000 });
    expect(native().pauseCalls).toBe(1);
    next.stop();
  });

  it('T-H6 not-live goes behind the network check with the continuation and creates no task before it passes', async () => {
    const h = build({ row: { modelId: A, status: 'paused', pauseState: P }, network: 'cellular' });
    await h.downloads.load();
    const actor = h.spawn();
    actor.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'downloading', pauseState: null, live: true });
    await waitFor(actor, (s) => s.matches('cellularConfirm'), { timeout: 3000 });
    expect(world.instances).toHaveLength(0);
    expect(actor.getSnapshot().context.pauseState).toEqual(P);
    actor.stop();
  });

  it('T-H6 a finished file restores to the verify path with no check and no new task', async () => {
    const h = build();
    const first = await startDownloading(h);
    h.verified.value = true;
    first.stop();
    (h.api.checkNetwork as jest.Mock).mockClear();
    native().finish();
    await flush();
    const snap = await h.downloads.load();
    expect(snap.phase).toBe('completed');
    const actor = h.spawn();
    actor.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'downloading', pauseState: null, finished: true });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(h.api.checkNetwork).not.toHaveBeenCalled();
    expect(world.instances).toHaveLength(1);
    actor.stop();
  });

  it('T-H9 a strict stop under a running hub: paused with reason strict, one pauseAsync, foreground stays paused', async () => {
    const h = build();
    const actor = await startDownloading(h);
    const result = await h.downloads.stopForStrict();
    expect(result.kind).toBe('kept');
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('strict');
    expect(native().pauseCalls).toBe(1);
    send(actor, { type: 'APP_FOREGROUND' });
    await flush();
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    actor.stop();
  });

  it('T-H9 an unrequested stop goes to paused with reason user; another model is ignored', async () => {
    const h = build();
    const actor = await startDownloading(h);
    native().endTransfer(null);
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    send(actor, { type: 'TRANSFER_STOPPED', reason: 'strict', modelId: 'smarter-slower', pauseState: null });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    actor.stop();
  });

  it('T-H9b case 1: a strict stop joining the hub pause ends paused with reason strict', async () => {
    for (const trigger of ['PAUSE', 'APP_BACKGROUND'] as const) {
      world.reset();
      const h = build();
      const actor = await startDownloading(h);
      world.config.slowFirstPause = true;
      send(actor, { type: trigger });
      await waitFor(actor, (s) => s.matches('pausing'), { timeout: 3000 });
      const strict = h.downloads.stopForStrict();
      await flush();
      native().deliverPause();
      await strict;
      await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
      expect(actor.getSnapshot().context.pausedReason).toBe('strict');
      expect(native().pauseCalls).toBe(1);
      send(actor, { type: 'APP_FOREGROUND' });
      await flush();
      expect(actor.getSnapshot().matches('paused')).toBe(true);
      actor.stop();
    }
  });

  it('T-H9b case 2: a strict stop in the network states ends paused strict, no prompt, no task', async () => {
    const h = build({ row: { modelId: A, status: 'paused', pauseState: P }, network: 'cellular' });
    await h.downloads.load();
    const actor = h.spawn();
    actor.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'paused', pauseState: P });
    actor.send({ type: 'RESUME' });
    await waitFor(actor, (s) => s.matches('cellularConfirm'), { timeout: 3000 });
    await h.downloads.stopForStrict();
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('strict');
    expect(world.instances).toHaveLength(0);
    actor.stop();
  });

  it('T-H9b case 4: a strict stop after the pause settled relabels the paused hub', async () => {
    const h = build();
    const actor = await startDownloading(h);
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    await h.downloads.stopForStrict();
    await flush();
    expect(actor.getSnapshot().context.pausedReason).toBe('strict');
    send(actor, { type: 'APP_FOREGROUND' });
    await flush();
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    actor.stop();
  });

  it('T-H11 a refusal pauses with reason strict, never writes downloading, and a release lets Resume start', async () => {
    const h = build({ row: { modelId: A, status: 'paused', pauseState: P } });
    await h.downloads.load();
    await h.downloads.stopForStrict();
    h.writes.length = 0;
    const actor = h.spawn();
    actor.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'paused', pauseState: P });
    actor.send({ type: 'RESUME' });
    await until(() => actor.getSnapshot().matches('paused') && actor.getSnapshot().context.pausedReason === 'strict');
    expect(h.writes).not.toContain('downloading');
    expect(actor.getSnapshot().matches('failed')).toBe(false);
    expect(world.instances).toHaveLength(0);
    await h.downloads.releaseStrictStop();
    actor.send({ type: 'RESUME' });
    await until(() => world.instances.length === 1);
    expect(native().resumeArgs[2]).toBe('rd');
    actor.stop();
  });

  it('D8 web: a start whose stub resolves null ends paused with reason user, and Resume cycles', async () => {
    const h = build();
    world.config.startResolvesNull = true;
    const actor = h.spawn();
    send(actor, { type: 'SELECT_MODEL', modelId: A });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    expect(world.instances).toHaveLength(1);
    send(actor, { type: 'RESUME' });
    await until(() => world.instances.length === 2);
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    actor.stop();
  });
});

describe('download controller (hub): review round 1', () => {
  const restoreDownloading = (actor: Actor) =>
    actor.send({ type: 'RESTORE_DOWNLOAD', modelId: A, status: 'downloading', pauseState: null });

  it('M4 a strict stop on phase none with a restored downloading row ends paused strict in each network state, with no task', async () => {
    for (const net of ['cellular', 'offline', 'hang'] as const) {
      world.reset();
      const h = build({ row: { modelId: A, status: 'downloading', pauseState: null }, network: net === 'hang' ? 'wifi' : net });
      if (net === 'hang') (h.api.checkNetwork as jest.Mock).mockImplementation(() => new Promise(() => undefined));
      await h.downloads.load();
      const actor = h.spawn();
      restoreDownloading(actor);
      const want = net === 'cellular' ? 'cellularConfirm' : net === 'offline' ? 'awaitingWifi' : 'confirmingNetwork';
      await waitFor(actor, (st) => st.matches(want), { timeout: 3000 });
      expect(await h.downloads.stopForStrict()).toMatchObject({ kind: 'nothing-running' });
      await waitFor(actor, (st) => st.matches('paused'), { timeout: 3000 });
      expect(actor.getSnapshot().context.pausedReason).toBe('strict');
      expect(world.instances).toHaveLength(0);
      actor.stop();
    }
  });

  async function pausedThenChecking(h: ReturnType<typeof build>, resolveCheck: { fn: () => void }) {
    const actor = await startDownloading(h);
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (st) => st.matches('paused'), { timeout: 3000 });
    (h.api.checkNetwork as jest.Mock).mockImplementation(
      () => new Promise((r) => (resolveCheck.fn = () => r('wifi'))),
    );
    send(actor, { type: 'RESUME' });
    await waitFor(actor, (st) => st.matches('confirmingNetwork'), { timeout: 3000 });
    await until(() => typeof resolveCheck.fn === 'function' && (h.api.checkNetwork as jest.Mock).mock.calls.length >= 2);
    return actor;
  }

  it('M4 T-H9b case 3: the check wins and resume() is queued BEHIND the strict stop: refused, one task ever', async () => {
    const h = build();
    const rc = { fn: () => undefined as void };
    const actor = await pausedThenChecking(h, rc);
    rc.fn();
    const strict = h.downloads.stopForStrict();
    await strict;
    await waitFor(actor, (st) => st.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('strict');
    await flush(30);
    expect(world.instances).toHaveLength(1);
    expect(h.row()).toMatchObject({ status: 'paused', pauseState: expect.objectContaining({ resumeData: 'rd' }) });
    expect(h.downloads.snapshot().stoppedForStrict).toBe(true);
    actor.stop();
  });

  it('M4 T-H9b case 3: resume() queued AHEAD of the strict stop and not begun: refused by the latch, one task ever', async () => {
    const h = build();
    const rc = { fn: () => undefined as void };
    const actor = await pausedThenChecking(h, rc);
    let open!: () => void;
    h.setGate(new Promise<void>((r) => (open = r)));
    const blocker = h.downloads.record(A, 'failed'); // holds the queue on its write; keeps P
    await flush();
    rc.fn();
    await waitFor(actor, (st) => st.matches('downloading'), { timeout: 3000 });
    const strict = h.downloads.stopForStrict(); // arrives after resume() was queued, before it began
    h.setGate(null);
    open();
    await Promise.all([blocker, strict]);
    await waitFor(actor, (st) => st.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('strict');
    await flush(30);
    expect(world.instances).toHaveLength(1);
    expect(h.row()).toMatchObject({ status: 'paused' });
    expect(h.downloads.snapshot().stoppedForStrict).toBe(true);
    actor.stop();
  });

  it('M4 T-H4 second order: the completion is queued before the pause: verifying then complete, no pauseAsync', async () => {
    const h = build();
    const actor = await startDownloading(h);
    h.verified.value = true;
    native().finish();
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (st) => st.matches('complete'), { timeout: 3000 });
    expect(native().pauseCalls).toBe(0);
    expect(actor.getSnapshot().context.error).toBeNull();
    expect(h.writes).not.toContain('paused');
    actor.stop();
  });

  it('M4 controllerEvents subscribes once at start; only runDownload adds a subscription per download', async () => {
    const h = build();
    const actor = h.spawn();
    expect(h.subscribeSpy).toHaveBeenCalledTimes(1);
    send(actor, { type: 'SELECT_MODEL', modelId: A });
    await waitFor(actor, (st) => st.matches('downloading'), { timeout: 3000 });
    send(actor, { type: 'PAUSE' });
    await waitFor(actor, (st) => st.matches('paused'), { timeout: 3000 });
    expect(h.subscribeSpy).toHaveBeenCalledTimes(2); // root + the one runDownload
    actor.stop();
  });
});
