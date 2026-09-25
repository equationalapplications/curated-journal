import { assign, createMachine, fromPromise, setup } from 'xstate';
import {
  WikiBusyError,
  type EntityStatus,
  type MemoryDump,
  type WikiMemory,
} from '@equationalapplications/expo-llm-wiki';
import {
  runHealToCompletion,
  type HealBatchRunner,
  type HealStepSummary,
} from '@/lib/healLoop';

export type NightShiftOperation = 'librarian' | 'heal' | 'reembed' | 'prune';

export type QueueItem = { operation: NightShiftOperation; entityId: string };

/** How the last Night Shift run ended. `'none'` while running or after an IMPORT interrupt. */
export type NightShiftOutcome = 'none' | 'completed' | 'aborted';

export type JournalWikiMachineEvents =
  | { type: 'START_NIGHT_SHIFT'; queue: QueueItem[] }
  | { type: 'ABORT_NIGHT_SHIFT' }
  | { type: 'IMPORT'; dump: MemoryDump; merge: boolean }
  | { type: 'EXPORT'; entityIds: string[] }
  | { type: 'STATUS'; status: EntityStatus }
  | { type: 'RETRY' };

export type MaintenanceApi = {
  runLibrarian: (entityId: string) => Promise<void>;
  /** One library heal batch. The machine loops batches via runHealToCompletion. */
  runHeal: HealBatchRunner;
  runReembed: (entityId?: string) => Promise<void>;
  runPrune: (entityId: string) => Promise<void>;
};

export type JournalWikiMachineInput = {
  wiki: WikiMemory;
  maintenance: MaintenanceApi;
};

type Context = {
  wiki: WikiMemory;
  maintenance: MaintenanceApi;
  queue: QueueItem[];
  queueIndex: number;
  aborted: boolean;
  /**
   * Shared stop signal for the in-flight heal loop. Constructed in the
   * context factory (never caller-supplied) so an actor rebuild cannot
   * inherit a stale signal. `ABORT_NIGHT_SHIFT` mutates it deliberately:
   * the running invoked actor reads it by reference between batches.
   */
  nightShiftSignal: { aborted: boolean };
  lastHealSummary: HealStepSummary | null;
  nightShiftOutcome: NightShiftOutcome;
  status: EntityStatus;
  lastError: Error | null;
  pendingImport: { dump: MemoryDump; merge: boolean } | null;
  pendingExport: string[] | null;
};

async function runQueueStep(
  maintenance: MaintenanceApi,
  item: QueueItem,
  shouldContinue: () => boolean,
): Promise<void | HealStepSummary> {
  switch (item.operation) {
    case 'librarian':
      await maintenance.runLibrarian(item.entityId);
      return;
    case 'heal':
      return runHealToCompletion(maintenance.runHeal, item.entityId, { shouldContinue });
    case 'reembed':
      await maintenance.runReembed(item.entityId);
      return;
    case 'prune':
      await maintenance.runPrune(item.entityId);
      return;
  }
}

