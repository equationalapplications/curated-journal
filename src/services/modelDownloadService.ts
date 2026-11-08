import { DownloadTask, File, Paths } from 'expo-file-system';
import type { CuratedModel } from '@/catalog/modelManifest';
import { buildUserAgent } from '@/lib/buildUserAgent';
import { classifyDownloadError, coerceInt64, type DownloadErrorCode } from '@/lib/downloadErrorTaxonomy';
import type { DownloadPauseStateRecord } from '@/services/modelDownloadState';

export type { DownloadErrorCode };
export { classifyDownloadError };

export type DownloadCallbacks = {
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
};

let activeTask: DownloadTask | null = null;

// The SDK's progress payload crosses the Int64→BigInt boundary; normalize here
// so nothing downstream ever handles a BigInt. See downloadErrorTaxonomy.
function normalizeProgress(
  onProgress: (data: { bytesWritten: number; totalBytes: number }) => void,
): (data: { bytesWritten: number; totalBytes: number }) => void {
  return (data) =>
    onProgress({ bytesWritten: coerceInt64(data.bytesWritten), totalBytes: coerceInt64(data.totalBytes) });
}

export async function startDownload(model: CuratedModel, callbacks: DownloadCallbacks): Promise<File | null> {
  const dest = new File(Paths.document, model.filename);
  activeTask = new DownloadTask(model.hfUrl, dest, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress ? normalizeProgress(callbacks.onProgress) : undefined,
  });
  return activeTask.downloadAsync();
}

export async function pauseDownload(): Promise<DownloadPauseStateRecord> {
  if (!activeTask) throw new Error('No active download to pause');
  await activeTask.pauseAsync();
  return activeTask.savable();
}

export async function resumeDownload(
  pauseState: DownloadPauseStateRecord,
  callbacks: DownloadCallbacks,
): Promise<File | null> {
  activeTask = DownloadTask.fromSavable(pauseState, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress ? normalizeProgress(callbacks.onProgress) : undefined,
  });
  return activeTask.resumeAsync();
}

export function cancelActiveDownload(): void {
  activeTask?.cancel();
  activeTask = null;
}

export function verifyDownload(file: File, model: CuratedModel): boolean {
  return file.exists && coerceInt64(file.size) === model.sizeBytes;
}

export function deletePartialFile(filename: string): void {
  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
}
