import { assign, fromCallback, fromPromise, setup } from 'xstate';
import { getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import type { NetworkGateState } from '@/lib/networkGate';
import type { DownloadPauseStateRecord, ModelDownloadStatus } from '@/services/modelDownloadState';

export type ModelHubMachineEvents =
  | { type: 'SELECT_MODEL'; modelId: CuratedModelId }
  | { type: 'IMPORT_CUSTOM' }
  | { type: 'CHECK_NETWORK' }
  | { type: 'CELLULAR_CONFIRM' }
  | { type: 'CELLULAR_CANCEL' }
  | { type: 'DOWNLOAD_PROGRESS'; bytesWritten: number; totalBytes: number }
  | { type: 'DOWNLOAD_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'APP_BACKGROUND' }
  | { type: 'APP_FOREGROUND' }
  | { type: 'FAIL'; code: 'network' | 'disk-full'; message: string }
  | { type: 'RETRY' }
  | { type: 'IMPORT_SMOKE_OK' }
  | { type: 'IMPORT_FAILED'; message: string }
  | { type: 'SET_DISPLAY_NAME'; displayName: string }
  | {
      type: 'RESTORE_DOWNLOAD';
      modelId: CuratedModelId;
      status: 'downloading' | 'paused';
      pauseState: DownloadPauseStateRecord | null;
    };

export type ModelHubApi = {
  checkNetwork: () => Promise<NetworkGateState>;
  startDownload: (
    model: CuratedModel,
    onProgress: (p: { bytesWritten: number; totalBytes: number }) => void,
  ) => Promise<boolean>;
  resumeDownload: (
    pauseState: DownloadPauseStateRecord,
    onProgress: (p: { bytesWritten: number; totalBytes: number }) => void,
  ) => Promise<boolean>;
  pauseDownload: () => Promise<DownloadPauseStateRecord>;
  verifyDownload: (model: CuratedModel) => boolean;
  deletePartialFile: (filename: string) => void;
  runSmokeTest: (model: CuratedModel) => Promise<{ ok: boolean }>;
  persistDownloadState: (record: {
    modelId: CuratedModelId | null;
    status: ModelDownloadStatus;
    pauseState: DownloadPauseStateRecord | null;
  }) => Promise<void>;
  clearDownloadState: () => Promise<void>;
  setModelPath: (model: CuratedModel) => Promise<void>;
};

export type ModelHubMachineInput = { api: ModelHubApi };

type ErrorCode = 'network' | 'disk-full' | 'verify' | 'smoke';

type Context = {
  api: ModelHubApi;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: ErrorCode; message: string } | null;
  pauseState: DownloadPauseStateRecord | null;
  pausedReason: 'user' | 'background' | null;
  displayName: string | null;
};

export const modelHubMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ModelHubMachineEvents,
    input: {} as ModelHubMachineInput,
  },
  actors: {
    checkNetworkActor: fromPromise(async ({ input }: { input: { api: ModelHubApi } }) =>
      input.api.checkNetwork(),
    ),
    runDownload: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: ModelHubMachineEvents) => void;
        input: { api: ModelHubApi; model: CuratedModel; pauseState: DownloadPauseStateRecord | null };
      }) => {
        let cancelled = false;
        const onProgress = (p: { bytesWritten: number; totalBytes: number }) => {
          if (!cancelled) {
            sendBack({ type: 'DOWNLOAD_PROGRESS', bytesWritten: p.bytesWritten, totalBytes: p.totalBytes });
          }
        };
        (async () => {
          try {
            const completed = input.pauseState
              ? await input.api.resumeDownload(input.pauseState, onProgress)
              : await input.api.startDownload(input.model, onProgress);
            if (!cancelled && completed) sendBack({ type: 'DOWNLOAD_COMPLETE' });
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error);
              const code: 'network' | 'disk-full' = /ENOSPC|NSFileWriteOutOfSpaceError/.test(message)
                ? 'disk-full'
                : 'network';
              sendBack({ type: 'FAIL', code, message });
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      },
    ),
    pauseTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; modelId: CuratedModelId | null } }) => {
        const pauseState = await input.api.pauseDownload();
        await input.api.persistDownloadState({ modelId: input.modelId, status: 'paused', pauseState });
        return pauseState;
      },
    ),
    verifyTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) =>
        input.api.verifyDownload(input.model),
    ),
    smokeTestTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) =>
        input.api.runSmokeTest(input.model),
    ),
  },
}).createMachine({
  id: 'modelHub',
  initial: 'selecting',
  context: ({ input }) => ({
    api: input.api,
    modelId: null,
    progress: { bytesWritten: 0, totalBytes: -1 },
    error: null,
    pauseState: null,
    pausedReason: null,
    displayName: null,
  }),
  on: {
    SET_DISPLAY_NAME: { actions: assign({ displayName: ({ event }) => event.displayName }) },
  },
  states: {
    selecting: {
      on: {
        SELECT_MODEL: {
          target: 'confirmingNetwork',
          actions: assign({
            modelId: ({ event }) => event.modelId,
            error: null,
            pauseState: null,
            pausedReason: null,
          }),
        },
        IMPORT_CUSTOM: { target: 'customImport' },
        RESTORE_DOWNLOAD: [
          {
            guard: ({ event }) => event.status === 'paused' && event.pauseState !== null,
            target: 'paused',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              pausedReason: 'user' as const,
              error: null,
            }),
          },
          {
            target: 'downloading',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              error: null,
            }),
          },
        ],
      },
    },
    confirmingNetwork: {
      invoke: {
        src: 'checkNetworkActor',
        input: ({ context }) => ({ api: context.api }),
        onDone: [
          { guard: ({ event }) => event.output === 'wifi', target: 'downloading' },
          { guard: ({ event }) => event.output === 'cellular', target: 'cellularConfirm' },
          { target: 'awaitingWifi' },
        ],
      },
    },
    awaitingWifi: {
      on: { CHECK_NETWORK: { target: 'confirmingNetwork' } },
    },
    cellularConfirm: {
      on: {
        CELLULAR_CONFIRM: { target: 'downloading' },
        CELLULAR_CANCEL: { target: 'selecting' },
      },
    },
    downloading: {
      entry: [
        assign({ pausedReason: null }),
        ({ context }) => {
          void context.api.persistDownloadState({
            modelId: context.modelId,
            status: 'downloading',
            pauseState: null,
          });
        },
      ],
      invoke: {
        src: 'runDownload',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
          pauseState: context.pauseState,
        }),
      },
      on: {
        DOWNLOAD_PROGRESS: {
          actions: assign({
            progress: ({ event }) => ({ bytesWritten: event.bytesWritten, totalBytes: event.totalBytes }),
          }),
        },
        DOWNLOAD_COMPLETE: { target: 'verifying' },
        PAUSE: { target: 'paused', actions: assign({ pausedReason: 'user' }) },
        APP_BACKGROUND: { target: 'paused', actions: assign({ pausedReason: 'background' }) },
        FAIL: {
          target: 'failed',
          actions: [
            assign({ error: ({ event }) => ({ code: event.code, message: event.message }) }),
            ({ context, event }) => {
              if (event.code === 'disk-full' && context.modelId) {
                context.api.deletePartialFile(getCuratedModel(context.modelId).filename);
              }
            },
          ],
        },
      },
    },
    paused: {
      invoke: {
        src: 'pauseTask',
        input: ({ context }) => ({ api: context.api, modelId: context.modelId }),
        onDone: { actions: assign({ pauseState: ({ event }) => event.output }) },
      },
      on: {
        RESUME: { target: 'downloading' },
        APP_FOREGROUND: {
          guard: ({ context }) => context.pausedReason === 'background',
          target: 'downloading',
        },
      },
    },
    verifying: {
      invoke: {
        src: 'verifyTask',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
        }),
        onDone: [
          { guard: ({ event }) => event.output === true, target: 'smokeTest' },
          {
            target: 'failed',
            actions: [
              ({ context }) =>
                context.api.deletePartialFile(getCuratedModel(context.modelId as CuratedModelId).filename),
              assign({
                error: {
                  code: 'verify' as const,
                  message: 'Downloaded file size did not match the expected size.',
                },
              }),
            ],
          },
        ],
      },
    },
    smokeTest: {
      invoke: {
        src: 'smokeTestTask',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.ok === true,
            target: 'complete',
            actions: ({ context }) => {
              void context.api.setModelPath(getCuratedModel(context.modelId as CuratedModelId));
              void context.api.clearDownloadState();
            },
          },
          {
            target: 'selecting',
            actions: assign({
              error: {
                code: 'smoke' as const,
                message: 'This model could not run on your device. Try Fast & Light or import a custom model.',
              },
            }),
          },
        ],
      },
    },
    complete: { type: 'final' },
    customImport: {
      on: {
        IMPORT_SMOKE_OK: { target: 'complete' },
        IMPORT_FAILED: {
          target: 'selecting',
          actions: assign({ error: ({ event }) => ({ code: 'smoke' as const, message: event.message }) }),
        },
      },
    },
    failed: {
      entry: ({ context }) => {
        void context.api.persistDownloadState({
          modelId: context.modelId,
          status: 'failed',
          pauseState: context.pauseState,
        });
      },
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.error?.code === 'disk-full',
            target: 'selecting',
            actions: assign({ modelId: null, pauseState: null, error: null }),
          },
          { guard: ({ context }) => context.pauseState !== null, target: 'downloading' },
          { target: 'selecting' },
        ],
      },
    },
  },
});
