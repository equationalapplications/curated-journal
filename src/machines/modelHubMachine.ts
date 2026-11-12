import { assign, fromCallback, fromPromise, setup } from 'xstate';
import { getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import { classifyDownloadError, coerceInt64 } from '@/lib/downloadErrorTaxonomy';
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
  | { type: 'FAIL'; code: 'network' | 'disk-full' | 'unknown'; message: string }
  | { type: 'RETRY' }
  | { type: 'CHOOSE_ANOTHER' }
  | { type: 'IMPORT_SMOKE_OK'; retirePath?: string | null }
  | { type: 'IMPORT_FAILED'; message: string }
  | { type: 'SET_DISPLAY_NAME'; displayName: string }
  | {
      type: 'RESTORE_DOWNLOAD';
      modelId: CuratedModelId;
      status: 'downloading' | 'paused' | 'smoke-testing' | 'smoke-failed';
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
  pauseDownload: () => Promise<DownloadPauseStateRecord | null>;
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
  retireCurrentModel: () => Promise<RetireOutcome>;
  deleteModelFile: (path: string) => Promise<void>;
  isLowMemoryFor: (model: CuratedModel) => boolean;
  deleteOrphanedModelFiles: (keepModelId: CuratedModelId | null) => Promise<void>;
};

/**
 * Resolving means the outgoing file is gone — the unlink is the commitment
 * point, so a rejection can only mean the unlink itself failed and the model is
 * still on disk. `identityCleared` reports the bookkeeping that follows: when
 * false, the stored path and id still name a file that no longer exists, and
 * the launch-time reconciliation in `_layout.tsx` is what cleans that up.
 */
export type RetireOutcome = { identityCleared: boolean };

export type ModelHubMachineInput = {
  api: ModelHubApi;
  currentModelId?: CuratedModelId | 'custom' | null;
};

type ErrorCode = 'network' | 'disk-full' | 'unknown' | 'verify' | 'smoke' | 'retire';

type Context = {
  api: ModelHubApi;
  currentModelId: CuratedModelId | 'custom' | null;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: ErrorCode; message: string } | null;
  pauseState: DownloadPauseStateRecord | null;
  pausedReason: 'user' | 'background' | 'restored' | null;
  displayName: string | null;
  smokeKilled: boolean;
  afterCheck: 'network' | 'download';
};

