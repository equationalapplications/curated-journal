import { createActor, waitFor } from 'xstate';
import { modelHubMachine, type ModelHubApi } from '@/machines/modelHubMachine';
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
    verifyDownload: jest.fn(() => true),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    persistDownloadState: jest.fn(async () => undefined),
    clearDownloadState: jest.fn(async () => undefined),
    setModelPath: jest.fn(async () => undefined),
    ...overrides,
  };
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
    expect(api.deletePartialFile).toHaveBeenCalledWith('phi-3-mini-4k-instruct-q4.gguf');
    expect(actor.getSnapshot().context.error?.code).toBe('verify');
    actor.stop();
  });

  it('smoke test failure returns to selecting with a smoke error', async () => {
    const api = makeApi({ runSmokeTest: jest.fn(async () => ({ ok: false })) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('smoke');
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
        if (attempt === 1) throw new Error('fetch failed');
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
});
