/**
 * RED reproductions for the model download controller spec (S1 to S5), written
 * against #125's service and machine (the old ModelHubApi, `pauseDownload`,
 * `activeTask`). Every test here FAILS on that baseline. They are replaced by
 * the T-H / T-C tests once the controller lands (see the spec's Verification).
 */
import { createActor, waitFor } from 'xstate';
import { modelHubMachine, type ModelHubApi } from '@/machines/modelHubMachine';
import type { CuratedModel } from '@/catalog/modelManifest';

const mockTasks: Array<Record<string, jest.Mock | string>> = [];
let mockNextTask: () => Record<string, jest.Mock | string>;

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ uri: 'file:///doc/f.gguf', exists: true, size: 1, delete: jest.fn() })),
  Paths: { document: 'file:///doc' },
  DownloadTask: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, mockNextTask());
    mockTasks.push(this as Record<string, jest.Mock | string>);
  }),
}));

import { startDownload, pauseDownload } from '@/services/modelDownloadService';

const model: CuratedModel = {
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
const P = { url: model.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function makeApi(overrides: Partial<ModelHubApi> = {}): ModelHubApi {
  return {
    checkNetwork: jest.fn(async () => 'wifi' as const),
    startDownload: jest.fn(() => new Promise<boolean>(() => undefined)),
    resumeDownload: jest.fn(() => new Promise<boolean>(() => undefined)),
    pauseDownload: jest.fn(async () => P),
    verifyDownload: jest.fn(() => true),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    persistDownloadState: jest.fn(async () => undefined),
    clearDownloadState: jest.fn(async () => undefined),
    setModelPath: jest.fn(async () => undefined),
    retireCurrentModel: jest.fn(async () => ({ identityCleared: true })),
    deleteModelFile: jest.fn(async () => undefined),
    isLowMemoryFor: jest.fn(() => false),
    deleteOrphanedModelFiles: jest.fn(async () => undefined),
    readDownloadModelId: jest.fn(async () => null),
    ...overrides,
  };
}

beforeEach(() => {
  mockTasks.length = 0;
  mockNextTask = () => ({
    downloadAsync: jest.fn(() => new Promise(() => undefined)),
    pauseAsync: jest.fn(async () => undefined),
    cancel: jest.fn(),
    savable: jest.fn(() => P),
    state: 'active',
  });
});

describe('RED: #125 baseline races', () => {
  it('S1 (#127): APP_FOREGROUND during the background pause keeps the pause state and resumes from it', async () => {
    let settlePause!: (p: typeof P) => void;
    const api = makeApi({ pauseDownload: jest.fn(() => new Promise<typeof P>((r) => (settlePause = r))) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'APP_BACKGROUND' });
    actor.send({ type: 'APP_FOREGROUND' });
    settlePause(P);
    await tick(50);
    expect(api.resumeDownload).toHaveBeenCalledWith(P, expect.any(Function));
    actor.stop();
  });

  it('S2 (#127): the machine is not Paused (no Resume) while the pause is still in flight', async () => {
    const api = makeApi({ pauseDownload: jest.fn(() => new Promise<typeof P>(() => undefined)) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await tick();
    expect(actor.getSnapshot().value).not.toBe('paused');
    actor.stop();
  });

  it('S3 (#132): a pause that rejects while the task is active cancels the transfer', async () => {
    mockNextTask = () => ({
      downloadAsync: jest.fn(() => new Promise(() => undefined)),
      pauseAsync: jest.fn(async () => {
        throw new Error('pause failed');
      }),
      cancel: jest.fn(),
      savable: jest.fn(() => P),
      state: 'active',
    });
    void startDownload(model, {});
    await expect(pauseDownload()).rejects.toThrow();
    expect(mockTasks[0].cancel).toHaveBeenCalled();
  });

  it('S4: a completion during the pause goes on to verify, not to "Could not pause"', async () => {
    // The service's pauseDownload() throws from savable() on a completed task.
    const api = makeApi({
      pauseDownload: jest.fn(async () => {
        throw new Error('Cannot call savable() in state "completed"');
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await tick(50);
    expect(actor.getSnapshot().matches('failed')).toBe(false);
    actor.stop();
  });

  it('S5: a second start while a transfer is live does not create a second task', async () => {
    void startDownload(model, {});
    void startDownload(model, {});
    expect(mockTasks).toHaveLength(1);
  });
});
