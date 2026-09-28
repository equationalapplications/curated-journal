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
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * OKF import:
 *
 *   idle ─PICK→ picking ─(file)→ working.preparing ─PREPARED→ working.importing
 *        ─IMPORTED→ working.finalizing → done
 *   working ─FAIL→ failed ─PICK→ picking      working ─CANCEL→ idle
 *
 * Temp files belong to the actor that holds them: `prepare` cleans up on its
 * own failure, and the import actor's teardown cleans up whenever `importing`
 * is left, on success, failure, cancel or unmount, so nothing depends on a
 * single try/finally around the whole flow. Cancelling stops the import
 * between chunks; notes already imported stay (imports merge).
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
        input: { api: ImportApi; prepared: PreparedImport };
      }) => {
        const controller = new AbortController();
        input.api
          .importDump(
            input.prepared.dump,
            (progress) => {
              if (!controller.signal.aborted) sendBack({ type: 'PROGRESS', progress });
            },
            controller.signal,
          )
          .then(
            () => {
              if (!controller.signal.aborted) sendBack({ type: 'IMPORTED' });
            },
            (e) => {
              if (!controller.signal.aborted) sendBack({ type: 'FAIL', message: message(e) });
            },
          );
        return () => {
          controller.abort();
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
              }),
            },
          },
        },
        importing: {
          invoke: {
            src: 'runImport',
            input: ({ context }) => ({ api: context.api, prepared: context.prepared! }),
          },
          on: {
            PROGRESS: { actions: assign({ progress: ({ event }) => event.progress }) },
            IMPORTED: 'finalizing',
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
