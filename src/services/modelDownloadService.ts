import { Platform } from 'react-native';
import { DownloadTask, File, Paths } from 'expo-file-system';
import type { CuratedModel } from '@/catalog/modelManifest';
import { buildUserAgent } from '@/lib/buildUserAgent';
import { classifyDownloadError, coerceInt64, type DownloadErrorCode } from '@/lib/downloadErrorTaxonomy';
import type { TransferHandle } from '@/services/modelDownloadController';
import type { DownloadPauseStateRecord } from '@/services/modelDownloadState';

export type { DownloadErrorCode };
export { classifyDownloadError };

export type DownloadCallbacks = {
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
};

// The SDK's progress payload crosses the Int64→BigInt boundary; normalize here
// so nothing downstream ever handles a BigInt. See downloadErrorTaxonomy.
function normalizeProgress(
  onProgress: (data: { bytesWritten: number; totalBytes: number }) => void,
): (data: { bytesWritten: number; totalBytes: number }) => void {
  return (data) =>
    onProgress({ bytesWritten: coerceInt64(data.bytesWritten), totalBytes: coerceInt64(data.totalBytes) });
}

function freshDownload(url: string, dest: File, callbacks: DownloadCallbacks): TransferHandle {
  const task = new DownloadTask(url, dest, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress ? normalizeProgress(callbacks.onProgress) : undefined,
  });
  return { task, promise: task.downloadAsync(), kind: 'started' };
}

export function startDownload(model: CuratedModel, callbacks: DownloadCallbacks): TransferHandle {
  return freshDownload(model.hfUrl, new File(Paths.document, model.filename), callbacks);
}

function partialCoversOffset(pauseState: DownloadPauseStateRecord): boolean {
  const raw = pauseState.resumeData;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return false;
  const offset = Number(raw);
  try {
    const file = new File(pauseState.fileUri);
    return file.exists && coerceInt64(file.size) >= offset;
  } catch {
    return false;
  }
}

export function resumeDownload(
  pauseState: DownloadPauseStateRecord,
  callbacks: DownloadCallbacks,
): TransferHandle {
  // Android's resume does RandomAccessFile(dest).setLength(offset): a missing or
  // shorter partial is zero-filled up to the offset, and the size-only verify then
  // passes a corrupt file. Android resumeData is the partial's byte length as a
  // decimal string. iOS resume data references an OS-owned temp file (no
  // app-owned partial to check), so iOS is left unchanged.
  if (Platform.OS === 'android' && !partialCoversOffset(pauseState)) {
    const dest = new File(pauseState.fileUri);
    try {
      if (dest.exists) dest.delete();
    } catch (cause) {
      console.warn('[model-download] could not delete short partial', cause);
    }
    return freshDownload(pauseState.url, dest, callbacks);
  }
  const task = DownloadTask.fromSavable(pauseState, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress ? normalizeProgress(callbacks.onProgress) : undefined,
  });
  return { task, promise: task.resumeAsync(), kind: 'resumed' };
}

export function verifyDownload(file: File, model: CuratedModel): boolean {
  return file.exists && coerceInt64(file.size) === model.sizeBytes;
}

export function deletePartialFile(filename: string): void {
  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
}
