/**
 * Builds a `ModelHubApi` whose `downloads` is a REAL controller over an in-memory
 * store and a stub transfer driver. The driver's transfers are scripted with the
 * same functions the pre-controller tests mocked (`startDownload`, `resumeDownload`,
 * `pauseDownload`), and row writes surface as `persistDownloadState` /
 * `clearDownloadState` mocks, so those suites keep their assertions and change
 * only their mocks (spec T-H10).
 */
import { getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import type { ModelHubApi } from '@/machines/modelHubMachine';
import {
  createModelDownloadController,
  type ModelDownloadController,
  type StoreLike,
  type TransferDriver,
} from '@/services/modelDownloadController';
import type { DownloadPauseStateRecord, ModelDownloadStatus } from '@/services/modelDownloadState';

type Progress = { bytesWritten: number; totalBytes: number };
type Row = { modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null };

export type HubApiOverrides = Partial<Omit<ModelHubApi, 'downloads'>> & {
  startDownload?: (model: CuratedModel, onProgress: (p: Progress) => void) => Promise<boolean>;
  resumeDownload?: (pauseState: DownloadPauseStateRecord, onProgress: (p: Progress) => void) => Promise<boolean>;
  pauseDownload?: () => Promise<DownloadPauseStateRecord | null>;
  persistDownloadState?: (record: Row) => Promise<void>;
  clearDownloadState?: () => Promise<void>;
  /** The row the store holds before the first load. */
  initialRow?: Row | null;
  gate?: (modelId: CuratedModelId, op: 'start' | 'resume') => { allowed: true } | { allowed: false; reason: string };
};

const DEFAULT_PAUSE: DownloadPauseStateRecord = {
  url: 'https://huggingface.co/x/resolve/main/f.gguf',
  fileUri: 'file:///f.gguf',
  isDirectory: false,
  resumeData: 'rd',
};

export function makeHubApi(overrides: HubApiOverrides = {}) {
  const {
    startDownload: startImpl = jest.fn(async () => true),
    resumeDownload: resumeImpl = jest.fn(async () => true),
    pauseDownload: pauseImpl = jest.fn(async () => DEFAULT_PAUSE),
    persistDownloadState: persistImpl = jest.fn(async () => undefined),
    clearDownloadState: clearImpl = jest.fn(async () => undefined),
    initialRow = null,
    gate,
    ...apiOverrides
  } = overrides;
  const startDownload = jest.fn(startImpl);
  const resumeDownload = jest.fn(resumeImpl);
  const pauseDownload = jest.fn(pauseImpl);
  const persistDownloadState = jest.fn(persistImpl);
  const clearDownloadState = jest.fn(clearImpl);
  let row: Row | null = initialRow;

  const store: StoreLike = {
    get: async () => row,
    set: async (record) => {
      await persistDownloadState(record);
      row = { ...record };
    },
    clear: async () => {
      await clearDownloadState();
      row = null;
    },
  };

  function stubTransfer(
    promise: Promise<boolean>,
    pause: () => Promise<DownloadPauseStateRecord | null>,
    kind: 'started' | 'resumed',
    fileUri: string,
  ) {
    let state: string = 'active';
    let saved: DownloadPauseStateRecord | null = null;
    const done = promise.then(
      (ok) => {
        if (state === 'active') state = ok ? 'completed' : 'paused';
        return ok ? { uri: fileUri } : null;
      },
      (error) => {
        if (state === 'active') state = 'error';
        throw error;
      },
    );
    const task = {
      get state() {
        return state;
      },
      pause: () => undefined,
      pauseAsync: async () => {
        saved = await pause(); // a rejection leaves the task active
        state = 'paused';
      },
      cancel: () => {
        if (state === 'active') state = 'cancelled';
      },
      release: () => undefined,
      savable: () => ({ ...(saved ?? DEFAULT_PAUSE), resumeData: saved?.resumeData }) as DownloadPauseStateRecord,
      addListener: () => ({ remove: () => undefined }),
    };
    return { task, promise: done, kind };
  }

  const driver: TransferDriver = {
    platform: 'android',
    start: (modelId, { onProgress }) =>
      stubTransfer(startDownload(getCuratedModel(modelId), onProgress), pauseDownload, 'started', 'file:///f.gguf'),
    resume: (_modelId, pauseState, { onProgress }) =>
      stubTransfer(resumeDownload(pauseState, onProgress), pauseDownload, 'resumed', pauseState.fileUri),
    onAppState: (listener) => {
      listener('active');
      return () => undefined;
    },
  };

  const downloads: ModelDownloadController = createModelDownloadController({
    driver,
    store,
    timers: {
      setTimeout: (fn, ms) => {
        const handle = setTimeout(fn, ms);
        (handle as { unref?: () => void }).unref?.();
        return handle;
      },
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    gate,
  });

  const api = {
    downloads,
    checkNetwork: jest.fn(async () => 'wifi' as const),
    verifyDownload: jest.fn().mockReturnValueOnce(false).mockReturnValue(true),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    setModelPath: jest.fn(async () => undefined),
    retireCurrentModel: jest.fn(async () => ({ identityCleared: true })),
    deleteModelFile: jest.fn(async () => undefined),
    isLowMemoryFor: jest.fn(() => false),
    deleteOrphanedModelFiles: jest.fn(async () => undefined),
    ...apiOverrides,
  };
  return Object.assign(api, {
    seedRow: (r: Row | null) => {
      row = r;
    },
    startDownload,
    resumeDownload,
    pauseDownload,
    persistDownloadState,
    clearDownloadState,
  }) as ModelHubApi & {
    startDownload: typeof startDownload;
    resumeDownload: typeof resumeDownload;
    pauseDownload: typeof pauseDownload;
    persistDownloadState: typeof persistDownloadState;
    clearDownloadState: typeof clearDownloadState;
    seedRow: (row: Row | null) => void;
  };
}
