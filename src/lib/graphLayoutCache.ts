import Storage from 'expo-sqlite/kv-store';

import type { Pos } from '@/lib/graphLayout';

/** Settled positions for one graph structure, identified by its key's hash. */
export type CachedLayout = { hash: string; positions: Map<string, Pos> };

export type LayoutCache = {
  read: (scope: string) => Promise<CachedLayout | null>;
  write: (scope: string, layout: CachedLayout) => void;
};

/** cyrb53: a fast 53-bit string hash; a collision only costs a re-layout. */
export function hashKey(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const PREFIX = 'graph-layout:v1:';

/**
 * Layout cache in the SQLite-backed kv-store, with an in-memory front so tab
 * switches don't touch disk. Positions are rounded to 0.1 world units.
 */
export function createKvLayoutCache(): LayoutCache {
  const memory = new Map<string, CachedLayout>();
  return {
    async read(scope) {
      const hit = memory.get(scope);
      if (hit) return hit;
      try {
        const raw = await Storage.getItemAsync(PREFIX + scope);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { h: string; p: [string, number, number][] };
        const layout = { hash: parsed.h, positions: new Map(parsed.p.map(([id, x, y]) => [id, { x, y }])) };
        memory.set(scope, layout);
        return layout;
      } catch {
        return null; // a bad cache only costs a fresh layout
      }
    },
    write(scope, layout) {
      memory.set(scope, layout);
      const p = [...layout.positions].map(([id, { x, y }]) => [
        id,
        Math.round(x * 10) / 10,
        Math.round(y * 10) / 10,
      ]);
      Storage.setItemAsync(PREFIX + scope, JSON.stringify({ h: layout.hash, p })).catch(() => {});
    },
  };
}
