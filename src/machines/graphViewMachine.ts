import { assign, setup } from 'xstate';

export type GraphViewMachineEvents =
  /** The overview's node ids (the capped graph) after each load. */
  | { type: 'OVERVIEW'; ids: ReadonlySet<string> }
  | { type: 'TAP_NODE'; id: string }
  | { type: 'TAP_BACKGROUND' }
  | { type: 'SEARCH'; query: string }
  /** A search result was chosen. */
  | { type: 'PICK'; id: string }
  | { type: 'CLEAR_FOCUS' }
  | { type: 'OPEN_DETAILS' }
  | { type: 'CLOSE_SHEET' }
  | { type: 'FIT' };

type Context = {
  overview: ReadonlySet<string>;
  focusId: string | null;
  sheetId: string | null;
  query: string;
  /**
   * The last centre request actually issued, as an object: stable identity
   * while unchanged, so canvas effects keyed on it fire once per request —
   * not on every TAP_NODE that merely changes `focusId`.
   */
  focusRequest: { id: string; nonce: number } | null;
  /** Bumped to ask the canvas to fit the whole graph. */
  fitRequest: number;
};

/**
 * What the graph tab is showing and what the user is doing with it, as three
 * parallel regions:
 *
 * - `focus`: `none` (the overview), `focused` (a note and its neighbours
 *   highlighted in the overview) or `neighbourhood` (a note that isn't in the
 *   capped overview, shown with its own neighbourhood graph). Which of the
 *   last two applies is decided by one guard, whether the note is in the
 *   overview, including when a reload changes what the overview holds.
 * - `sheet`: the note-details sheet, `closed` or `open`.
 * - `search`: `idle` or `typing` (the results list is showing).
 */
export const graphViewMachine = setup({
  types: {
    context: {} as Context,
    events: {} as GraphViewMachineEvents,
  },
  guards: {
    targetInOverview: ({ context, event }) =>
      (event.type === 'PICK' || event.type === 'TAP_NODE') && context.overview.has(event.id),
    focusInOverview: ({ context }) => context.focusId != null && context.overview.has(context.focusId),
    hasQuery: ({ event }) => event.type === 'SEARCH' && event.query.trim().length > 0,
  },
  actions: {
    focusTarget: assign({
      focusId: ({ event }) => (event.type === 'PICK' || event.type === 'TAP_NODE' ? event.id : null),
    }),
    requestCentre: assign({
      focusRequest: ({ context, event }) =>
        event.type === 'PICK' || event.type === 'TAP_NODE'
          ? { id: event.id, nonce: (context.focusRequest?.nonce ?? 0) + 1 }
          : context.focusRequest,
    }),
    requestFit: assign({ fitRequest: ({ context }) => context.fitRequest + 1 }),
    clearFocus: assign({ focusId: null }),
  },
}).createMachine({
  id: 'graphView',
  type: 'parallel',
  context: {
    overview: new Set<string>(),
    focusId: null,
    sheetId: null,
    query: '',
    focusRequest: null,
    fitRequest: 0,
  },
  on: {
    OVERVIEW: { actions: assign({ overview: ({ event }) => event.ids }) },
    FIT: { actions: 'requestFit' },
  },
  states: {
    focus: {
      initial: 'none',
      on: {
        PICK: [
          { guard: 'targetInOverview', target: '.focused', actions: ['focusTarget', 'requestCentre'] },
          { target: '.neighbourhood', actions: ['focusTarget', 'requestCentre'] },
        ],
        TAP_NODE: [
          { guard: 'targetInOverview', target: '.focused', actions: 'focusTarget' },
          { target: '.neighbourhood', actions: ['focusTarget', 'requestCentre'] },
        ],
        CLEAR_FOCUS: { target: '.none', actions: ['clearFocus', 'requestFit'] },
      },
      states: {
        none: {},
        focused: {
          on: { TAP_BACKGROUND: { target: 'none', actions: 'clearFocus' } },
          // A reload can drop the note out of the capped overview.
          always: { guard: ({ context }) => !context.overview.has(context.focusId!), target: 'neighbourhood' },
        },
        // Background taps keep the neighbourhood: leaving it is explicit
        // ("All notes"), since it replaces the whole graph on screen. A tap
        // on an overview note inside a neighbourhood is ambiguous: silently
        // swapping to the whole overview throws away the user's place, so
        // the neighbourhood is kept and the camera moves to the note.
        neighbourhood: {
          TAP_NODE: { actions: ['focusTarget', 'requestCentre'] },
          always: { guard: 'focusInOverview', target: 'focused' },
        },
      },
    },
    sheet: {
      initial: 'closed',
      states: {
        closed: {
          on: {
            TAP_NODE: { target: 'open', actions: assign({ sheetId: ({ event }) => event.id }) },
            OPEN_DETAILS: {
              guard: ({ context }) => context.focusId != null,
              target: 'open',
              actions: assign({ sheetId: ({ context }) => context.focusId }),
            },
          },
        },
        open: {
          on: {
            CLOSE_SHEET: { target: 'closed', actions: assign({ sheetId: null }) },
          },
        },
      },
    },
    search: {
      initial: 'idle',
      on: {
        SEARCH: [
          { guard: 'hasQuery', target: '.typing', actions: assign({ query: ({ event }) => event.query }) },
          { target: '.idle', actions: assign({ query: '' }) },
        ],
      },
      states: {
        idle: {},
        typing: {
          on: { PICK: { target: 'idle', actions: assign({ query: '' }) } },
        },
      },
    },
  },
});
