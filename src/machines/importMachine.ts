import { assign, fromCallback, fromPromise, setup } from 'xstate';
import type { MemoryDump } from '@equationalapplications/core-llm-wiki';

import type { ImportProgress } from '@/lib/chunkedImportDump';

export type PreparePhase = 'copying' | 'extracting' | 'reading';

/** A picked, extracted and parsed bundle, plus the temp files it left behind. */
export type PreparedImport = { dump: MemoryDump; noteCount: number; cleanup: () => void };

export type ImportApi = {
  /** Show the document picker; null when the user cancels. */
  pick: () => Promise<{ uri: string } | null>;
  /** Copy, extract and parse. Must clean up its own temp files if it throws. */
  prepare: (uri: string, onPhase: (phase: PreparePhase) => void) => Promise<PreparedImport>;
  importDump: (
    dump: MemoryDump,
    onProgress: (detail: ImportProgress) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  /** After the data is in: e.g. reset the ontology manifest. */
  finalize: () => Promise<void>;
};

export type ImportMachineEvents =
  | { type: 'PICK' }
  | { type: 'CANCEL' }
  | { type: 'CANCELLED' }
  | { type: 'PHASE'; phase: PreparePhase }
  | { type: 'PREPARED'; prepared: PreparedImport }
  | { type: 'PROGRESS'; progress: ImportProgress }
  | { type: 'IMPORTED' }
  | { type: 'FAIL'; message: string };

type Context = {
  api: ImportApi;
  uri: string | null;
  phase: PreparePhase;
  prepared: PreparedImport | null;
  progress: ImportProgress;
  error: string | null;
  /** Owns the import's AbortSignal; created when importing starts. */
  abort: AbortController | null;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Abort the in-flight import; a no-op once the promise has settled. */
const abortImport = ({ context }: { context: Context }) => {
  context.abort?.abort();
};

/**
 * OKF import:
 *
 *   idle ─PICK→ picking ─(file)→ working.preparing ─PREPARED→ working.importing.active
 *        ─IMPORTED→ working.finalizing → done
 *   working.preparing ─CANCEL→ idle      working.importing.active ─CANCEL→ …importing.cancelling
 *        ─CANCELLED→ idle (the in-flight chunk has settled)
 *   working ─FAIL→ failed ─PICK→ picking
 *
 * Temp files belong to the actor that holds them: `prepare` cleans up on its
 * own failure, and the import actor's teardown cleans up whenever `importing`
 * is left, on success, failure, cancel or unmount, so nothing depends on a
 * single try/finally around the whole flow.
 *
 * Cancel is a two-step handshake: CANCEL only aborts the signal and moves to
 * `importing.cancelling`; the import actor stays invoked (the state isn't
 * exited) and sends CANCELLED once its promise settles. Going to `idle`
 * immediately would leave the in-flight `importDump` holding the wiki's
 * global import lock for seconds (chunks are up to 500 notes), so the next
 * wiki operation could fail with `WikiBusyError`.
 */
export const importMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ImportMachineEvents,
    input: {} as { api: ImportApi },
  },
  actors: {
    pickFile: fromPromise(async ({ input }: { input: { api: ImportApi } }) => input.api.pick()),
    prepareBundle: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (e: ImportMachineEvents) => void;
        input: { api: ImportApi; uri: string };
      }) => {
        let stopped = false;
        input.api
          .prepare(input.uri, (phase) => {
            if (!stopped) sendBack({ type: 'PHASE', phase });
          })
          .then(
            (prepared) => {
              if (stopped) prepared.cleanup();
              else sendBack({ type: 'PREPARED', prepared });
            },
            (e) => {
              if (!stopped) sendBack({ type: 'FAIL', message: message(e) });
            },
          );
        return () => {
          stopped = true;
        };
      },
    ),
    runImport: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (e: ImportMachineEvents) => void;
        input: { api: ImportApi; prepared: PreparedImport; controller: AbortController };
      }) => {
        let stopped = false;
        input.api
          .importDump(input.prepared.dump, (progress) => {
            if (!stopped) sendBack({ type: 'PROGRESS', progress });
          }, input.controller.signal)
          .then(
            () => {
              if (stopped) return;
              if (input.controller.signal.aborted) sendBack({ type: 'CANCELLED' });
              else sendBack({ type: 'IMPORTED' });
            },
            (e) => {
              if (stopped) return;
              if (input.controller.signal.aborted) sendBack({ type: 'CANCELLED' });
              else sendBack({ type: 'FAIL', message: message(e) });
            },
          );
        return () => {
          stopped = true;
          // Aborting here is a no-op when the promise has already settled
          // (CANCEL handshake, IMPORTED); before settle — the user left the
          // screen and the actor was stopped — it stops the import at its
          // next chunk boundary.
          input.controller.abort();
          input.prepared.cleanup();
        };
      },
    ),
    finalizeImport: fromPromise(async ({ input }: { input: { api: ImportApi } }) => input.api.finalize()),
  },
}).createMachine({
  id: 'import',
  context: ({ input }) => ({
    api: input.api,
    uri: null,
    phase: 'copying',
    prepared: null,
    progress: { factsDone: 0, factsTotal: 0 },
    error: null,
    abort: null,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: { PICK: 'picking' },
    },
    picking: {
      invoke: {
        src: 'pickFile',
        input: ({ context }) => ({ api: context.api }),
        onDone: [
          { guard: ({ event }) => event.output == null, target: 'idle' },
          { target: 'working', actions: assign({ uri: ({ event }) => event.output!.uri }) },
        ],
        onError: { target: 'failed', actions: assign({ error: ({ event }) => message(event.error) }) },
      },
    },
    working: {
      initial: 'preparing',
      entry: assign({
        error: null,
        phase: 'copying',
        prepared: null,
        progress: { factsDone: 0, factsTotal: 0 },
        abort: null,
      }),
      on: {
        CANCEL: 'idle',
        FAIL: { target: 'failed', actions: assign({ error: ({ event }) => event.message }) },
      },
      states: {
        preparing: {
          invoke: {
            src: 'prepareBundle',
            input: ({ context }) => ({ api: context.api, uri: context.uri! }),
          },
          on: {
            PHASE: { actions: assign({ phase: ({ event }) => event.phase }) },
            PREPARED: {
              target: 'importing',
              actions: assign({
                prepared: ({ event }) => event.prepared,
                progress: ({ event }) => ({ factsDone: 0, factsTotal: event.prepared.noteCount }),
                abort: () => new AbortController(),
              }),
            },
          },
        },
        importing: {
          initial: 'active',
          // The invoke lives on `importing`, not `active`, so it survives the
          // CANCEL handshake: `active` → `cancelling` must not tear the import
          // actor down while its last chunk is still writing. The exit aborts
          // on teardown-before-settle (user left the screen): the import then
          // stops at its next chunk boundary.
          invoke: {
            src: 'runImport',
            input: ({ context }) => ({
              api: context.api,
              prepared: context.prepared!,
              controller: context.abort!,
            }),
          },
          on: {
            PROGRESS: { actions: assign({ progress: ({ event }) => event.progress }) },
            IMPORTED: 'finalizing',
          },
          states: {
            active: {
              on: {
                CANCEL: { target: 'cancelling', actions: abortImport },
              },
            },
            cancelling: {
              // Waiting for the in-flight chunk to settle. Extra CANCELs are
              // consumed here so the parent's CANCEL → idle can't fire and
              // tear the import actor down mid-chunk.
              on: {
                CANCELLED: '#import.idle',
                CANCEL: { actions: [] },
              },
            },
          },
        },
        finalizing: {
          invoke: {
            src: 'finalizeImport',
            input: ({ context }) => ({ api: context.api }),
            onDone: '#import.done',
            onError: {
              target: '#import.failed',
              actions: assign({ error: ({ event }) => message(event.error) }),
            },
          },
        },
      },
    },
    done: { type: 'final' },
    failed: {
      on: { PICK: 'picking' },
    },
  },
});
