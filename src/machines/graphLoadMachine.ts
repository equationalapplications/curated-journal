import { assign, fromPromise, createMachine } from 'xstate';

export type LoadFn = () => Promise<unknown>;

type Ctx = {
  graph: unknown;
  error: Error | null;
  load: LoadFn;
};

type Events = { type: 'LOAD' } | { type: 'RETRY' };

export const graphLoadMachine = createMachine({
  id: 'graphLoad',
  types: {
    context: {} as Ctx,
    events: {} as Events,
  },
  context: ({ input }: { input: { load: LoadFn } }): Ctx => ({
    graph: null,
    error: null,
    load: input.load,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: { LOAD: 'loading' },
    },
    loading: {
      invoke: {
        src: fromPromise(({ input }: { input: Ctx }) => input.load()),
        input: ({ context }: { context: Ctx }) => context,
        onDone: {
          target: 'ready',
          actions: assign({
            graph: ({ event }) => event.output,
            error: () => null,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
    },
    ready: {
      on: { LOAD: 'loading' },
    },
    failed: {
      on: { RETRY: 'loading', LOAD: 'loading' },
    },
  },
});
