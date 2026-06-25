import { File, Paths } from 'expo-file-system';
import { createModelHubApi } from '@/hooks/useModelHub';
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

  it('persistDownloadState and clearDownloadState delegate to the injected store', async () => {
    const store = makeStore();
    const api = createModelHubApi(store as never);
    await api.persistDownloadState({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    expect(store.set).toHaveBeenCalledWith({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    await api.clearDownloadState();
    expect(store.clear).toHaveBeenCalled();
  });
});
