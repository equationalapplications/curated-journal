import { GRAPH_NODE_CAP } from '@/lib/constants';

export type GraphNodeInput = {
  id: string;
  title: string;
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

export function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function buildGraphFromDump(
  dump: import('@equationalapplications/core-llm-wiki').MemoryDump,
  entityId: string,
) {
  const bundle = dump.entities[entityId];
  if (!bundle) return { nodes: [], edges: [], truncated: false };
  const nodes = bundle.facts.map((f) => ({
    id: f.id,
    title: f.title ?? 'Untitled',
    confidence: f.confidence ?? 'tentative',
    updatedAt: f.updated_at ?? 0,
    okfType: f.okf_type,
  }));
  const capped = capGraphNodes(nodes);
  const allowed = new Set(capped.nodes.map((n) => n.id));
  const edges = (bundle.edges ?? [])
    .filter((e) => allowed.has(e.source_id) && allowed.has(e.target_id))
    .map((e) => ({
      id: e.id,
      sourceId: e.source_id,
      targetId: e.target_id,
      type: e.edge_type,
    }));
  return { nodes: capped.nodes, edges, truncated: capped.truncated };
}
