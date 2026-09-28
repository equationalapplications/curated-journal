import { GRAPH_NODE_CAP } from '@/lib/constants';

export type GraphNodeInput = {
  id: string;
  title: string;
  /** Full note text (markdown); shown when a node is expanded. */
  body?: string;
  confidence: string;
  updatedAt: number;
  okfType?: string;
};

export type GraphEdgeInput = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
};

const CONFIDENCE_RANK: Record<string, number> = {
  certain: 3,
  inferred: 2,
  tentative: 1,
};

export function capGraphNodes<T extends { confidence: string; updatedAt: number }>(
  nodes: T[],
  cap = GRAPH_NODE_CAP,
): { nodes: T[]; truncated: boolean } {
  if (nodes.length <= cap) return { nodes, truncated: false };
  const sorted = [...nodes].sort((a, b) => {
    const conf =
      (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
    if (conf !== 0) return conf;
    return b.updatedAt - a.updatedAt;
  });
  return { nodes: sorted.slice(0, cap), truncated: true };
}

/** Max characters in an on-canvas node label before it is ellipsized. */
export const GRAPH_LABEL_MAX = 18;

/**
 * Brief on-canvas label for a node: the title on one line, cut at a word
 * boundary where possible and ellipsized. The full title and body live in the
 * node sheet.
 */
export function shortLabel(title: string, max = GRAPH_LABEL_MAX): string {
  const flat = title.replace(/\s+/g, ' ').trim() || 'Untitled';
  if (flat.length <= max) return flat;
  // Look one char past the budget so a word ending exactly at it is kept.
  const space = flat.slice(0, max).lastIndexOf(' ');
  const head = space >= Math.floor(max / 2) ? flat.slice(0, space) : flat.slice(0, max - 1);
  return `${head.replace(/[\s.,;:–—-]+$/, '')}…`;
}

/**
 * Category colour for a graph node. Content colour, so it keeps its own hue —
 * but lightness is chosen per theme so every hue stays readable as text on
 * `bg`: 55% (the old fixed value) fails for yellows on cream and for blues on
 * slate. Light runs dark enough for 4.5:1, dark runs light enough to clear it.
 */
export function hashColor(seed: string, dark = false): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 60%, ${dark ? 70 : 28}%)`;
}

export function buildGraphFromDump(
  dump: import('@equationalapplications/core-llm-wiki').MemoryDump,
  entityId: string,
) {
  const bundle = dump.entities[entityId];
  if (!bundle) return { nodes: [], edges: [], truncated: false, all: { nodes: [], edges: [] } };
  const nodes = bundle.facts.map((f) => ({
    id: f.id,
    title: f.title ?? 'Untitled',
    body: f.body ?? '',
    confidence: f.confidence ?? 'tentative',
    updatedAt: f.updated_at ?? 0,
    okfType: f.okf_type,
  }));
  const capped = capGraphNodes(nodes);
  const live = new Set(nodes.map((n) => n.id));
  const allEdges = (bundle.edges ?? [])
    .filter((e) => live.has(e.source_id) && live.has(e.target_id))
    .map((e) => ({
      id: e.id,
      sourceId: e.source_id,
      targetId: e.target_id,
      type: e.edge_type,
    }));
  const allowed = new Set(capped.nodes.map((n) => n.id));
  const edges = allEdges.filter((e) => allowed.has(e.sourceId) && allowed.has(e.targetId));
  return {
    nodes: capped.nodes,
    edges,
    truncated: capped.truncated,
    /** Every note and link, uncapped: search and neighbourhood views use these. */
    all: { nodes, edges: allEdges },
  };
}
