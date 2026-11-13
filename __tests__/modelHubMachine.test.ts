import { createActor, waitFor } from 'xstate';
import {
  modelHubMachine,
  smokeFailureMessage,
  smokeTestSettled,
  type ModelHubApi,
} from '@/machines/modelHubMachine';
import type { CuratedModel } from '@/catalog/modelManifest';

const fastLight: CuratedModel = {
  id: 'fast-light',
  displayName: 'Fast & Light',
  tagline: 't',
  sizeLabel: '~2.3 GB',
  sizeBytes: 2393231072,
  hfUrl: 'https://huggingface.co/x/resolve/main/f.gguf',
  filename: 'f.gguf',
  llamaConfig: { contextSize: 4096 },
  deviceHint: 'all',
};

function makeApi(overrides: Partial<ModelHubApi> = {}): ModelHubApi {
  return {
    checkNetwork: jest.fn(async () => 'wifi' as const),
    startDownload: jest.fn(async () => true),
    resumeDownload: jest.fn(async () => true),
    pauseDownload: jest.fn(async () => ({ url: fastLight.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' })),
    verifyDownload: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    persistDownloadState: jest.fn(async () => undefined),
    clearDownloadState: jest.fn(async () => undefined),
    setModelPath: jest.fn(async () => undefined),
    retireCurrentModel: jest.fn(async () => ({ identityCleared: true })),
    deleteModelFile: jest.fn(async () => undefined),
    isLowMemoryFor: jest.fn(() => false),
    deleteOrphanedModelFiles: jest.fn(async () => undefined),
    ...overrides,
  };
}

/** Polls a condition xstate's waitFor cannot see (mock calls emit no snapshot). */
async function until(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('until: condition not met');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('modelHubMachine', () => {
  it('happy path: select -> wifi -> download -> verify -> smoke -> complete', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.setModelPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'fast-light' }));
    expect(api.clearDownloadState).toHaveBeenCalled();
    actor.stop();
  });

  it('routes to cellularConfirm on cellular and proceeds only after CELLULAR_CONFIRM', async () => {
    const api = makeApi({ checkNetwork: jest.fn(async () => 'cellular' as const) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('cellularConfirm'), { timeout: 3000 });
    actor.send({ type: 'CELLULAR_CONFIRM' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('routes to awaitingWifi when offline, and re-checks on CHECK_NETWORK', async () => {
    const checkNetwork = jest
      .fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValueOnce('wifi');
    const api = makeApi({ checkNetwork });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('awaitingWifi'), { timeout: 3000 });
    actor.send({ type: 'CHECK_NETWORK' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('tracks DOWNLOAD_PROGRESS events while downloading', async () => {
    let progressCb: ((p: { bytesWritten: number; totalBytes: number }) => void) | undefined;
    const api = makeApi({
      startDownload: jest.fn(async (_model, onProgress) => {
        progressCb = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, () => progressCb !== undefined, { timeout: 3000 });
    progressCb!({ bytesWritten: 100, totalBytes: 200 });
    await waitFor(actor, (s) => s.context.progress.bytesWritten === 100, { timeout: 3000 });
    actor.stop();
  });

  it('coerces BigInt progress values to numbers before storing them', async () => {
    // SDK 58 delivers Int64 progress fields as BigInt at runtime; the render
    // layer does plain number arithmetic on these, so the machine must never
    // hold BigInts in context (defense in depth behind the service boundary).
    let progressCb: ((p: { bytesWritten: unknown; totalBytes: unknown }) => void) | undefined;
    const api = makeApi({
      startDownload: jest.fn(async (_model, onProgress) => {
        progressCb = onProgress as typeof progressCb;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, () => progressCb !== undefined, { timeout: 3000 });
    progressCb!({ bytesWritten: 100n, totalBytes: 200n });
    await waitFor(actor, (s) => s.context.progress.bytesWritten === 100, { timeout: 3000 });
    expect(typeof actor.getSnapshot().context.progress.bytesWritten).toBe('number');
    expect(typeof actor.getSnapshot().context.progress.totalBytes).toBe('number');
    actor.stop();
  });

  it('manual PAUSE then RESUME preserves pauseState and resumes the same download', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused') && s.context.pauseState !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    actor.send({ type: 'RESUME' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    expect(api.resumeDownload).toHaveBeenCalledWith(
      expect.objectContaining({ resumeData: 'rd' }),
      expect.any(Function),
    );
    actor.stop();
  });

  it('APP_BACKGROUND pauses and APP_FOREGROUND auto-resumes (background reason)', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'APP_BACKGROUND' });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('background');
    actor.send({ type: 'APP_FOREGROUND' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.stop();
  });

  it('APP_FOREGROUND does NOT auto-resume a manually-paused download', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    actor.send({ type: 'APP_FOREGROUND' });
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    actor.stop();
  });

  it('byte mismatch on verify deletes the partial file and goes to failed', async () => {
    const api = makeApi({ verifyDownload: jest.fn(() => false) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(api.deletePartialFile).toHaveBeenCalledWith('qwen3-4b-instruct-2507-q4_0.gguf');
    expect(actor.getSnapshot().context.error?.code).toBe('verify');
    actor.stop();
  });

  it('smoke test failure goes to smokeFailed with a smoke error', async () => {
    const api = makeApi({ runSmokeTest: jest.fn(async () => ({ ok: false })) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('smoke');
    actor.stop();
  });

  describe('existing file, smoke marker, smokeFailed', () => {
    const start = (api: ModelHubApi) => createActor(modelHubMachine, { input: { api } }).start();
    const lastStatus = (api: ModelHubApi) => {
      const calls = (api.persistDownloadState as jest.Mock).mock.calls;
      return calls[calls.length - 1][0].status;
    };

    it('reuses a complete file on select', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => true) });
      const actor = start(api);
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.startDownload).not.toHaveBeenCalled();
      expect(api.checkNetwork).not.toHaveBeenCalled();
      expect(api.deleteOrphanedModelFiles).toHaveBeenCalledWith('fast-light');
      actor.stop();
    });

    it('reuses a complete file on restore', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => true) });
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'downloading', pauseState: null });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.startDownload).not.toHaveBeenCalled();
      expect(api.checkNetwork).not.toHaveBeenCalled();
      actor.stop();
    });

    it('no file on select goes through the network check and downloads', async () => {
      const api = makeApi();
      const actor = start(api);
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.checkNetwork).toHaveBeenCalled();
      expect(api.startDownload).toHaveBeenCalled();
      expect(api.deletePartialFile).not.toHaveBeenCalled();
      actor.stop();
    });

    it('no file on restore downloads without a network check', async () => {
      const api = makeApi();
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'downloading', pauseState: null });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.checkNetwork).not.toHaveBeenCalled();
      expect(api.startDownload).toHaveBeenCalled();
      actor.stop();
    });

    it('treats a throwing verify in checkingExisting as no file', async () => {
      const verifyDownload = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('boom');
        })
        .mockReturnValue(true);
      const api = makeApi({ verifyDownload });
      const actor = start(api);
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.startDownload).toHaveBeenCalled();
      expect(api.deletePartialFile).not.toHaveBeenCalled();
      actor.stop();
    });

    it('does not call runSmokeTest until the smoke-testing marker write finishes', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const persistDownloadState = jest.fn(async (record: { status: string }) => {
        if (record.status === 'smoke-testing') await gate;
      });
      const api = makeApi({ persistDownloadState });
      const actor = start(api);
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, () => persistDownloadState.mock.calls.some((c) => c[0].status === 'smoke-testing'), {
        timeout: 3000,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(api.runSmokeTest).not.toHaveBeenCalled();
      release();
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.runSmokeTest).toHaveBeenCalledTimes(1);
      actor.stop();
    });

    it('a rejecting smoke test reaches smokeFailed and keeps the file', async () => {
      const api = makeApi({ runSmokeTest: jest.fn(async () => { throw new Error('x'); }) });
      const actor = start(api);
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      expect(actor.getSnapshot().context.error?.code).toBe('smoke');
      expect(lastStatus(api)).toBe('smoke-failed');
      expect(api.deletePartialFile).not.toHaveBeenCalled();
      actor.stop();
    });

    it('{ ok: false } persists smoke-failed and uses the copy by memory', async () => {
      for (const low of [false, true]) {
        const api = makeApi({
          runSmokeTest: jest.fn(async () => ({ ok: false })),
          isLowMemoryFor: jest.fn(() => low),
        });
        const actor = start(api);
        actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
        await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
        const message = actor.getSnapshot().context.error?.message;
        expect(message).toBe(smokeFailureMessage('Fast & Light', low));
        expect(message).not.toContain('Try Fast & Light');
        expect(lastStatus(api)).toBe('smoke-failed');
        expect(api.deletePartialFile).not.toHaveBeenCalled();
        actor.stop();
      }
    });

    it('restoring smoke-testing goes to smokeFailed with the memory message', async () => {
      const api = makeApi();
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'smoke-testing', pauseState: null });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      expect(actor.getSnapshot().context.error?.code).toBe('smoke');
      expect(actor.getSnapshot().context.error?.message).toBe(smokeFailureMessage('Fast & Light', true));
      expect(lastStatus(api)).toBe('smoke-failed');
      expect(api.deletePartialFile).not.toHaveBeenCalled();
      expect(api.runSmokeTest).not.toHaveBeenCalled();
      actor.stop();
    });

    it('restoring smoke-failed does not run the smoke test until RETRY, then completes', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => true) });
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'smoke-failed', pauseState: null });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      expect(api.runSmokeTest).not.toHaveBeenCalled();
      actor.send({ type: 'RETRY' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.runSmokeTest).toHaveBeenCalledTimes(1);
      expect(api.startDownload).not.toHaveBeenCalled();
      actor.stop();
    });

    it('RETRY after the file is gone fails with verify and does not smoke test', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => false) });
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'smoke-failed', pauseState: null });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      actor.send({ type: 'RETRY' });
      await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
      expect(actor.getSnapshot().context.error?.code).toBe('verify');
      expect(lastStatus(api)).toBe('failed');
      expect(api.runSmokeTest).not.toHaveBeenCalled();
      actor.stop();
    });

    it('CHOOSE_ANOTHER deletes the file, clears state and returns to selecting', async () => {
      const api = makeApi();
      const actor = start(api);
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'smoke-failed', pauseState: null });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      actor.send({ type: 'CHOOSE_ANOTHER' });
      await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
      expect(api.deletePartialFile).toHaveBeenCalledWith('qwen3-4b-instruct-2507-q4_0.gguf');
      expect(api.clearDownloadState).toHaveBeenCalled();
      expect(actor.getSnapshot().context.modelId).toBeNull();
      actor.stop();
    });

    it('CHOOSE_ANOTHER never deletes the file when the model is the current working one', async () => {
      const api = makeApi();
      const actor = createActor(modelHubMachine, {
        input: { api, currentModelId: 'fast-light' },
      }).start();
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'smoke-testing', pauseState: null });
      await waitFor(actor, (s) => s.matches('smokeFailed'), { timeout: 3000 });
      actor.send({ type: 'CHOOSE_ANOTHER' });
      await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
      expect(api.deletePartialFile).not.toHaveBeenCalled();
      expect(api.clearDownloadState).toHaveBeenCalled();
      expect(actor.getSnapshot().context.modelId).toBeNull();
      actor.stop();
    });
  });

  it('completes, and clears the download state, only after the model identity write has finished', async () => {
    let finishSetPath!: () => void;
    const api = makeApi({
      setModelPath: jest.fn(() => new Promise<void>((r) => { finishSetPath = r; })),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await until(() => (api.setModelPath as jest.Mock).mock.calls.length > 0);
    expect(actor.getSnapshot().matches('smokeTest')).toBe(true);
    expect(api.clearDownloadState).not.toHaveBeenCalled();
    finishSetPath();
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.clearDownloadState).toHaveBeenCalled();
    actor.stop();
  });

  it('a failed identity write goes to failed (commit), not to an out-of-memory smoke failure', async () => {
    const api = makeApi({ setModelPath: jest.fn(async () => { throw new Error('disk I/O'); }) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('commit');
    const calls = (api.persistDownloadState as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][0].status).toBe('failed');
    expect(api.clearDownloadState).not.toHaveBeenCalled();
    actor.stop();
  });

  it('a smoke test outlives a closed hub: it still commits, and smokeTestSettled waits for it', async () => {
    let finishSmoke!: (r: { ok: boolean }) => void;
    const api = makeApi({
      runSmokeTest: jest.fn(() => new Promise<{ ok: boolean }>((r) => { finishSmoke = r; })),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('smokeTest'), { timeout: 3000 });
    await until(() => (api.runSmokeTest as jest.Mock).mock.calls.length > 0);
    actor.stop();

    let settled = false;
    const waiting = smokeTestSettled().then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    finishSmoke({ ok: true });
    await waiting;
    expect(api.setModelPath).toHaveBeenCalled();
    expect(api.clearDownloadState).toHaveBeenCalled();
  });

  it('a smoke failure after the hub closed records smoke-failed, never a stale smoke-testing marker', async () => {
    let finishSmoke!: (r: { ok: boolean }) => void;
    const api = makeApi({
      runSmokeTest: jest.fn(() => new Promise<{ ok: boolean }>((r) => { finishSmoke = r; })),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await until(() => (api.runSmokeTest as jest.Mock).mock.calls.length > 0);
    actor.stop();
    finishSmoke({ ok: false });
    await smokeTestSettled();
    const calls = (api.persistDownloadState as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][0].status).toBe('smoke-failed');
    expect(api.setModelPath).not.toHaveBeenCalled();
  });

  it('a completed resumed download clears its spent resume data', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
      verifyDownload: jest.fn(() => false),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused') && s.context.pauseState !== null, { timeout: 3000 });
    actor.send({ type: 'RESUME' });
    // Verify fails: RETRY must restart, not resume from spent data.
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pauseState).toBeNull();
    actor.stop();
  });

  it('disk-full failure routes RETRY back to selecting (not downloading)', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => {
        throw new Error('NSFileWriteOutOfSpaceError');
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('disk-full');
    actor.send({ type: 'RETRY' });
    await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
    actor.stop();
  });

  it('network failure routes RETRY back to downloading (resumable)', async () => {
    let attempt = 0;
    const api = makeApi({
      startDownload: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('The request failed because the network connection was lost');
        return true;
      }),
      pauseDownload: jest.fn(async () => ({ url: fastLight.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' })),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('network');
    actor.send({ type: 'RETRY' });
    await waitFor(actor, (s) => s.matches('selecting') || s.matches('downloading') || s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('unrecognized failures classify as unknown and keep the raw message', async () => {
    // Issue #91: any failure that is not provably disk-full or network used to
    // be reported as "check your connection", which misdirected users and hid
    // the real cause (e.g. the SDK 58 BigInt payload crash).
    const api = makeApi({
      startDownload: jest.fn(async () => {
        throw new Error('Cannot convert 100 to BigInt');
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('unknown');
    expect(actor.getSnapshot().context.error?.message).toBe('Cannot convert 100 to BigInt');
    // Only disk-full failures delete the partial file.
    expect(api.deletePartialFile).not.toHaveBeenCalled();
    actor.stop();
  });

  it('IMPORT_CUSTOM exits to customImport and IMPORT_SMOKE_OK completes onboarding', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    expect(actor.getSnapshot().matches('customImport')).toBe(true);
    actor.send({ type: 'IMPORT_SMOKE_OK' });
    expect(actor.getSnapshot().matches('complete')).toBe(true);
    actor.stop();
  });

  it('IMPORT_FAILED returns to selecting with an error message', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_FAILED', message: 'Could not load this file.' });
    expect(actor.getSnapshot().matches('selecting')).toBe(true);
    expect(actor.getSnapshot().context.error?.message).toBe('Could not load this file.');
    actor.stop();
  });

  it('SET_DISPLAY_NAME works from any state and does not block progress', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SET_DISPLAY_NAME', displayName: 'My Journal' });
    expect(actor.getSnapshot().context.displayName).toBe('My Journal');
    actor.stop();
  });

  it('retires the current model before starting a new download', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.retireCurrentModel).toHaveBeenCalledTimes(1);
    expect(api.setModelPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'smarter-slower' }));
    actor.stop();
  });

  it('does not retire when the selected model is already installed', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.retireCurrentModel).not.toHaveBeenCalled();
    actor.stop();
  });

  it('does not consult the network when retirement fails', async () => {
    const api = makeApi({ retireCurrentModel: jest.fn(async () => { throw new Error('locked'); }) });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(api.checkNetwork).not.toHaveBeenCalled();
    expect(api.startDownload).not.toHaveBeenCalled();
    actor.stop();
  });

  it('clears currentModelId once the outgoing model has actually been retired', async () => {
    // The file is gone the moment retireTask resolves, so the id must not
    // survive into the states that can still fail — it would render the deleted
    // model as Current and block the user from re-selecting it.
    const api = makeApi({
      startDownload: jest.fn(async () => { throw new Error('fetch failed'); }),
    });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.currentModelId).toBeNull();
    actor.send({ type: 'RETRY' });
    await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
    expect(actor.getSnapshot().context.currentModelId).toBeNull();
    actor.stop();
  });

  it('keeps currentModelId when retirement itself fails', async () => {
    // The file is still on disk here, so the id is still true and the row must
    // stay disabled rather than inviting a doomed re-download.
    const api = makeApi({ retireCurrentModel: jest.fn(async () => { throw new Error('locked'); }) });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.currentModelId).toBe('fast-light');
    expect(actor.getSnapshot().context.error?.message).toMatch(/nothing has changed/);
    actor.stop();
  });

  it('does not claim nothing changed when the file was retired but its identity was not cleared', async () => {
    // The file is gone; only the stored path and id outlived it. Telling the
    // user nothing has changed would be a lie about an irreversible action, and
    // currentModelId would go on rendering a deleted model as Current.
    const api = makeApi({ retireCurrentModel: jest.fn(async () => ({ identityCleared: false })) });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('retire');
    expect(actor.getSnapshot().context.error?.message).not.toMatch(/nothing has changed/);
    expect(actor.getSnapshot().context.error?.message).toMatch(/was removed/);
    expect(actor.getSnapshot().context.currentModelId).toBeNull();
    actor.stop();
  });

  it('lets a retry finish clearing the identity left stale by a retirement', async () => {
    // The second attempt finds no file to unlink (already gone) and only has to
    // clear the key, so it proceeds to the download the user wanted.
    let attempt = 0;
    const api = makeApi({
      retireCurrentModel: jest.fn(async () => {
        attempt += 1;
        return { identityCleared: attempt > 1 };
      }),
    });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.setModelPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'smarter-slower' }));
    actor.stop();
  });

  it('deletes the outgoing model file after a custom import succeeds', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_SMOKE_OK', retirePath: 'file:///old.gguf' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.deleteModelFile).toHaveBeenCalledWith('file:///old.gguf');
    actor.stop();
  });

  it('deletes nothing when there is no outgoing model', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_SMOKE_OK', retirePath: null });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.deleteModelFile).not.toHaveBeenCalled();
    actor.stop();
  });

  describe('restore, pause and resume (B1, B2, B6)', () => {
    const record = { url: fastLight.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

    it('restored pause with resume data stays paused and RESUME resumes it', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => true) });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'paused', pauseState: record });
      await tick();
      expect(actor.getSnapshot().matches('paused')).toBe(true);
      expect(actor.getSnapshot().context.pausedReason).toBe('restored');
      expect(api.pauseDownload).not.toHaveBeenCalled();
      expect(api.persistDownloadState).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }));
      actor.send({ type: 'RESUME' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.resumeDownload).toHaveBeenCalledWith(record, expect.any(Function));
      actor.stop();
    });

    it('restored pause with no pause state stays paused until RESUME starts fresh', async () => {
      const api = makeApi({ verifyDownload: jest.fn(() => true) });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'paused', pauseState: null });
      await tick();
      expect(actor.getSnapshot().matches('paused')).toBe(true);
      expect(api.startDownload).not.toHaveBeenCalled();
      actor.send({ type: 'RESUME' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.startDownload).toHaveBeenCalledTimes(1);
      expect(api.resumeDownload).not.toHaveBeenCalled();
      actor.stop();
    });

    it('a pause that returns null resumes with a fresh start', async () => {
      const api = makeApi({
        pauseDownload: jest.fn(async () => null),
        startDownload: jest.fn(async () => {
          await tick();
          return true;
        }),
      });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
      actor.send({ type: 'PAUSE' });
      await tick();
      expect(actor.getSnapshot().matches('paused')).toBe(true);
      actor.send({ type: 'RESUME' });
      await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
      expect(api.startDownload).toHaveBeenCalledTimes(2);
      expect(api.resumeDownload).not.toHaveBeenCalled();
      actor.stop();
    });

    it('stale resume data: a rejected resume fails, drops the pause state, and RETRY does not resume again', async () => {
      const api = makeApi({
        resumeDownload: jest.fn(async () => {
          throw new Error('no resumeData');
        }),
      });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'RESTORE_DOWNLOAD', modelId: 'fast-light', status: 'paused', pauseState: record });
      actor.send({ type: 'RESUME' });
      await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
      expect(actor.getSnapshot().context.pauseState).toBeNull();
      actor.send({ type: 'RETRY' });
      await tick();
      expect(api.resumeDownload).toHaveBeenCalledTimes(1);
      actor.stop();
    });

    it('checkNetworkActor rejection returns to selecting with a banner, and SELECT_MODEL works again', async () => {
      const checkNetwork = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue('offline');
      const api = makeApi({ checkNetwork, verifyDownload: jest.fn(() => false) });
      const actor = createActor(modelHubMachine, { input: { api, currentModelId: 'fast-light' } }).start();
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.error).toEqual({
        code: 'network',
        message: 'Could not check your connection. Try again.',
      });
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('awaitingWifi'), { timeout: 3000 });
      actor.stop();
    });

    it('pauseTask rejection lands in failed', async () => {
      const api = makeApi({
        pauseDownload: jest.fn(async () => {
          throw new Error('boom');
        }),
        startDownload: jest.fn(() => new Promise<boolean>(() => undefined)),
      });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
      actor.send({ type: 'PAUSE' });
      await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.error).toEqual({
        code: 'unknown',
        message: 'Could not pause the download. Try again.',
      });
      actor.stop();
    });

    it('verifyTask rejection lands in failed', async () => {
      const api = makeApi({
        verifyDownload: jest.fn(() => {
          throw new Error('boom');
        }),
      });
      const actor = createActor(modelHubMachine, { input: { api } }).start();
      actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
      await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.error).toEqual({
        code: 'verify',
        message: 'Could not check the downloaded file. Try again.',
      });
      actor.stop();
    });
  });
});