export const journalWikiMachine = setup({
  types: {
    context: {} as Context,
    events: {} as JournalWikiMachineEvents,
    input: {} as JournalWikiMachineInput,
  },
  guards: {
    isBusyState: ({ context }) =>
      context.queue.length > 0 || context.pendingImport !== null || context.pendingExport !== null,
  },
  actions: {
    resetNightShift: assign(({ context, event }) => {
      context.nightShiftSignal.aborted = false;
      return {
        queue: event.type === 'START_NIGHT_SHIFT' ? event.queue : [],
        queueIndex: 0,
        aborted: false,
        nightShiftSignal: context.nightShiftSignal,
        lastHealSummary: null,
        lastError: null,
        nightShiftOutcome: 'none' as NightShiftOutcome,
      };
    }),
    abortNightShift: assign({
      aborted: true,
      nightShiftSignal: ({ context }) => {
        // Deliberate mutation: the in-flight heal loop reads this object by
        // reference between batches, so abort latency is one batch.
        context.nightShiftSignal.aborted = true;
        return context.nightShiftSignal;
      },
    }),
  },
  actors: {
    runStep: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: { maintenance: MaintenanceApi; item: QueueItem; signal: { aborted: boolean } };
        signal: AbortSignal;
      }) => {
        return runQueueStep(input.maintenance, input.item, () =>
          // Both stop paths, checked between batches: the machine's abort
          // flag and xstate's invoke AbortSignal (fires when this actor is
          // stopped — e.g. an IMPORT transition or provider unmount).
          !input.signal.aborted && !signal.aborted,
        );
      },
    ),
    importDump: fromPromise(
      async ({
        input,
      }: {
        input: { wiki: WikiMemory; dump: MemoryDump; merge: boolean };
      }) => {
        await input.wiki.importDump(input.dump, { merge: input.merge });
      },
    ),
    exportDump: fromPromise(
      async ({ input }: { input: { wiki: WikiMemory; entityIds: string[] } }) => {
        return input.wiki.exportDump(input.entityIds);
      },
    ),
    subscribeStatus: fromPromise(async () => undefined),
  },
}).createMachine({
  id: 'journalWiki',
  initial: 'idle',
  context: ({ input }) => ({
    wiki: input.wiki,
    maintenance: input.maintenance,
    queue: [],
    queueIndex: 0,
    aborted: false,
    nightShiftSignal: { aborted: false },
    lastHealSummary: null,
    nightShiftOutcome: 'none' as NightShiftOutcome,
    status: { ingesting: false, librarian: false, heal: false },
    lastError: null,
    pendingImport: null,
    pendingExport: null,
  }),
  states: {
    idle: {
      on: {
        START_NIGHT_SHIFT: {
          target: 'nightShift',
          actions: 'resetNightShift',
        },
        IMPORT: [
          {
            guard: 'isBusyState',
            actions: assign({
              pendingImport: ({ event }) => ({ dump: event.dump, merge: event.merge }),
            }),
            target: 'busyRetry',
          },
          {
            target: 'importing',
            actions: assign({
              pendingImport: ({ event }) => ({ dump: event.dump, merge: event.merge }),
            }),
          },
        ],
        EXPORT: {
          target: 'exporting',
          actions: assign({ pendingExport: ({ event }) => event.entityIds }),
        },
        STATUS: { actions: assign({ status: ({ event }) => event.status }) },
      },
    },
    nightShift: {
      initial: 'step',
      on: {
        ABORT_NIGHT_SHIFT: { actions: 'abortNightShift' },
        STATUS: { actions: assign({ status: ({ event }) => event.status }) },
        IMPORT: {
          actions: assign({
            pendingImport: ({ event }) => ({ dump: event.dump, merge: event.merge }),
            // Clear night-shift state so a stale queue cannot keep
            // isBusyState true after the import lands (would force every
            // later IMPORT through busyRetry).
            queue: [],
            queueIndex: 0,
            aborted: false,
          }),
          target: 'busyRetry',
        },
      },
      states: {
        step: {
          invoke: {
            src: 'runStep',
            input: ({ context }) => ({
              maintenance: context.maintenance,
              item: context.queue[context.queueIndex]!,
              signal: context.nightShiftSignal,
            }),
            onDone: {
              target: 'advance',
              actions: assign({
                lastHealSummary: ({ context, event }) =>
                  event.output && typeof event.output === 'object' && 'batches' in event.output
                    ? event.output
                    : context.lastHealSummary,
              }),
            },
            onError: {
              target: '#journalWiki.error',
              actions: assign({
                lastError: ({ event }) =>
                  event.error instanceof Error ? event.error : new Error(String(event.error)),
              }),
            },
          },
        },
        advance: {
          always: [
            {
              guard: ({ context }) =>
                context.aborted || context.queueIndex + 1 >= context.queue.length,
              target: '#journalWiki.idle',
              actions: assign({
                queue: [],
                queueIndex: 0,
                aborted: false,
                // Property callbacks read the pre-transition context, so this
                // sees `aborted` before the line above clears it.
                nightShiftOutcome: ({ context }) => (context.aborted ? 'aborted' : 'completed'),
              }),
            },
            {
              target: 'step',
              actions: assign({ queueIndex: ({ context }) => context.queueIndex + 1 }),
            },
          ],
        },
      },
    },
    importing: {
      invoke: {
        src: 'importDump',
        input: ({ context }) => ({
          wiki: context.wiki,
          dump: context.pendingImport!.dump,
          merge: context.pendingImport!.merge,
        }),
        onDone: {
          target: 'idle',
          actions: assign({ pendingImport: null }),
        },
        onError: [
          {
            guard: ({ event }) => event.error instanceof WikiBusyError,
            target: 'busyRetry',
          },
          {
            target: 'error',
            actions: assign({
              lastError: ({ event }) =>
                event.error instanceof Error ? event.error : new Error(String(event.error)),
            }),
          },
        ],
      },
    },
    exporting: {
      invoke: {
        src: 'exportDump',
        input: ({ context }) => ({
          wiki: context.wiki,
          entityIds: context.pendingExport ?? [],
        }),
        onDone: { target: 'idle', actions: assign({ pendingExport: null }) },
        onError: {
          target: 'error',
          actions: assign({
            lastError: ({ event }) =>
              event.error instanceof Error ? event.error : new Error(String(event.error)),
          }),
        },
      },
    },
    busyRetry: {
      after: {
        500: [
          {
            guard: ({ context }) => context.pendingImport !== null,
            target: 'importing',
          },
          { target: 'busyRetry' },
        ],
      },
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.pendingImport !== null,
            target: 'importing',
          },
        ],
      },
    },
    error: {
      on: {
        START_NIGHT_SHIFT: {
          target: 'nightShift',
          actions: 'resetNightShift',
        },
        IMPORT: { target: 'importing' },
        RETRY: { target: 'idle', actions: assign({ lastError: null }) },
      },
    },
  },
});
