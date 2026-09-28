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
  /**
   * A pinned neighbourhood: taps inside it keep the neighbourhood view
   * instead of jumping to the whole overview. Set when a neighbourhood is
   * entered (its root note is outside the cap); released when the focus is
   * cleared or a reload brings the neighbourhood *root* into the overview.
   */
  pinned: boolean;
  /** The note whose neighbourhood is being shown while pinned. */
  egoRoot: string | null;
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
    /** True while a neighbourhood is pinned (entered from outside the cap). */
    pinnedNeighbourhood: ({ context }) => context.pinned && context.focusId != null,
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
    clearFocus: assign({ focusId: null, pinned: false, egoRoot: null }),
    // egoRoot is the note whose neighbourhood is on screen: the first note
    // that pulled the view into neighbourhood mode. Later taps inside the
    // neighbourhood only move focusId, not the root.
    pin: assign(({ context, event }) => ({
      pinned: true,
      egoRoot:
        context.egoRoot ?? (event.type === 'PICK' || event.type === 'TAP_NODE' ? event.id : null),
    })),
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
    pinned: false,
    egoRoot: null,
  },
  on: {
    OVERVIEW: {
      actions: assign({
        overview: ({ event }) => event.ids,
    // Keep the pin across reloads while the neighbourhood *root* is still
    // outside the cap: every tab refocus re-sends OVERVIEW, and dropping
    // the pin there would let the next tap swap the pinned neighbourhood
    // for the whole overview.
        pinned: ({ context, event }) =>
          context.pinned && !(context.egoRoot && event.ids.has(context.egoRoot)),
      }),
    },
    FIT: { actions: 'requestFit' },
  },
  states: {
    focus: {
      initial: 'none',
      on: {
        PICK: [
          { guard: 'targetInOverview', target: '.focused', actions: ['focusTarget', 'requestCentre'] },
          { target: '.neighbourhood', actions: ['focusTarget', 'requestCentre', 'pin'] },
        ],
        TAP_NODE: [
          // Inside a pinned neighbourhood, a tap on an overview note is
          // ambiguous: silently swapping to the whole overview throws away
          // the user's place, so the neighbourhood is kept and the camera
          // moves to the note. The sheet still opens via the sheet region.
          { guard: 'pinnedNeighbourhood', actions: ['focusTarget', 'requestCentre', 'pin'] },
          { guard: 'targetInOverview', target: '.focused', actions: 'focusTarget' },
          { target: '.neighbourhood', actions: ['focusTarget', 'requestCentre', 'pin'] },
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
    // ("All notes"), since it replaces the whole graph on screen. The pin
    // keeps the neighbourhood when the focused note is outside the cap;
    // it is released by a reload that brings the note into the cap
    // (OVERVIEW clears `pinned`, then this guard moves to `focused`).
        neighbourhood: {
          always: {
            guard: ({ context }) => !context.pinned && context.focusId != null && context.overview.has(context.focusId),
            target: 'focused',
          },
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
