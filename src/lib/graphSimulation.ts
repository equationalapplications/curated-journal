import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';

export type SimNode = { id: string; x?: number; y?: number };
export type SimLink = { source: string; target: string };

/**
 * Keep-out margin from the canvas edge. Horizontal room is half a label
 * (labels are centred under the dot); vertical room covers the dot above and
 * the label below.
 */
export const GRAPH_EDGE_PAD = { x: 64, top: 16, bottom: 32 } as const;

export function runGraphSimulation(nodes: SimNode[], links: SimLink[], size: number) {
  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => (d as SimNode).id)
        .distance(72),
    )
    .force('charge', forceManyBody().strength(-220))
    .force('center', forceCenter(size / 2, size / 2))
    // Room for a one-line label under each dot, so neighbours don't overprint.
    .force('collide', forceCollide(34));
  sim.tick(300);
  sim.stop();
  return fitToCanvas(nodes, size);
}

/**
 * Scale the laid-out graph uniformly into the padded canvas (never enlarging
 * past 1:1), so no node or label is pushed off-screen by the charge force.
 */
export function fitToCanvas<T extends SimNode>(nodes: T[], size: number): T[] {
  const placed = nodes.filter((n) => n.x != null && n.y != null);
  if (placed.length === 0) return nodes;
  const xs = placed.map((n) => n.x as number);
  const ys = placed.map((n) => n.y as number);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const availW = Math.max(size - 2 * GRAPH_EDGE_PAD.x, 1);
  const availH = Math.max(size - GRAPH_EDGE_PAD.top - GRAPH_EDGE_PAD.bottom, 1);
  const scale = Math.min(1, availW / Math.max(maxX - minX, 1), availH / Math.max(maxY - minY, 1));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const targetX = GRAPH_EDGE_PAD.x + availW / 2;
  const targetY = GRAPH_EDGE_PAD.top + availH / 2;
  for (const n of placed) {
    n.x = targetX + ((n.x as number) - cx) * scale;
    n.y = targetY + ((n.y as number) - cy) * scale;
  }
  return nodes;
}

export type GraphStructure = { ids: string[]; links: [string, string][] };

/**
 * A stable key for a graph's *structure* (node ids and edges, in order).
 * Reloading the graph produces a new object even when nothing changed, and
 * the layout costs seconds at a few hundred nodes on a phone, so the layout is
 * memoized on this key rather than on the graph object. Titles and bodies are
 * not part of it: editing a note must not re-shuffle the graph.
 */
export function graphStructureKey(
  nodes: readonly { id: string }[],
  edges: readonly { sourceId: string; targetId: string }[],
): string {
  const structure: GraphStructure = {
    ids: nodes.map((n) => n.id),
    links: edges.map((e) => [e.sourceId, e.targetId]),
  };
  return JSON.stringify(structure);
}

/** Lay out the graph a structure key describes; node id -> position. */
export function layoutFromStructureKey(key: string, size: number): Map<string, SimNode> {
  const { ids, links } = JSON.parse(key) as GraphStructure;
  const nodes: SimNode[] = ids.map((id) => ({ id }));
  const positioned = runGraphSimulation(
    nodes,
    links.map(([source, target]) => ({ source, target })),
    size,
  );
  return new Map(positioned.map((n) => [n.id, n]));
}
