import { DownloadTask, File } from 'expo-file-system';
import {
  startDownload,
  pauseDownload,
  resumeDownload,
  verifyDownload,
  classifyDownloadError,
} from '@/services/modelDownloadService';
import type { CuratedModel } from '@/catalog/modelManifest';

jest.mock('expo-file-system', () => {
  const mockTaskInstances: Record<string, unknown> = {};
  return {
    File: jest.fn().mockImplementation((...args: unknown[]) => ({
      uri: 'file:///doc/test.gguf',
      exists: true,
      size: 2393231072,
      delete: jest.fn(),
      __args: args,
    })),
    Paths: { document: 'file:///doc' },
    DownloadTask: jest.fn().mockImplementation(function (
      this: Record<string, unknown>,
      url: string,
      _dest: unknown,
      options: { onProgress?: (p: { bytesWritten: number; totalBytes: number }) => void },
    ) {
      this.downloadAsync = jest.fn(async () => {
        options.onProgress?.({ bytesWritten: 2393231072, totalBytes: 2393231072 });
        return { uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() };
      });
      this.pauseAsync = jest.fn(async () => undefined);
      this.resumeAsync = jest.fn(async () => ({ uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() }));
      this.savable = jest.fn(() => ({ url, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' }));
      mockTaskInstances[url] = this;
    }),
  };
});

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

describe('modelDownloadService', () => {
  it('starts a download with the User-Agent header and reports progress', async () => {
    const onProgress = jest.fn();
    const file = await startDownload(model, { onProgress });
    expect(file?.size).toBe(2393231072);
    expect(onProgress).toHaveBeenCalledWith({ bytesWritten: 2393231072, totalBytes: 2393231072 });
    const ctorCall = jest.mocked(DownloadTask).mock.calls.at(-1)!;
    const options = ctorCall[2] as { headers?: Record<string, string> };
    expect(options.headers?.['User-Agent']).toMatch(/^CuratedJournal\//);
  });

  it('pauseDownload returns a savable pause state', async () => {
    await startDownload(model, {});
    const pauseState = await pauseDownload();
    expect(pauseState).toEqual({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' });
  });

  it('resumeDownload restores from saved state via DownloadTask.fromSavable', async () => {
    const fromSavable = jest.fn().mockReturnValue({
      resumeAsync: jest.fn(async () => ({ uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() })),
      pauseAsync: jest.fn(async () => undefined),
      savable: jest.fn(() => ({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false })),
    });
    (DownloadTask as unknown as { fromSavable: typeof fromSavable }).fromSavable = fromSavable;
    const file = await resumeDownload({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' }, {});
    expect(fromSavable).toHaveBeenCalled();
    expect(file?.size).toBe(2393231072);
  });

  it('verifyDownload passes when file.size matches manifest.sizeBytes', () => {
    const file = new File('file:///doc/f.gguf') as unknown as File;
    expect(verifyDownload(file, model)).toBe(true);
  });

  it('verifyDownload fails when sizes mismatch', () => {
    const file = { exists: true, size: 1 } as unknown as File;
    expect(verifyDownload(file, model)).toBe(false);
  });

  it('classifyDownloadError recognizes iOS disk-full', () => {
    expect(classifyDownloadError(new Error('NSFileWriteOutOfSpaceError'))).toBe('disk-full');
  });

  it('classifyDownloadError recognizes Android disk-full', () => {
    expect(classifyDownloadError(new Error('ENOSPC: no space left on device'))).toBe('disk-full');
  });

  it('classifyDownloadError defaults unknown errors to network', () => {
    expect(classifyDownloadError(new Error('fetch failed'))).toBe('network');
  });
});
