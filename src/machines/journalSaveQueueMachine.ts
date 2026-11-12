import { assign, fromPromise, setup } from 'xstate';
import * as Crypto from 'expo-crypto';
import { countIngestFailures, type IngestResult } from '@/lib/ingestReport';

/**
 * Background save queue for journal entries (spec
 * `specs/2026-11-12-background-save/spec.md`).
 *
 * Save used to hold the editor until on-device LLM extraction finished, and
 * that takes many seconds on a slow phone. Now Save puts the entry in this
 * queue and the editor closes at once. The queue saves entries in order, one
 * ingest at a time:
 *
 *   idle ──(an entry is queued)──> saving ──done──> idle | saving (next)
 *                                     └──error──> entry marked failed, queue continues
 *
 * A failed entry keeps its text until the user picks RETRY (back of the
 * queue) or DISCARD. There is no cancel for an in-flight save (R5). Each
 * ingest is still capped by `saveTimeoutMs`, so a hung on-device LLM
 * surfaces as a failure instead of stalling the queue forever.
 */

export type SaveStatus = 'queued' | 'saving' | 'failed';

export type QueuedEntry = {
  id: string;
  title: string;
  body: string;
  status: SaveStatus;
  error: Error | null;
};

/** A save that succeeded with chunk failures; shown once, then acknowledged. */
export type SaveWarning = { id: string; failures: number };

export type JournalSaveQueueInput = {
  entityId: string;
  ingest: (entityId: string, params: {
    sourceRef: string;
    sourceHash: string;
    documentChunk: string;
  }) => Promise<IngestResult>;
  /** Hard cap on one entry's ingest. Default 120s. */
  saveTimeoutMs?: number;
};

export type JournalSaveQueueEvents =
  | { type: 'ENQUEUE'; title: string; body: string }
  | { type: 'RETRY'; id: string }
  | { type: 'DISCARD'; id: string }
  | { type: 'ACK_WARNING'; id: string }
  /** Live engine binding. The provider sends it whenever the wiki or entity changes. */
  | { type: 'SET_ENGINE'; entityId: string; ingest: JournalSaveQueueInput['ingest'] };

type Context = {
  entityId: string;
  ingest: JournalSaveQueueInput['ingest'];
  saveTimeoutMs: number;
  entries: QueuedEntry[];
  warnings: SaveWarning[];
  /** Increments on every successful save; the screen refetches on change. */
  savedCount: number;
  /** Id of the entry in the `saving` state. */
  currentId: string | null;
  nextSeq: number;
};

type SaveEntryInput = {
  entry: QueuedEntry;
  entityId: string;
  ingest: JournalSaveQueueInput['ingest'];
  saveTimeoutMs: number;
};

/**
 * Reject after `ms` if `promise` has not settled. The timer is cleared on
 * settle, and on `signal` abort (the actor stopped), so a stopped queue
 * leaves no timer behind.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  signal: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  signal.addEventListener('abort', clear, { once: true });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clear();
    signal.removeEventListener('abort', clear);
  });
}

const firstQueued = (entries: QueuedEntry[]) => entries.find((e) => e.status === 'queued');

export const journalSaveQueueMachine = setup({
  types: {
    context: {} as Context,
    events: {} as JournalSaveQueueEvents,
    input: {} as JournalSaveQueueInput,
  },
  guards: {
    hasQueued: ({ context }) => firstQueued(context.entries) !== undefined,
  },
  actors: {
    saveEntry: fromPromise(async ({ input, signal }: { input: SaveEntryInput; signal: AbortSignal }) => {
      const { entry, entityId, ingest, saveTimeoutMs } = input;
      const markdown = `# ${entry.title}\n\n${entry.body}`;
      const sourceHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        markdown,
        { encoding: Crypto.CryptoEncoding.HEX },
      );
      return withTimeout(
        ingest(entityId, {
          sourceRef: `journal://${Date.now()}`,
          sourceHash,
          documentChunk: markdown,
        }),
        saveTimeoutMs,
        `Save timed out after ${Math.round(saveTimeoutMs / 1000)}s — the wiki engine stayed busy. Try again when the app is idle.`,
        signal,
      );
    }),
  },
}).createMachine({
  id: 'journalSaveQueue',
  context: ({ input }) => ({
    entityId: input.entityId,
    ingest: input.ingest,
    saveTimeoutMs: input.saveTimeoutMs ?? 120_000,
    entries: [],
    warnings: [],
    savedCount: 0,
    currentId: null,
    nextSeq: 1,
  }),
  on: {
    ENQUEUE: {
      actions: assign(({ context, event }) => ({
        entries: [
          ...context.entries,
          {
            id: `save-${context.nextSeq}`,
            title: event.title,
            body: event.body,
            status: 'queued' as const,
            error: null,
          },
        ],
        nextSeq: context.nextSeq + 1,
      })),
    },
    RETRY: {
      actions: assign(({ context, event }) => {
        const entry = context.entries.find((e) => e.id === event.id && e.status === 'failed');
        if (!entry) return {};
        return {
          entries: [
            ...context.entries.filter((e) => e.id !== event.id),
            { ...entry, status: 'queued' as const, error: null },
          ],
        };
      }),
    },
    DISCARD: {
      actions: assign(({ context, event }) => ({
        entries: context.entries.filter((e) => !(e.id === event.id && e.status === 'failed')),
      })),
    },
    ACK_WARNING: {
      actions: assign(({ context, event }) => ({
        warnings: context.warnings.filter((w) => w.id !== event.id),
      })),
    },
    SET_ENGINE: {
      actions: assign(({ event }) => ({ entityId: event.entityId, ingest: event.ingest })),
    },
  },
  initial: 'idle',
  states: {
    idle: {
      always: { guard: 'hasQueued', target: 'saving' },
    },
    saving: {
      entry: assign(({ context }) => {
        const next = firstQueued(context.entries);
        if (!next) return {};
        return {
          currentId: next.id,
          entries: context.entries.map((e) =>
            e.id === next.id ? { ...e, status: 'saving' as const } : e,
          ),
        };
      }),
      invoke: {
        src: 'saveEntry',
        input: ({ context }) => {
          const entry = context.entries.find((e) => e.id === context.currentId);
          if (!entry) throw new Error('saving entered without a queued entry');
          return {
            entry,
            entityId: context.entityId,
            ingest: context.ingest,
            saveTimeoutMs: context.saveTimeoutMs,
          };
        },
        onDone: {
          target: 'idle',
          actions: assign(({ context, event }) => {
            const failures = countIngestFailures(event.output);
            const id = context.currentId;
            return {
              entries: context.entries.filter((e) => e.id !== id),
              warnings:
                failures > 0 && id ? [...context.warnings, { id, failures }] : context.warnings,
              savedCount: context.savedCount + 1,
              currentId: null,
            };
          }),
        },
        onError: {
          target: 'idle',
          actions: assign(({ context, event }) => ({
            entries: context.entries.map((e) =>
              e.id === context.currentId
                ? {
                    ...e,
                    status: 'failed' as const,
                    error: event.error instanceof Error ? event.error : new Error(String(event.error)),
                  }
                : e,
            ),
            currentId: null,
          })),
        },
      },
    },
  },
});
