import { assign, createMachine, fromPromise, setup } from 'xstate';
import {
  WikiBusyError,
  type EntityStatus,
  type MemoryDump,
  type WikiMemory,
} from '@equationalapplications/expo-llm-wiki';

export type NightShiftOperation = 'librarian' | 'heal' | 'reembed' | 'prune';

export type QueueItem = { operation: NightShiftOperation; entityId: string };

export type JournalWikiMachineEvents =
  | { type: 'START_NIGHT_SHIFT'; queue: QueueItem[] }
  | { type: 'ABORT_NIGHT_SHIFT' }
  | { type: 'IMPORT'; dump: MemoryDump; merge: boolean }
  | { type: 'EXPORT'; entityIds: string[] }
  | { type: 'STATUS'; status: EntityStatus }
  | { type: 'RETRY' };

export type MaintenanceApi = {
  runLibrarian: (entityId: string) => Promise<void>;
  runHeal: (entityId: string) => Promise<void>;
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
  status: EntityStatus;
  lastError: Error | null;
  pendingImport: { dump: MemoryDump; merge: boolean } | null;
  pendingExport: string[] | null;
};

async function runQueueStep(
  maintenance: MaintenanceApi,
  item: QueueItem,
): Promise<void> {
  switch (item.operation) {
    case 'librarian':
      await maintenance.runLibrarian(item.entityId);
      return;
    case 'heal':
      await maintenance.runHeal(item.entityId);
      return;
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
  actors: {
    runStep: fromPromise(
      async ({
        input,
      }: {
        input: { maintenance: MaintenanceApi; item: QueueItem };
      }) => {
        await runQueueStep(input.maintenance, input.item);
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
          actions: assign({
            queue: ({ event }) => event.queue,
            queueIndex: 0,
            aborted: false,
            lastError: null,
          }),
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
        ABORT_NIGHT_SHIFT: { actions: assign({ aborted: true }) },
        STATUS: { actions: assign({ status: ({ event }) => event.status }) },
        IMPORT: {
          actions: assign({
            pendingImport: ({ event }) => ({ dump: event.dump, merge: event.merge }),
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
            }),
            onDone: {
              target: 'advance',
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
              actions: assign({ queue: [], queueIndex: 0, aborted: false }),
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
          actions: assign({
            queue: ({ event }) => event.queue,
            queueIndex: 0,
            aborted: false,
            lastError: null,
          }),
        },
        IMPORT: { target: 'importing' },
        RETRY: { target: 'idle', actions: assign({ lastError: null }) },
      },
    },
  },
});
