import { assign, fromCallback, fromPromise, setup } from 'xstate';
import { getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import { classifyDownloadError, coerceInt64 } from '@/lib/downloadErrorTaxonomy';
import type { NetworkGateState } from '@/lib/networkGate';
import type { DownloadPauseStateRecord } from '@/services/modelDownloadState';
import type { ModelDownloadController } from '@/services/modelDownloadController';

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
  | { type: 'LEAVE_WAITING' }
  | { type: 'IMPORT_SMOKE_OK'; retirePath?: string | null }
  | { type: 'IMPORT_FAILED'; message: string }
  | { type: 'SET_DISPLAY_NAME'; displayName: string }
  | { type: 'REFUSED' }
  | { type: 'NOT_LIVE'; pauseState: DownloadPauseStateRecord | null }
  | {
      type: 'TRANSFER_STOPPED';
      reason: 'strict' | 'unrequested';
      modelId: CuratedModelId;
      pauseState: DownloadPauseStateRecord | null;
    }
  | {
      type: 'RESTORE_DOWNLOAD';
      modelId: CuratedModelId;
      status: 'downloading' | 'paused' | 'smoke-testing' | 'smoke-failed';
      pauseState: DownloadPauseStateRecord | null;
      /** A transfer is running in this process: attach to it, no network check (H9). */
      live?: boolean;
      /** The file finished while no hub was open: verify it, no check and no transfer (H9b). */
      finished?: boolean;
    };

export type ModelHubApi = {
  checkNetwork: () => Promise<NetworkGateState>;
  /** The one owner of every transfer and of the saved download row. */
  downloads: ModelDownloadController;
  verifyDownload: (model: CuratedModel) => boolean;
  deletePartialFile: (filename: string) => void;
  runSmokeTest: (model: CuratedModel) => Promise<{ ok: boolean }>;
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

type ErrorCode = 'network' | 'disk-full' | 'unknown' | 'verify' | 'smoke' | 'retire' | 'commit';

type Context = {
  api: ModelHubApi;
  currentModelId: CuratedModelId | 'custom' | null;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: ErrorCode; message: string } | null;
  pauseState: DownloadPauseStateRecord | null;
  pausedReason: 'user' | 'background' | 'restored' | 'strict' | null;
  displayName: string | null;
  smokeKilled: boolean;
  /** The network check guards a continuation of an existing download (restore, resume, retry), not a fresh start. */
  continuation: boolean;
  /** An `APP_FOREGROUND` arrived while a background pause was still settling: continue when it does. */
  resumeOnSettle: boolean;
  /** The restore found a running transfer: `runDownload` attaches to it and never starts one (H9). */
  attachOnly: boolean;
};

function classifyCode(code: string): 'network' | 'disk-full' | 'unknown' {
  return code === 'network' || code === 'disk-full' ? code : 'unknown';
}

export function smokeFailureMessage(displayName: string, memoryLikely: boolean): string {
  return memoryLikely
    ? `This device most likely ran out of memory while loading ${displayName}. Close other apps and try again, or choose another model.`
    : `${displayName} could not run on this device. Try again, or choose another model.`;
}

/** The smoke test passed, but storing the model's identity failed. */
export class ModelCommitError extends Error {
  constructor(cause: unknown) {
    super('Could not store the model identity');
    this.name = 'ModelCommitError';
    this.cause = cause;
  }
}

/**
 * The smoke test in flight in this process, if any. Its native load keeps
 * running when the hub closes (the actor stops, the promise does not), so the
 * `smoke-testing` marker it wrote is not evidence of a kill until it settles.
 */
let liveSmokeTest: Promise<unknown> | null = null;

/** Resolves once no smoke test is running in this process. Never rejects. */
export function smokeTestSettled(): Promise<void> {
  return (liveSmokeTest ?? Promise.resolve()).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Marker → load → commit, all in one promise. The marker write must finish
 * before the load starts: the OS can kill the app at any point after that, and
 * relaunch reads this row. On success the identity is written before the
 * marker is cleared (spec B5). A kill in between leaves a `smoke-testing`
 * marker for a model that is already current; `toRestoreState` recognises
 * that row as a pass and the hub clears it. An identity-write failure rejects
 * as `ModelCommitError`. On failure the row records `smoke-failed`, so a closed
 * hub never leaves a `smoke-testing` marker that later reads as a kill.
 */
async function runSmokeTestAndCommit(
  api: ModelHubApi,
  model: CuratedModel,
): Promise<{ ok: boolean }> {
  const marker = await api.downloads.record(model.id, 'smoke-testing');
  if (!marker.rowSaved) throw new Error('Could not save the smoke-test marker');
  let result: Awaited<ReturnType<ModelHubApi['runSmokeTest']>>;
  try {
    result = await api.runSmokeTest(model);
  } catch (error) {
    await recordSmokeFailure(api, model);
    throw error;
  }
  if (!result.ok) {
    await recordSmokeFailure(api, model);
    return result;
  }
  try {
    await api.setModelPath(model);
  } catch (cause) {
    await api.downloads.record(model.id, 'failed').catch(() => undefined);
    throw new ModelCommitError(cause);
  }
  await api.downloads.abandon().catch(() => undefined);
  return result;
}

function recordSmokeFailure(api: ModelHubApi, model: CuratedModel): Promise<void> {
  return api.downloads.record(model.id, 'smoke-failed').then(
    () => undefined,
    () => undefined,
  );
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
    controllerEvents: fromCallback(
      ({ sendBack, input }: { sendBack: (event: ModelHubMachineEvents) => void; input: { api: ModelHubApi } }) =>
        // The one root subscription (H1): `stopped` must reach the machine in
        // every state, not only while `runDownload` exists.
        input.api.downloads.subscribe((event) => {
          if (event.type !== 'stopped') return;
          sendBack({
            type: 'TRANSFER_STOPPED',
            reason: event.reason,
            modelId: event.modelId,
            pauseState: event.pauseState,
          });
        }),
    ),
    runDownload: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: ModelHubMachineEvents) => void;
        input: {
          api: ModelHubApi;
          modelId: CuratedModelId;
          pauseState: DownloadPauseStateRecord | null;
          attachOnly: boolean;
        };
      }) => {
        let cancelled = false;
        const downloads = input.api.downloads;
        const sendProgress = (p: { bytesWritten: number; totalBytes: number }) => {
          if (cancelled) return;
          // Coerce again at this boundary: this context is rendered with plain
          // number arithmetic.
          sendBack({
            type: 'DOWNLOAD_PROGRESS',
            bytesWritten: coerceInt64(p.bytesWritten),
            totalBytes: coerceInt64(p.totalBytes),
          });
        };
        // Progress, completed and failed only: `stopped` goes through the root subscription.
        const unsubscribe = downloads.subscribe((event) => {
          if (cancelled || event.modelId !== input.modelId) return;
          if (event.type === 'progress') sendProgress(event);
          else if (event.type === 'completed') sendBack({ type: 'DOWNLOAD_COMPLETE' });
          else if (event.type === 'failed') sendBack({ type: 'FAIL', code: event.code, message: event.message });
        });
        (async () => {
          try {
            if (input.attachOnly) {
              const result = await downloads.attach(input.modelId);
              if (cancelled) return;
              if (result.kind === 'attached') sendProgress(result.snapshot.progress);
              else if (result.kind === 'completed') sendBack({ type: 'DOWNLOAD_COMPLETE' });
              else if (result.kind === 'failed') {
                sendBack({
                  type: 'FAIL',
                  code: classifyCode(result.code),
                  message: result.message,
                });
              } else sendBack({ type: 'NOT_LIVE', pauseState: result.snapshot.pauseState });
              return;
            }
            const result = input.pauseState?.resumeData
              ? await downloads.resume(input.modelId)
              : await downloads.start(input.modelId);
            if (cancelled) return;
            // A result is authoritative: the controller emits an event only for a settlement.
            if (result.kind === 'completed') sendBack({ type: 'DOWNLOAD_COMPLETE' });
            else if (result.kind === 'failed') sendBack({ type: 'FAIL', code: result.code, message: result.message });
            else if (result.kind === 'refused') sendBack({ type: 'REFUSED' });
            else sendProgress(result.snapshot.progress);
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error);
              sendBack({ type: 'FAIL', code: classifyDownloadError(error), message });
            }
          }
        })();
        return () => {
          cancelled = true;
          unsubscribe();
        };
      },
    ),
    pauseTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; modelId: CuratedModelId } }) =>
        input.api.downloads.pause(input.modelId),
    ),
    verifyTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) =>
        input.api.verifyDownload(input.model),
    ),
    smokeTestTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) => {
        const run = runSmokeTestAndCommit(input.api, input.model);
        liveSmokeTest = run;
        void run.then(clearLive, clearLive);
        function clearLive() {
          if (liveSmokeTest === run) liveSmokeTest = null;
        }
        return run;
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
    continuation: false,
    resumeOnSettle: false,
    attachOnly: false,
  }),
  invoke: {
    src: 'controllerEvents',
    input: ({ context }) => ({ api: context.api }),
  },
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
            actions: [
              // Picking a different model abandons any saved continuation row
              // (e.g. kept by LEAVE_WAITING): it would otherwise resume later.
              ({ context, event }) => {
                if (context.modelId && context.modelId !== event.modelId) {
                  void context.api.downloads.abandon().catch(() => undefined);
                }
              },
              assign({
                modelId: ({ event }) => event.modelId,
                error: null,
                pauseState: null,
                pausedReason: null,
                continuation: false,
              }),
            ],
          },
          {
            target: 'retiringCurrent',
            actions: [
              // Picking a different model abandons any saved continuation row
              // (e.g. kept by LEAVE_WAITING): it would otherwise resume later.
              ({ context, event }) => {
                if (context.modelId && context.modelId !== event.modelId) {
                  void context.api.downloads.abandon().catch(() => undefined);
                }
              },
              assign({
                modelId: ({ event }) => event.modelId,
                error: null,
                // Re-picking the model whose saved row is still held keeps its
                // resume data: it resumes (behind the network check) instead
                // of restarting from zero over the saved row.
                pauseState: ({ context, event }) =>
                  event.modelId === context.modelId ? context.pauseState : null,
                pausedReason: null,
                continuation: ({ context, event }) =>
                  event.modelId === context.modelId && context.pauseState !== null,
              }),
            ],
          },
        ],
        IMPORT_CUSTOM: { target: 'customImport' },
        RESTORE_DOWNLOAD: [
          {
            // H9b: the file finished while no hub was open.
            guard: ({ event }) => event.finished === true,
            target: 'checkingExisting',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              continuation: true,
              error: null,
            }),
          },
          {
            // H9: a transfer is running in this process. Attach, no network check.
            guard: ({ event }) => event.live === true,
            target: 'downloading',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              pauseState: ({ event }) => event.pauseState,
              continuation: true,
              attachOnly: true,
              error: null,
            }),
          },
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
              continuation: true,
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
          { target: 'confirmingNetwork' },
        ],
        onError: [
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
            actions: assign({ currentModelId: null }),
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
      on: {
        // Nothing is downloading yet: re-pause so the next foreground re-checks.
        APP_BACKGROUND: {
          guard: ({ context }) => context.continuation,
          target: 'pausing',
          actions: assign({ pausedReason: 'background' as const }),
        },
        TRANSFER_STOPPED: {
          // H15: the transfer is already stopped and the latch stays set. No controller call.
          guard: ({ context, event }) => event.modelId === context.modelId && event.reason === 'strict',
          target: 'paused',
          actions: assign({
            pausedReason: 'strict' as const,
            continuation: false,
            pauseState: ({ event }) => event.pauseState,
          }),
        },
      },
      invoke: {
        src: 'checkNetworkActor',
        input: ({ context }) => ({ api: context.api }),
        onDone: [
          {
            guard: ({ event }) => event.output === 'wifi',
            target: 'downloading',
            actions: assign({ attachOnly: false }),
          },
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
      on: {
        CHECK_NETWORK: { target: 'confirmingNetwork' },
        // The saved row stays as it is: a continuation resumes on a later open.
        LEAVE_WAITING: { target: 'selecting' },
        TRANSFER_STOPPED: {
          // H15: the transfer is already stopped and the latch stays set. No controller call.
          guard: ({ context, event }) => event.modelId === context.modelId && event.reason === 'strict',
          target: 'paused',
          actions: assign({
            pausedReason: 'strict' as const,
            continuation: false,
            pauseState: ({ event }) => event.pauseState,
          }),
        },
      },
    },
    cellularConfirm: {
      on: {
        CELLULAR_CONFIRM: { target: 'downloading', actions: assign({ attachOnly: false }) },
        CELLULAR_CANCEL: [
          {
            // Declining a continuation keeps the download and its progress.
            guard: ({ context }) => context.continuation,
            target: 'pausing',
            actions: assign({ pausedReason: 'restored' as const }),
          },
          { target: 'selecting' },
        ],
        APP_BACKGROUND: {
          guard: ({ context }) => context.continuation,
          target: 'pausing',
          actions: assign({ pausedReason: 'background' as const }),
        },
        TRANSFER_STOPPED: {
          // H15: the transfer is already stopped and the latch stays set. No controller call.
          guard: ({ context, event }) => event.modelId === context.modelId && event.reason === 'strict',
          target: 'paused',
          actions: assign({
            pausedReason: 'strict' as const,
            continuation: false,
            pauseState: ({ event }) => event.pauseState,
          }),
        },
      },
    },
    downloading: {
      entry: assign({ pausedReason: null }),
      invoke: {
        src: 'runDownload',
        input: ({ context }) => ({
          api: context.api,
          modelId: context.modelId as CuratedModelId,
          pauseState: context.pauseState,
          attachOnly: context.attachOnly,
        }),
      },
      on: {
        DOWNLOAD_PROGRESS: {
          actions: assign({
            progress: ({ event }) => ({ bytesWritten: event.bytesWritten, totalBytes: event.totalBytes }),
          }),
        },
        // The resume data that got us here is spent: a later failure must not
        // RETRY by resuming from it.
        DOWNLOAD_COMPLETE: { target: 'verifying', actions: assign({ pauseState: null }) },
        PAUSE: { target: 'pausing', actions: assign({ pausedReason: 'user' as const }) },
        APP_BACKGROUND: { target: 'pausing', actions: assign({ pausedReason: 'background' as const }) },
        // A refusal (the strict latch or the gate) never starts anything: pause, which saves `paused`.
        REFUSED: { target: 'pausing', actions: assign({ pausedReason: 'strict' as const }) },
        // The attach found nothing running: restore normally, behind the network check (P1).
        NOT_LIVE: {
          target: 'confirmingNetwork',
          actions: assign({
            pauseState: ({ event }) => event.pauseState,
            continuation: true,
            attachOnly: false,
          }),
        },
        TRANSFER_STOPPED: {
          guard: ({ context, event }) => event.modelId === context.modelId,
          target: 'paused',
          actions: assign({
            pausedReason: ({ event }) => (event.reason === 'strict' ? ('strict' as const) : ('user' as const)),
            pauseState: ({ event }) => event.pauseState,
          }),
        },
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
    pausing: {
      // Resume is not offered until the controller says no transfer is in flight.
      entry: assign({ resumeOnSettle: false }),
      invoke: {
        src: 'pauseTask',
        input: ({ context }) => ({ api: context.api, modelId: context.modelId as CuratedModelId }),
        onDone: [
          {
            guard: ({ context, event }) =>
              event.output.kind === 'paused' && (event.output.strict || context.pausedReason === 'strict'),
            target: 'paused',
            actions: assign({
              pausedReason: 'strict' as const,
              pauseState: ({ event }) => (event.output.kind === 'paused' ? event.output.pauseState : null),
              resumeOnSettle: false,
            }),
          },
          {
            guard: ({ context, event }) =>
              event.output.kind === 'paused' && context.pausedReason === 'background' && context.resumeOnSettle,
            target: 'confirmingNetwork',
            actions: assign({
              pauseState: ({ event }) => (event.output.kind === 'paused' ? event.output.pauseState : null),
              continuation: true,
            }),
          },
          {
            guard: ({ event }) => event.output.kind === 'paused',
            target: 'paused',
            actions: assign({
              pauseState: ({ event }) => (event.output.kind === 'paused' ? event.output.pauseState : null),
            }),
          },
          {
            guard: ({ event }) => event.output.kind === 'completed',
            target: 'verifying',
            actions: assign({ pauseState: null }),
          },
          {
            guard: ({ event }) => event.output.kind === 'failed',
            target: 'failed',
            actions: [
              assign({
                error: ({ event }) =>
                  event.output.kind === 'failed'
                    ? { code: classifyCode(event.output.code), message: event.output.message }
                    : null,
                pauseState: null,
              }),
              ({ context }) => {
                if (context.error?.code === 'disk-full' && context.modelId) {
                  context.api.deletePartialFile(getCuratedModel(context.modelId).filename);
                }
              },
            ],
          },
          {
            // pause-failed: the controller already cancelled the transfer.
            target: 'failed',
            actions: assign({
              error: { code: 'unknown' as const, message: 'Could not pause the download. Try again.' },
              pauseState: ({ event }) => (event.output.kind === 'pause-failed' ? event.output.pauseState : null),
            }),
          },
        ],
        onError: {
          target: 'failed',
          actions: assign({
            error: { code: 'unknown' as const, message: 'Could not pause the download. Try again.' },
          }),
        },
      },
      on: {
        APP_FOREGROUND: {
          guard: ({ context }) => context.pausedReason === 'background',
          actions: assign({ resumeOnSettle: true }),
        },
        APP_BACKGROUND: {
          guard: ({ context }) => context.pausedReason === 'background',
          actions: assign({ resumeOnSettle: false }),
        },
        TRANSFER_STOPPED: {
          guard: ({ context, event }) => event.modelId === context.modelId && event.reason === 'strict',
          actions: assign({ pausedReason: 'strict' as const, resumeOnSettle: false }),
        },
      },
    },
    paused: {
      on: {
        // Resume asks first on cellular, like every continuation.
        RESUME: { target: 'confirmingNetwork', actions: assign({ continuation: true }) },
        APP_FOREGROUND: {
          guard: ({ context }) => context.pausedReason === 'background',
          target: 'confirmingNetwork',
          actions: assign({ continuation: true }),
        },
        // A strict stop that arrives after the pause settled relabels it (H5).
        TRANSFER_STOPPED: {
          guard: ({ context, event }) => event.modelId === context.modelId && event.reason === 'strict',
          actions: assign({
            pausedReason: 'strict' as const,
            pauseState: ({ event }) => event.pauseState,
          }),
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
        // The task itself commits the model (or records the failure), so the
        // outcome lands even if the hub is closed mid-test.
        onDone: [
          { guard: ({ event }) => event.output.ok === true, target: 'complete' },
          { target: 'smokeFailed' },
        ],
        onError: [
          {
            guard: ({ event }) => event.error instanceof ModelCommitError,
            target: 'failed',
            actions: assign({
              error: {
                code: 'commit' as const,
                message: 'The model works, but it could not be saved as your model. Try again.',
              },
            }),
          },
          { target: 'smokeFailed' },
        ],
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
          if (context.modelId) {
            void context.api.downloads.record(context.modelId, 'smoke-failed').catch(() => undefined);
          }
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
              void context.api.downloads.abandon().catch(() => undefined);
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
            // A saved row for an abandoned curated download must not outlive the import.
            void context.api.downloads.abandon().catch(() => undefined);
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
        // Queued behind any other controller work, so a quick RETRY is ordered after it.
        if (context.modelId) {
          context.api.downloads.record(context.modelId, 'failed').catch((cause) => {
            console.warn('[model-hub] could not record the failed download', cause);
          });
        }
      },
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.error?.code === 'disk-full',
            target: 'selecting',
            actions: assign({ modelId: null, pauseState: null, error: null }),
          },
          {
            guard: ({ context }) => context.pauseState !== null,
            target: 'confirmingNetwork',
            actions: assign({ continuation: true }),
          },
          { target: 'selecting' },
        ],
      },
    },
  },
});