export function smokeFailureMessage(displayName: string, memoryLikely: boolean): string {
  return memoryLikely
    ? `This device most likely ran out of memory while loading ${displayName}. Close other apps and try again, or choose another model.`
    : `${displayName} could not run on this device. Try again, or choose another model.`;
}

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
            // Coerce again at this boundary: the service normalizes its own
            // payloads, but api implementations are injected and this context
            // is rendered with plain number arithmetic.
            sendBack({
              type: 'DOWNLOAD_PROGRESS',
              bytesWritten: coerceInt64(p.bytesWritten),
              totalBytes: coerceInt64(p.totalBytes),
            });
          }
        };
        (async () => {
          try {
            const completed = input.pauseState?.resumeData
              ? await input.api.resumeDownload(input.pauseState, onProgress)
              : await input.api.startDownload(input.model, onProgress);
            if (!cancelled && completed) sendBack({ type: 'DOWNLOAD_COMPLETE' });
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error);
              sendBack({ type: 'FAIL', code: classifyDownloadError(error), message });
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      },
    ),
    pauseTask: fromPromise(
      async ({
        input,
      }: {
        input: {
          api: ModelHubApi;
          modelId: CuratedModelId | null;
          pausedReason: Context['pausedReason'];
          pauseState: DownloadPauseStateRecord | null;
        };
      }) => {
        // A restored pause has no live download to pause, and its row is
        // already persisted — hand back what was restored.
        if (input.pausedReason === 'restored') return input.pauseState;
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
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) => {
        // The marker write must finish before the load starts: the OS can kill
        // the app at any point after that, and relaunch reads this row.
        await input.api.persistDownloadState({
          modelId: input.model.id,
          status: 'smoke-testing',
          pauseState: null,
        });
        return input.api.runSmokeTest(input.model);
      },
    ),
    retireTask: fromPromise(async ({ input }: { input: { api: ModelHubApi } }) =>
      input.api.retireCurrentModel(),
    ),
  },
}).createMachine({
  id: 'modelHub',
  initial: 'selecting',
  context: ({ input }) => ({
    api: input.api,
    currentModelId: input.currentModelId ?? null,
    modelId: null,
    progress: { bytesWritten: 0, totalBytes: -1 },
    error: null,
    pauseState: null,
    pausedReason: null,
    displayName: null,
    smokeKilled: false,
    afterCheck: 'network' as const,
  }),
  on: {
    SET_DISPLAY_NAME: { actions: assign({ displayName: ({ event }) => event.displayName }) },
  },
  states: {
    selecting: {
      on: {
        SELECT_MODEL: [
          {
            guard: ({ event, context }) => event.modelId === context.currentModelId,
            target: 'checkingExisting',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              error: null,
              pauseState: null,
              pausedReason: null,
              afterCheck: 'network' as const,
            }),
          },
          {
            target: 'retiringCurrent',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              error: null,
              pauseState: null,
              pausedReason: null,
            }),
          },
        ],
        IMPORT_CUSTOM: { target: 'customImport' },
        RESTORE_DOWNLOAD: [
          {
            guard: ({ event }) => event.status === 'paused',
            target: 'paused',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              pausedReason: 'restored' as const,
              error: null,
            }),
          },
          {
            guard: ({ event }) => event.status === 'smoke-testing' || event.status === 'smoke-failed',
            target: 'smokeFailed',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: null,
              smokeKilled: ({ event }) => event.status === 'smoke-testing',
              error: null,
            }),
          },
          {
            target: 'checkingExisting',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              afterCheck: 'download' as const,
              error: null,
            }),
          },
        ],
      },
    },
    checkingExisting: {
      entry: ({ context }) => {
        void context.api.deleteOrphanedModelFiles(context.modelId);
      },
      invoke: {
        src: 'verifyTask',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
        }),
        onDone: [
          { guard: ({ event }) => event.output === true, target: 'smokeTest' },
          { guard: ({ context }) => context.afterCheck === 'download', target: 'downloading' },
          { target: 'confirmingNetwork' },
        ],
        onError: [
          { guard: ({ context }) => context.afterCheck === 'download', target: 'downloading' },
          { target: 'confirmingNetwork' },
        ],
      },
    },
    retiringCurrent: {
      invoke: {
        src: 'retireTask',
        input: ({ context }) => ({ api: context.api }),
        // currentModelId is cleared in both done branches: the file is gone the
        // moment this resolves, so leaving it set would render a deleted model
        // as Current and block re-selecting it.
        onDone: [
          {
            guard: ({ event }) => event.output.identityCleared,
            target: 'checkingExisting',
            actions: assign({ currentModelId: null, afterCheck: 'network' as const }),
          },
          {
            // The model really was removed — only its stored identity outlived
            // it. Saying "nothing has changed" here would be a lie about an
            // irreversible action, so the message has to distinguish the two.
            target: 'selecting',
            actions: assign({
              currentModelId: null,
              error: {
                code: 'retire' as const,
                message:
                  'Your model was removed, but its saved details could not be cleared. Pick a model to finish.',
              },
            }),
          },
        ],
        onError: {
          // Reached only when the unlink itself failed, so the model is still
          // installed and currentModelId is still true.
          target: 'selecting',
          actions: assign({
            error: {
              code: 'retire' as const,
              message: 'Your current model could not be removed, so nothing has changed. Try again.',
            },
          }),
        },
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
        onError: {
          // The list is on screen and has no Retry button, so go back to it
          // with the error in the banner (same as retiringCurrent).
          target: 'selecting',
          actions: assign({
            error: { code: 'network' as const, message: 'Could not check your connection. Try again.' },
          }),
        },
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
            // Stale resume data must not be retried: drop it so RETRY starts clean.
            assign({ error: ({ event }) => ({ code: event.code, message: event.message }), pauseState: null }),
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
        input: ({ context }) => ({
          api: context.api,
          modelId: context.modelId,
          pausedReason: context.pausedReason,
          pauseState: context.pauseState,
        }),
        onDone: { actions: assign({ pauseState: ({ event }) => event.output }) },
        onError: {
          target: 'failed',
          actions: assign({
            error: { code: 'unknown' as const, message: 'Could not pause the download. Try again.' },
          }),
        },
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
        onError: {
          target: 'failed',
          actions: assign({
            error: { code: 'verify' as const, message: 'Could not check the downloaded file. Try again.' },
          }),
        },
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
              // The smoke-testing marker is cleared only once the identity write
              // has landed, so a kill in between never leaves a marker for a
              // model that is already current.
              void context.api
                .setModelPath(getCuratedModel(context.modelId as CuratedModelId))
                .then(() => context.api.clearDownloadState())
                .catch(() => undefined);
            },
          },
          { target: 'smokeFailed' },
        ],
        onError: { target: 'smokeFailed' },
      },
    },
    smokeFailed: {
      entry: [
        assign({
          error: ({ context }) => {
            const model = getCuratedModel(context.modelId as CuratedModelId);
            return {
              code: 'smoke' as const,
              message: smokeFailureMessage(
                model.displayName,
                context.smokeKilled || context.api.isLowMemoryFor(model),
              ),
            };
          },
        }),
        ({ context }) => {
          void context.api.persistDownloadState({
            modelId: context.modelId,
            status: 'smoke-failed',
            pauseState: null,
          });
        },
      ],
      on: {
        RETRY: { target: 'verifying', actions: assign({ error: null, smokeKilled: false }) },
        CHOOSE_ANOTHER: {
          target: 'selecting',
          actions: [
            ({ context }) => {
              // Never delete the installed, working model's file.
              if (context.modelId && context.modelId !== context.currentModelId) {
                context.api.deletePartialFile(getCuratedModel(context.modelId).filename);
              }
              void context.api.clearDownloadState();
            },
            assign({ modelId: null, error: null, smokeKilled: false }),
          ],
        },
      },
    },
    complete: { type: 'final' },
    customImport: {
      on: {
        IMPORT_SMOKE_OK: {
          target: 'complete',
          actions: ({ context, event }) => {
            if (event.retirePath) void context.api.deleteModelFile(event.retirePath);
          },
        },
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
