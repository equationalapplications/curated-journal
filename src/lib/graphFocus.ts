import type { GraphEdgeInput, GraphNodeInput } from '@/lib/graphData';

type Edge = Pick<GraphEdgeInput, 'sourceId' | 'targetId'>;

/** The note plus every note one link away. */
export function neighbourhood(id: string, edges: readonly Edge[]): Set<string> {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.sourceId === id) out.add(e.targetId);
    if (e.targetId === id) out.add(e.sourceId);
  }
  return out;
}

/**
 * Search every note, not just the ones the overview can show. Ranked: title
 * starts with the query, then a title word starts with it, then the title
 * contains it, then the body does. Case-insensitive; ties keep input order
 * (which is the wiki's fact order, not a relevance order).
 */
export function searchNotes<T extends Pick<GraphNodeInput, 'id' | 'title' | 'body'>>(
  notes: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { note: T; score: number; index: number }[] = [];
  notes.forEach((note, index) => {
    const title = note.title.toLowerCase();
    let score = 0;
    if (title.startsWith(q)) score = 4;
    else if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) score = 3;
    else if (title.includes(q)) score = 2;
    else if (note.body?.toLowerCase().includes(q)) score = 1;
    if (score > 0) scored.push({ note, score, index });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.note);
}

/**
 * A graph centred on one note: the note, its direct links, then (if there is
 * room) notes two links away, capped at `maxNodes` overall — a hub with more
 * direct links than the cap is truncated like any other over-cap graph.
 * Used when the note isn't in the capped overview.
 */
export function egoGraph<N extends { id: string }, E extends Edge>(
  id: string,
  nodes: readonly N[],
  edges: readonly E[],
  maxNodes = 60,
): { nodes: N[]; edges: E[] } {
  const direct = neighbourhood(id, edges);
  const keep = new Set<string>([id]);
  // Direct links first (edge order — arbitrary, not a relevance rank), then
  // two-hop notes, until the cap. `id` always stays.
  for (const n of direct) {
    if (keep.size >= maxNodes) break;
    keep.add(n);
  }
  if (keep.size < maxNodes) {
    for (const n of [...direct]) {
      if (keep.size >= maxNodes) break;
      for (const m of neighbourhood(n, edges)) {
        if (keep.size >= maxNodes) break;
        keep.add(m);
      }
    }
  }
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.sourceId) && keep.has(e.targetId)),
  };
}
