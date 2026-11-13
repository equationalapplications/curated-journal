import { File, Paths } from 'expo-file-system';
import { createModelHubApi, toRestoreState, ModelHubProvider } from '@/hooks/useModelHub';
import { deleteOrphanedCuratedModelFiles } from '@/services/modelFiles';
import { AppState } from 'react-native';
import { createElement } from 'react';
import { render } from '@testing-library/react-native';
import * as Device from 'expo-device';
import * as networkGate from '@/lib/networkGate';
import * as downloadService from '@/services/modelDownloadService';
import * as smokeTest from '@/lib/modelSmokeTest';
import * as entityStorage from '@/lib/entityStorage';
import type { CuratedModel } from '@/catalog/modelManifest';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((..._args: unknown[]) => ({ exists: true, size: 2393231072, delete: jest.fn() })),
  Paths: { document: 'file:///doc' },
}));
jest.mock('@/lib/networkGate');
jest.mock('@/services/modelDownloadService');
jest.mock('@/lib/modelSmokeTest');
jest.mock('@/lib/entityStorage');
jest.mock('@/services/modelFiles', () => ({ deleteOrphanedCuratedModelFiles: jest.fn() }));
const mockSent: unknown[] = [];
jest.mock('xstate', () => {
  const actual = jest.requireActual('xstate');
  return {
    ...actual,
    createActor: (...args: unknown[]) => {
      const actor = actual.createActor(...args);
      const send = actor.send.bind(actor);
      actor.send = (e: unknown) => {
        mockSent.push(e);
        return send(e);
      };
      return actor;
    },
  };
});
jest.mock('expo-device', () => ({ totalMemory: null }));

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

function makeStore() {
  return {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  };
}

