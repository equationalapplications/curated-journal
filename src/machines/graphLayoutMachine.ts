import { assign, fromCallback, fromPromise, setup } from 'xstate';

import { createLayoutRun, type GraphStructure, type Pos } from '@/lib/graphLayout';
import { hashKey, type CachedLayout, type LayoutCache } from '@/lib/graphLayoutCache';

/** Per-frame layout budget: leaves most of a 16ms frame for rendering and input. */
export const FRAME_BUDGET_MS = 6;
/** How often progressive positions are published while settling. */
export const PUBLISH_EVERY_MS = 120;

export type FrameScheduler = {
  request: (cb: () => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
};

export type GraphLayoutMachineInput = {
  cache: LayoutCache;
  frames?: FrameScheduler;
};

export type GraphLayoutMachineEvents =
  /** The graph to show changed (or first arrived). `scope: null` = don't cache. */
  | { type: 'STRUCTURE'; key: string; scope: string | null }
  | { type: 'PROGRESS'; positions: Map<string, Pos> }
  | { type: 'SETTLED'; positions: Map<string, Pos> };

type Context = {
  cache: LayoutCache;
  frames: FrameScheduler;
  key: string | null;
  scope: string | null;
  /** Latest positions: cached, in progress, or settled. Kept across structures. */
  positions: Map<string, Pos> | null;
  /** Warm-start seed for the next run (the cached layout for this scope). */
  seed: Map<string, Pos> | null;
};

const defaultFrames: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
  now: () => performance.now(),
};

/**
 * Graph layout lifecycle.
 *
 *   idle ─STRUCTURE→ restoring ─(cache hit)→ settled
 *                        └─(miss)→ settling ─SETTLED→ settled (+ persist)
 *   any ─STRUCTURE(new key)→ restoring   (the running simulation is stopped)
 *
 * `settling` invokes the force simulation as a callback actor that runs a few
 * milliseconds per animation frame and sends PROGRESS, so the JS thread never
 * blocks. Leaving the state (a new structure, unmount) stops it.
 */
export const graphLayoutMachine = setup({
  types: {
    context: {} as Context,
    events: {} as GraphLayoutMachineEvents,
    input: {} as GraphLayoutMachineInput,
  },
  actors: {
    restore: fromPromise(
      async ({ input }: { input: { cache: LayoutCache; scope: string | null } }) =>
        input.scope ? input.cache.read(input.scope) : null,
    ),
    simulate: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: GraphLayoutMachineEvents) => void;
        input: { key: string; seed: Map<string, Pos> | null; frames: FrameScheduler };
      }) => {
        const { frames } = input;
        const run = createLayoutRun(JSON.parse(input.key) as GraphStructure, input.seed ?? undefined, frames.now);
        sendBack({ type: 'PROGRESS', positions: run.positions() });
        let lastPublish = frames.now();
        let handle: number | undefined;
        const tick = () => {
          const done = run.step(FRAME_BUDGET_MS);
          if (done) {
            sendBack({ type: 'SETTLED', positions: run.positions() });
            return;
          }
          if (frames.now() - lastPublish >= PUBLISH_EVERY_MS) {
            lastPublish = frames.now();
            sendBack({ type: 'PROGRESS', positions: run.positions() });
          }
          handle = frames.request(tick);
        };
        handle = frames.request(tick);
        return () => {
          if (handle !== undefined) frames.cancel(handle);
        };
      },
    ),
  },
  guards: {
    isNewStructure: ({ context, event }) =>
      event.type === 'STRUCTURE' && (event.key !== context.key || event.scope !== context.scope),
    cacheHit: ({ context }, cached: CachedLayout | null) =>
      cached != null && context.key != null && cached.hash === hashKey(context.key),
  },
  actions: {
    persist: ({ context }) => {
      if (context.scope && context.key && context.positions) {
        context.cache.write(context.scope, { hash: hashKey(context.key), positions: context.positions });
      }
    },
  },
}).createMachine({
  id: 'graphLayout',
  context: ({ input }) => ({
    cache: input.cache,
    frames: input.frames ?? defaultFrames,
    key: null,
    scope: null,
    positions: null,
    seed: null,
  }),
  initial: 'idle',
  on: {
    STRUCTURE: {
      guard: 'isNewStructure',
      target: '.restoring',
      reenter: true,
      actions: assign({
        key: ({ event }) => event.key,
        scope: ({ event }) => event.scope,
      }),
    },
  },
  states: {
    idle: {},
    restoring: {
      invoke: {
        src: 'restore',
        input: ({ context }) => ({ cache: context.cache, scope: context.scope }),
        onDone: [
          {
            guard: { type: 'cacheHit', params: ({ event }) => event.output },
            target: 'settled',
            actions: assign({ positions: ({ event }) => event.output!.positions }),
          },
          {
            target: 'settling',
            actions: assign({ seed: ({ event }) => event.output?.positions ?? null }),
          },
        ],
        onError: { target: 'settling', actions: assign({ seed: null }) },
      },
    },
    settling: {
      invoke: {
        src: 'simulate',
        input: ({ context }) => ({ key: context.key!, seed: context.seed, frames: context.frames }),
      },
      on: {
        PROGRESS: { actions: assign({ positions: ({ event }) => event.positions }) },
        SETTLED: {
          target: 'settled',
          actions: [assign({ positions: ({ event }) => event.positions }), 'persist'],
        },
      },
    },
    settled: {},
  },
});
