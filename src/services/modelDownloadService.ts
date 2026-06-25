import { DownloadTask, File, Paths } from 'expo-file-system';
import type { CuratedModel } from '@/catalog/modelManifest';
import { buildUserAgent } from '@/lib/buildUserAgent';
import type { DownloadPauseStateRecord } from '@/services/modelDownloadState';

export type DownloadErrorCode = 'disk-full' | 'network';

export type DownloadCallbacks = {
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
};

let activeTask: DownloadTask | null = null;

export function classifyDownloadError(error: unknown): DownloadErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC|NSFileWriteOutOfSpaceError/.test(message)) return 'disk-full';
  return 'network';
}

export async function startDownload(model: CuratedModel, callbacks: DownloadCallbacks): Promise<File | null> {
  const dest = new File(Paths.document, model.filename);
  activeTask = new DownloadTask(model.hfUrl, dest, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress,
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
    onProgress: callbacks.onProgress,
  });
  return activeTask.resumeAsync();
}

export function cancelActiveDownload(): void {
  activeTask?.cancel();
  activeTask = null;
}

export function verifyDownload(file: File, model: CuratedModel): boolean {
  return file.exists && file.size === model.sizeBytes;
}

export function deletePartialFile(filename: string): void {
  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
}
