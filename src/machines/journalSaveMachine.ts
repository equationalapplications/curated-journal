import { assign, fromPromise, setup } from 'xstate';
import * as Crypto from 'expo-crypto';
import type { IngestResult } from '@/lib/ingestReport';

/**
 * Save flow for one journal entry, as an explicit state machine (Kurt's
 * standing rule: repos using xstate architect features as machines).
 *
 * Why a machine: the previous implementation was a bare `saving` boolean
 * around an unguarded `await` — when the wiki engine's ingest hung (on-device
 * LLM stall), the button stayed "Saving…" forever with no failure state, no
 * timeout, and no retry. The machine makes every outcome explicit:
 *
 *   idle ──START_SAVE──> hashing ──> ingesting ──> saved
 *                          │            │
 *                          └────────────┴──> failed ──RETRY──> (re-run)
 *                                               │
 *                                               └─DISMISS──> idle
 *
 * The ingest actor races the library promise against `saveTimeoutMs`, so a
 * hung on-device LLM still reaches `failed` instead of blocking the UI forever.
 */

export type JournalSaveMachineEvents =
  | { type: 'START_SAVE'; title: string; body: string }
  | { type: 'RETRY' }
  | { type: 'DISMISS' }
  /** Abort an in-flight save. Leaving the state stops the invoked actor, so its timeout can never fire afterwards. */
  | { type: 'CANCEL' };

export type JournalSaveMachineInput = {
  entityId: string;
  ingest: (entityId: string, params: {
    sourceRef: string;
    sourceHash: string;
    documentChunk: string;
  }) => Promise<IngestResult>;
  /** Hard cap on the ingest stage. Default 120s (on-device LLMs are slow but not THIS slow). */
  saveTimeoutMs?: number;
};

type SaveInput = { title: string; body: string };

type Context = {
  entityId: string;
  ingest: JournalSaveMachineInput['ingest'];
  saveTimeoutMs: number;
  /** Entry being saved / last saved — kept for RETRY. */
  input: SaveInput | null;
  markdown: string;
  sourceHash: string;
  lastError: Error | null;
  lastResult: IngestResult | null;
};

async function hashMarkdown(markdown: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, markdown, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/** Reject after `ms` if `promise` has not settled; timer is cleared on settle. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export const journalSaveMachine = setup({
  types: {
    context: {} as Context,
    events: {} as JournalSaveMachineEvents,
    input: {} as JournalSaveMachineInput,
  },
  actors: {
    hashEntry: fromPromise(async ({ input }: { input: SaveInput }) => {
      const markdown = `# ${input.title}\n\n${input.body}`;
      const sourceHash = await hashMarkdown(markdown);
      return { markdown, sourceHash };
    }),
    runIngest: fromPromise(async ({ input }: { input: Context }) => {
      if (input.input == null) {
        throw new Error('Save invoked without entry input');
      }
      return withTimeout(
        input.ingest(input.entityId, {
          sourceRef: `journal://${Date.now()}`,
          sourceHash: input.sourceHash,
          documentChunk: input.markdown,
        }),
        input.saveTimeoutMs,
        `Save timed out after ${Math.round(input.saveTimeoutMs / 1000)}s — the wiki engine stayed busy. Try again when the app is idle.`,
      );
    }),
  },
}).createMachine({
  id: 'journalSave',
  context: ({ input }) => ({
    entityId: input.entityId,
    ingest: input.ingest,
    saveTimeoutMs: input.saveTimeoutMs ?? 120_000,
    input: null,
    markdown: '',
    sourceHash: '',
    lastError: null,
    lastResult: null,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        START_SAVE: {
          target: 'hashing',
          actions: assign({
            input: ({ event }) => ({ title: event.title, body: event.body }),
            lastError: null,
            lastResult: null,
          }),
        },
      },
    },
    hashing: {
      on: {
        CANCEL: 'idle',
        START_SAVE: {
          target: 'hashing',
          actions: assign({
            input: ({ event }) => ({ title: event.title, body: event.body }),
            lastError: null,
            lastResult: null,
          }),
        },
      },
      invoke: {
        src: 'hashEntry',
        input: ({ context }) => {
          if (context.input == null) throw new Error('hashing invoked without input');
          return context.input;
        },
        onDone: {
          target: 'ingesting',
          actions: assign({
            markdown: ({ event }) => event.output.markdown,
            sourceHash: ({ event }) => event.output.sourceHash,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ lastError: ({ event }) => event.error as Error }),
        },
      },
    },
    ingesting: {
      on: {
        CANCEL: 'idle',
      },
      invoke: {
        src: 'runIngest',
        input: ({ context }) => context,
        onDone: {
          target: 'saved',
          actions: assign({ lastResult: ({ event }) => event.output, lastError: null }),
        },
        onError: {
          target: 'failed',
          actions: assign({ lastError: ({ event }) => event.error as Error }),
        },
      },
    },
    saved: {
      on: {
        START_SAVE: {
          target: 'hashing',
          actions: assign({
            input: ({ event }) => ({ title: event.title, body: event.body }),
            lastError: null,
            lastResult: null,
          }),
        },
      },
    },
    failed: {
      on: {
        RETRY: 'hashing',
        DISMISS: {
          target: 'idle',
          actions: assign({ lastError: null }),
        },
        START_SAVE: {
          target: 'hashing',
          actions: assign({
            input: ({ event }) => ({ title: event.title, body: event.body }),
            lastError: null,
            lastResult: null,
          }),
        },
      },
    },
  },
});
