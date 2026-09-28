import { createActor, waitFor } from 'xstate';
import { graphLayoutMachine, type FrameScheduler } from '@/machines/graphLayoutMachine';
import { graphViewMachine } from '@/machines/graphViewMachine';
import { graphStructureKey, type Pos } from '@/lib/graphLayout';
import { hashKey, type CachedLayout, type LayoutCache } from '@/lib/graphLayoutCache';

jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {} }));

/** Manual frames: nothing runs until the test pumps them. */
function manualFrames() {
  let queue: (() => void)[] = [];
  let t = 0;
  const frames: FrameScheduler = {
    request: (cb) => queue.push(cb),
    cancel: () => {
      queue = [];
    },
    // Advances on every call: the layout's step() budget loop needs a moving
    // clock, or the first frame runs the whole simulation to completion
    // (Opus M3, PR #42) and "mid-settle" tests never actually are.
    now: () => (t += 1),
  };
  return {
    frames,
    pending: () => queue.length,
    pump(n = 1) {
      for (let i = 0; i < n && queue.length; i++) {
        const q = queue;
        queue = [];
        t += 16;
        q.forEach((cb) => cb());
      }
    },
    pumpAll() {
      for (let i = 0; i < 5000 && queue.length; i++) this.pump();
    },
  };
}

function memoryCache(initial?: Record<string, CachedLayout>) {
  const store = new Map(Object.entries(initial ?? {}));
  const cache: LayoutCache & { writes: number } = {
    writes: 0,
    read: async (scope) => store.get(scope) ?? null,
    write: (scope, layout) => {
      cache.writes += 1;
      store.set(scope, layout);
    },
  };
  return cache;
}

const ring = (n: number) => {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
  const edges = nodes.map((_, i) => ({ sourceId: `n${i}`, targetId: `n${(i + 1) % n}` }));
  return graphStructureKey(nodes, edges);
};

describe('graphLayoutMachine', () => {
  it('settles frame by frame, publishing progress, then persists', async () => {
    const f = manualFrames();
    const cache = memoryCache();
    const actor = createActor(graphLayoutMachine, { input: { cache, frames: f.frames } }).start();
    actor.send({ type: 'STRUCTURE', key: ring(30), scope: 'e1' });
    await waitFor(actor, (s) => s.matches('settling'));
    expect(actor.getSnapshot().context.positions?.size).toBe(30); // initial positions right away
    expect(f.pending()).toBe(1); // no work done synchronously
    f.pumpAll();
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(cache.writes).toBe(1);
  });

  it('restores a cached layout for the same structure without simulating', async () => {
    const f = manualFrames();
    const key = ring(10);
    const positions = new Map<string, Pos>(Array.from({ length: 10 }, (_, i) => [`n${i}`, { x: i, y: i }]));
    const cache = memoryCache({ e1: { hash: hashKey(key), positions } });
    const actor = createActor(graphLayoutMachine, { input: { cache, frames: f.frames } }).start();
    actor.send({ type: 'STRUCTURE', key, scope: 'e1' });
    await waitFor(actor, (s) => s.matches('settled'));
    expect(actor.getSnapshot().context.positions).toBe(positions);
    expect(f.pending()).toBe(0);
  });

  it('warm-starts from the cache when the structure changed', async () => {
    const f = manualFrames();
    const old = new Map<string, Pos>([['n0', { x: 500, y: 500 }]]);
    const cache = memoryCache({ e1: { hash: 'stale', positions: old } });
    const actor = createActor(graphLayoutMachine, { input: { cache, frames: f.frames } }).start();
    actor.send({ type: 'STRUCTURE', key: ring(5), scope: 'e1' });
    await waitFor(actor, (s) => s.matches('settling'));
    expect(actor.getSnapshot().context.positions?.get('n0')).toEqual({ x: 500, y: 500 });
  });

  it('a new structure mid-settle stops the old run and starts over', async () => {
    const f = manualFrames();
    const actor = createActor(graphLayoutMachine, { input: { cache: memoryCache(), frames: f.frames } }).start();
    actor.send({ type: 'STRUCTURE', key: ring(40), scope: 'e1' });
    await waitFor(actor, (s) => s.matches('settling'));
    f.pump(2);
    // One frame is scheduled mid-settle (the moving clock keeps the run alive).
    expect(f.pending()).toBe(1);
    actor.send({ type: 'STRUCTURE', key: ring(8), scope: 'e1' });
    // Regression guard (CodeRabbit, PR #42): leaving `settling` must stop the
    // old run — its scheduled frame is cancelled, so nothing fires until the
    // new simulation schedules its own.
    expect(f.pending()).toBe(0);
    await waitFor(actor, (s) => s.matches('settling'));
    f.pumpAll();
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(actor.getSnapshot().context.positions?.size).toBe(8);
  });

  it('ignores a repeated STRUCTURE for the same key', async () => {
    const f = manualFrames();
    const cache = memoryCache();
    const actor = createActor(graphLayoutMachine, { input: { cache, frames: f.frames } }).start();
    const key = ring(6);
    actor.send({ type: 'STRUCTURE', key, scope: 'e1' });
    await waitFor(actor, (s) => s.matches('settling'));
    f.pumpAll();
    actor.send({ type: 'STRUCTURE', key, scope: 'e1' });
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(cache.writes).toBe(1);
  });

  it('does not persist throwaway (scope null) layouts', async () => {
    const f = manualFrames();
    const cache = memoryCache();
    const actor = createActor(graphLayoutMachine, { input: { cache, frames: f.frames } }).start();
    actor.send({ type: 'STRUCTURE', key: ring(6), scope: null });
    await waitFor(actor, (s) => s.matches('settling'));
    f.pumpAll();
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(cache.writes).toBe(0);
  });
});