describe('createModelHubApi', () => {
  it('checkNetwork delegates to networkGate.checkNetworkGate', async () => {
    jest.mocked(networkGate.checkNetworkGate).mockResolvedValueOnce('wifi');
    const api = createModelHubApi(makeStore() as never);
    await expect(api.checkNetwork()).resolves.toBe('wifi');
  });

  it('startDownload returns true when the service resolves a File, false when it resolves null', async () => {
    const api = createModelHubApi(makeStore() as never);
    jest.mocked(downloadService.startDownload).mockResolvedValueOnce({ size: 1 } as unknown as File);
    await expect(api.startDownload(model, jest.fn())).resolves.toBe(true);
    jest.mocked(downloadService.startDownload).mockResolvedValueOnce(null);
    await expect(api.startDownload(model, jest.fn())).resolves.toBe(false);
  });

  it('verifyDownload constructs a File from Paths.document + filename and delegates', () => {
    jest.mocked(downloadService.verifyDownload).mockReturnValueOnce(true);
    const api = createModelHubApi(makeStore() as never);
    expect(api.verifyDownload(model)).toBe(true);
    expect(File).toHaveBeenCalledWith(Paths.document, 'f.gguf');
  });

  it('runSmokeTest builds modelPath from Paths.document + filename', async () => {
    jest.mocked(smokeTest.runModelSmokeTest).mockResolvedValueOnce({ ok: true });
    const api = createModelHubApi(makeStore() as never);
    const result = await api.runSmokeTest(model);
    expect(result).toEqual({ ok: true });
    expect(smokeTest.runModelSmokeTest).toHaveBeenCalledWith(
      expect.objectContaining({ llamaConfig: model.llamaConfig }),
    );
  });

  it('setModelPath persists both the file uri and the model id', async () => {
    const api = createModelHubApi(makeStore() as never);
    await api.setModelPath(model);
    expect(entityStorage.setModelPath).toHaveBeenCalled();
    expect(entityStorage.setModelId).toHaveBeenCalledWith('fast-light');
  });

  it('setModelPath puts the previous path back when the id write fails', async () => {
    jest.mocked(entityStorage.getModelPath).mockResolvedValueOnce('file:///doc/old.gguf');
    jest.mocked(entityStorage.setModelId).mockRejectedValueOnce(new Error('disk I/O'));
    const api = createModelHubApi(makeStore() as never);
    await expect(api.setModelPath(model)).rejects.toThrow('disk I/O');
    expect(jest.mocked(entityStorage.setModelPath).mock.calls.at(-1)).toEqual(['file:///doc/old.gguf']);
  });

  it('setModelPath clears the identity when there was no previous model and the id write fails', async () => {
    jest.mocked(entityStorage.getModelPath).mockResolvedValueOnce(null);
    jest.mocked(entityStorage.setModelId).mockRejectedValueOnce(new Error('disk I/O'));
    const api = createModelHubApi(makeStore() as never);
    await expect(api.setModelPath(model)).rejects.toThrow('disk I/O');
    expect(entityStorage.clearModelPath).toHaveBeenCalled();
  });

  it('deletePartialFile never throws into the machine', () => {
    jest.mocked(downloadService.deletePartialFile).mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = createModelHubApi(makeStore() as never);
    expect(() => api.deletePartialFile('f.gguf')).not.toThrow();
    warn.mockRestore();
  });

  it('persistDownloadState and clearDownloadState delegate to the injected store', async () => {
    const store = makeStore();
    const api = createModelHubApi(store as never);
    await api.persistDownloadState({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    expect(store.set).toHaveBeenCalledWith({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    await api.clearDownloadState();
    expect(store.clear).toHaveBeenCalled();
  });
});

describe('toRestoreState', () => {
  it.each(['downloading', 'paused', 'smoke-testing', 'smoke-failed'] as const)('returns state for %s', (status) => {
    expect(toRestoreState({ modelId: 'fast-light', status, pauseState: null })).toEqual({
      modelId: 'fast-light',
      status,
      pauseState: null,
    });
  });

  it('treats a smoke-testing row for the already-current model as a pass, not a kill', () => {
    expect(
      toRestoreState({ modelId: 'fast-light', status: 'smoke-testing', pauseState: null }, 'fast-light'),
    ).toBeNull();
    // A different current model: still a kill to restore.
    expect(
      toRestoreState({ modelId: 'fast-light', status: 'smoke-testing', pauseState: null }, 'smarter-slower'),
    ).toEqual({ modelId: 'fast-light', status: 'smoke-testing', pauseState: null });
  });

  it('returns null for idle, failed, unknown status, null or removed model', () => {
    expect(toRestoreState(null)).toBeNull();
    expect(toRestoreState({ modelId: 'fast-light', status: 'idle', pauseState: null })).toBeNull();
    expect(toRestoreState({ modelId: 'fast-light', status: 'failed', pauseState: null })).toBeNull();
    expect(toRestoreState({ modelId: 'fast-light', status: 'weird' as never, pauseState: null })).toBeNull();
    expect(toRestoreState({ modelId: null, status: 'paused', pauseState: null })).toBeNull();
    expect(toRestoreState({ modelId: 'removed-model', status: 'paused', pauseState: null })).toBeNull();
  });
});

describe('createModelHubApi memory and orphan wiring', () => {
  const GiB = 1024 ** 3;
  const big = { ...model, minComfortableRamBytes: 5 * GiB };
  it('isLowMemoryFor follows device memory', () => {
    const api = createModelHubApi(makeStore() as never);
    (Device as { totalMemory: number | null }).totalMemory = 3 * GiB;
    expect(api.isLowMemoryFor(big)).toBe(true);
    (Device as { totalMemory: number | null }).totalMemory = 8 * GiB;
    expect(api.isLowMemoryFor(big)).toBe(false);
    (Device as { totalMemory: number | null }).totalMemory = null;
    expect(api.isLowMemoryFor(big)).toBe(false);
  });

  it('deleteOrphanedModelFiles passes the keep id and stored path', async () => {
    jest.mocked(entityStorage.getModelPath).mockResolvedValueOnce('file:///doc/cur.gguf');
    const api = createModelHubApi(makeStore() as never);
    await api.deleteOrphanedModelFiles('fast-light');
    expect(deleteOrphanedCuratedModelFiles).toHaveBeenCalledWith({
      keepModelId: 'fast-light',
      currentModelPath: 'file:///doc/cur.gguf',
    });
  });
});

describe('deleteOrphanedModelFiles with an unknown current path', () => {
  it('skips cleanup and resolves when getModelPath rejects', async () => {
    jest.mocked(deleteOrphanedCuratedModelFiles).mockClear();
    jest.mocked(entityStorage.getModelPath).mockRejectedValueOnce(new Error('storage'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const api = createModelHubApi(makeStore() as never);
    await expect(api.deleteOrphanedModelFiles('fast-light')).resolves.toBeUndefined();
    expect(deleteOrphanedCuratedModelFiles).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('ModelHubProvider AppState', () => {
  it('sends APP_BACKGROUND only on background and APP_FOREGROUND on active', async () => {
    let handler: (s: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
      handler = h;
      return { remove: jest.fn() };
    }) as never);
    const api = createModelHubApi(makeStore() as never);
    await render(createElement(ModelHubProvider, { api, currentModelId: null, children: null }));
    mockSent.length = 0;
    handler('inactive');
    expect(mockSent).toEqual([]);
    handler('background');
    expect(mockSent).toEqual([{ type: 'APP_BACKGROUND' }]);
    handler('active');
    expect(mockSent).toEqual([{ type: 'APP_BACKGROUND' }, { type: 'APP_FOREGROUND' }]);
  });
});
