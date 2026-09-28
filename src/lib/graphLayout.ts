import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

export type Pos = { x: number; y: number };

export type GraphStructure = { ids: string[]; links: [string, string][] };

/**
 * A stable key for a graph's *structure* (node ids and edges, order- and
 * direction-independent). Reloading the graph produces a new object even when
 * nothing changed, and the layout costs seconds at a few hundred nodes on a
 * phone, so the layout is memoized on this key rather than on the graph
 * object. Titles and bodies are not part of it: editing a note must not
 * re-shuffle the graph.
 */
export function graphStructureKey(
  nodes: readonly { id: string }[],
  edges: readonly { sourceId: string; targetId: string }[],
): string {
  // Sort before hashing: the same set of notes/edges must produce the same
  // key however the graph happens to be ordered, or every reload with a
  // different cap ordering would miss the cache.
  const ids = nodes.map((n) => n.id).toSorted();
  const links = edges
    .map((e) => (e.sourceId <= e.targetId ? [e.sourceId, e.targetId] : [e.targetId, e.sourceId]) as [string, string])
    .toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const structure: GraphStructure = { ids, links };
  return JSON.stringify(structure);
}

type Node = SimulationNodeDatum & { id: string };

/**
 * Force settings for the pannable graph. Positions are in world units centred
 * on (0, 0); the camera fits them to the screen, so nothing is scaled down to
 * a phone-width square any more.
 */
export const LAYOUT = {
  linkDistance: 60,
  charge: -150,
  /** Far nodes stop repelling: keeps the cost down and outliers close. */
  chargeDistanceMax: 320,
  /** Dot spacing only; labels are placed per zoom level (graphLabels). */
  collide: 14,
  /**
   * Pull toward the centre. Without it, unlinked notes are pushed far out by
   * the charge force and fitting them on screen crushes the linked cluster.
   */
  gravity: 0.07,
  alphaMin: 0.02,
  alphaDecay: 0.045,
  /** Starting heat when most nodes already have a saved position. */
  warmAlpha: 0.1,
} as const;

export type LayoutRun = {
  /** Run ticks until done or `budgetMs` elapses; returns true when settled. */
  step: (budgetMs: number) => boolean;
  positions: () => Map<string, Pos>;
  readonly done: boolean;
};

/**
 * A resumable force layout. The caller drives it a few milliseconds per frame
 * so the JS thread stays responsive (the old layout ran ~300 ticks in one
 * synchronous call: seconds of frozen UI at a few hundred nodes).
 *
 * `seed` warm-starts from saved positions: known nodes keep their place, new
 * nodes start next to a linked neighbour, and the run starts cool, so adding
 * one note nudges the graph instead of re-shuffling it.
 */
export function createLayoutRun(
  structure: GraphStructure,
  seed?: ReadonlyMap<string, Pos>,
  now: () => number = () => performance.now(),
): LayoutRun {
  const neighbours = new Map<string, string[]>();
  for (const [a, b] of structure.links) {
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a)!.push(b);
    neighbours.get(b)!.push(a);
  }

  let seeded = 0;
  const nodes: Node[] = structure.ids.map((id, i) => {
    const known = seed?.get(id);
    if (known) {
      seeded += 1;
      return { id, x: known.x, y: known.y };
    }
    const anchor = neighbours.get(id)?.map((n) => seed?.get(n)).find(Boolean);
    if (anchor) {
      // Deterministic jitter so two new nodes on one anchor don't coincide.
      const angle = i * 2.399963;
      return { id, x: anchor.x + 20 * Math.cos(angle), y: anchor.y + 20 * Math.sin(angle) };
    }
    return { id }; // d3 places it on its phyllotaxis spiral
  });

  const warm = nodes.length > 0 && seeded / nodes.length >= 0.8;
  const byId = new Set(structure.ids);
  const links: SimulationLinkDatum<Node>[] = structure.links
    .filter(([a, b]) => byId.has(a) && byId.has(b))
    .map(([source, target]) => ({ source, target }));

  const sim = forceSimulation(nodes)
    .alpha(warm ? LAYOUT.warmAlpha : 1)
    .alphaMin(LAYOUT.alphaMin)
    .alphaDecay(LAYOUT.alphaDecay)
    .force(
      'link',
      forceLink<Node, SimulationLinkDatum<Node>>(links)
        .id((d) => d.id)
        .distance(LAYOUT.linkDistance),
    )
    .force('charge', forceManyBody().strength(LAYOUT.charge).distanceMax(LAYOUT.chargeDistanceMax))
    .force('collide', forceCollide(LAYOUT.collide))
    .force('x', forceX(0).strength(LAYOUT.gravity))
    .force('y', forceY(0).strength(LAYOUT.gravity))
    .stop();

  let done = nodes.length === 0;

  return {
    step(budgetMs) {
      if (done) return true;
      const start = now();
      do {
        sim.tick();
        if (sim.alpha() < LAYOUT.alphaMin) {
          done = true;
          break;
        }
      } while (now() - start < budgetMs);
      return done;
    },
    positions() {
      return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    },
    get done() {
      return done;
    },
  };
}

/** Run a layout to completion synchronously (tests, tiny graphs). */
export function settle(run: LayoutRun, maxMs = 30_000): Map<string, Pos> {
  const deadline = performance.now() + maxMs;
  while (!run.step(50) && performance.now() < deadline) {
    // keep stepping
  }
  return run.positions();
}