describe('graphViewMachine', () => {
  const start = () => {
    const actor = createActor(graphViewMachine).start();
    actor.send({ type: 'OVERVIEW', ids: new Set(['a', 'b']) });
    return actor;
  };
  const snap = (a: ReturnType<typeof start>) => a.getSnapshot();

  it('tapping a node focuses it and opens its sheet; background tap clears focus', () => {
    const a = start();
    a.send({ type: 'TAP_NODE', id: 'a' });
    expect(snap(a).matches({ focus: 'focused', sheet: 'open' })).toBe(true);
    expect(snap(a).context).toMatchObject({ focusId: 'a', sheetId: 'a' });
    a.send({ type: 'CLOSE_SHEET' });
    a.send({ type: 'TAP_BACKGROUND' });
    expect(snap(a).matches({ focus: 'none', sheet: 'closed' })).toBe(true);
  });

  it('picking a search result in the overview focuses it, centres, and clears the search', () => {
    const a = start();
    a.send({ type: 'SEARCH', query: 'mor' });
    expect(snap(a).matches({ search: 'typing' })).toBe(true);
    a.send({ type: 'PICK', id: 'b' });
    expect(snap(a).matches({ focus: 'focused', search: 'idle', sheet: 'closed' })).toBe(true);
    expect(snap(a).context).toMatchObject({ focusId: 'b', query: '', focusRequest: { id: 'b', nonce: 1 } });
  });

  it('a note outside the overview opens its neighbourhood, which background taps keep', () => {
    const a = start();
    a.send({ type: 'PICK', id: 'z' });
    expect(snap(a).matches({ focus: 'neighbourhood' })).toBe(true);
    a.send({ type: 'TAP_BACKGROUND' });
    expect(snap(a).matches({ focus: 'neighbourhood' })).toBe(true);
    a.send({ type: 'CLEAR_FOCUS' });
    expect(snap(a).matches({ focus: 'none' })).toBe(true);
    expect(snap(a).context.fitRequest).toBe(1);
  });

  it('follows the note between overview and neighbourhood as reloads change the cap', () => {
    const a = start();
    a.send({ type: 'TAP_NODE', id: 'a' });
    a.send({ type: 'OVERVIEW', ids: new Set(['b']) });
    expect(snap(a).matches({ focus: 'neighbourhood' })).toBe(true);
    a.send({ type: 'OVERVIEW', ids: new Set(['a', 'b']) });
    expect(snap(a).matches({ focus: 'focused' })).toBe(true);
  });

  it('Details opens the sheet for the focused note only', () => {
    const a = start();
    a.send({ type: 'OPEN_DETAILS' });
    expect(snap(a).matches({ sheet: 'closed' })).toBe(true);
    a.send({ type: 'PICK', id: 'a' });
    a.send({ type: 'OPEN_DETAILS' });
    expect(snap(a).matches({ sheet: 'open' })).toBe(true);
    expect(snap(a).context.sheetId).toBe('a');
  });

  it('clearing the search text returns to idle', () => {
    const a = start();
    a.send({ type: 'SEARCH', query: 'x' });
    a.send({ type: 'SEARCH', query: '  ' });
    expect(snap(a).matches({ search: 'idle' })).toBe(true);
    expect(snap(a).context.query).toBe('');
  });
});
