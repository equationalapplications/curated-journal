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

  it('pauseDownload resolves null when savable has no resumeData', async () => {
    await startDownload(model, {});
    const task = jest.mocked(DownloadTask).mock.instances.at(-1) as unknown as { savable: jest.Mock };
    task.savable.mockReturnValueOnce({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false });
    await expect(pauseDownload()).resolves.toBeNull();
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

  // SDK 58 delivers Int64 natives (File.size, progress payload fields) as BigInt
  // across the JSI boundary even though the typed contract says number. The
  // service must normalize so no consumer sees a BigInt (BigInt === number is
  // always false, and mixing BigInt with number arithmetic throws).
  it('verifyDownload passes when file.size is a BigInt equal to sizeBytes', () => {
    const file = { exists: true, size: 2393231072n } as unknown as File;
    expect(verifyDownload(file, model)).toBe(true);
  });

  it('verifyDownload fails when file.size is a BigInt that mismatches sizeBytes', () => {
    const file = { exists: true, size: 1n } as unknown as File;
    expect(verifyDownload(file, model)).toBe(false);
  });

  it('verifyDownload fails when file.size is null (closed handle)', () => {
    const file = { exists: true, size: null } as unknown as File;
    expect(verifyDownload(file, model)).toBe(false);
  });

  it('normalizes BigInt progress payloads from the native layer to plain numbers', async () => {
    const onProgress = jest.fn();
    // Re-run with the task emitting the raw SDK 58 payload: Int64 values arrive
    // as BigInt at runtime.
    jest.mocked(DownloadTask).mockImplementationOnce(function (
      this: Record<string, unknown>,
      url: string,
      _dest: unknown,
      options: { onProgress?: (p: { bytesWritten: unknown; totalBytes: unknown }) => void },
    ) {
      this.downloadAsync = jest.fn(async () => {
        options.onProgress?.({ bytesWritten: 100n, totalBytes: 200n });
        return { uri: 'file:///doc/test.gguf', exists: true, size: 2393231072n, delete: jest.fn() };
      });
      this.pauseAsync = jest.fn(async () => undefined);
      this.resumeAsync = jest.fn(async () => undefined);
      this.savable = jest.fn(() => ({ url, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' }));
      void url;
    });
    const file = await startDownload(model, { onProgress });
    expect(file).not.toBeNull();
    expect(onProgress).toHaveBeenCalledWith({ bytesWritten: 100, totalBytes: 200 });
    expect(typeof onProgress.mock.calls[0][0].bytesWritten).toBe('number');
    expect(typeof onProgress.mock.calls[0][0].totalBytes).toBe('number');
  });

  it('classifyDownloadError recognizes iOS disk-full', () => {
    expect(classifyDownloadError(new Error('NSFileWriteOutOfSpaceError'))).toBe('disk-full');
  });

  it('classifyDownloadError recognizes Android disk-full', () => {
    expect(classifyDownloadError(new Error('ENOSPC: no space left on device'))).toBe('disk-full');
  });

  it('classifyDownloadError keeps genuine connection failures as network', () => {
    expect(classifyDownloadError(new Error('The request failed because the network connection was lost'))).toBe('network');
    expect(classifyDownloadError(new Error('Error Domain=NSURLErrorDomain Code=-1009 "appears to be offline"'))).toBe('network');
    expect(classifyDownloadError(new Error('request timed out'))).toBe('network');
  });

  it('classifyDownloadError reports unrecognized failures as unknown, not network', () => {
    // The exact error surfaced by the SDK 58 BigInt payload bug (issue #91):
    // every non-disk, non-network failure used to be misreported to users as
    // "check your connection".
    expect(classifyDownloadError(new Error('Cannot convert 100 to BigInt'))).toBe('unknown');
    expect(classifyDownloadError(new Error('fetch failed'))).toBe('unknown');
  });
});
