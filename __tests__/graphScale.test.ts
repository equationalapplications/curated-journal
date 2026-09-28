import { boundsOf, centerOn, fitCamera, hitTest, screenToWorld, worldToScreen, zoomAround, MAX_SCALE, MIN_SCALE } from '@/lib/graphCamera';
import { egoGraph, neighbourhood, searchNotes } from '@/lib/graphFocus';
import { placeLabels } from '@/lib/graphLabelPlacement';
import { createLayoutRun, settle, type Pos } from '@/lib/graphLayout';

// A journal shaped like the seed fixture: a linked cluster plus some notes
// with no links at all.
function journal(linked: number, unlinked: number) {
  const ids = Array.from({ length: linked + unlinked }, (_, i) => `n${i}`);
  const links: [string, string][] = [];
  for (let i = 0; i < linked; i++) {
    for (const k of [7, 18, 30]) links.push([`n${i}`, `n${(i + k) % linked}`]);
  }
  return { ids, links };
}

const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.y - b.y);

describe('createLayoutRun', () => {
  it('settles in bounded steps and places every node', () => {
    const run = createLayoutRun(journal(50, 5));
    let steps = 0;
    while (!run.step(5)) steps += 1;
    expect(steps).toBeLessThan(500);
    const pos = run.positions();
    expect(pos.size).toBe(55);
    for (const p of pos.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('honours the per-step time budget', () => {
    let t = 0;
    const run = createLayoutRun(journal(200, 0), undefined, () => (t += 1)); // each tick = 1ms
    run.step(5);
    expect(run.done).toBe(false); // stopped by the budget, not by settling
  });

  it('keeps unlinked notes near the linked cluster (gravity)', () => {
    const pos = settle(createLayoutRun(journal(50, 5)));
    const cluster = [...Array(50).keys()].map((i) => pos.get(`n${i}`)!);
    const b = boundsOf(cluster)!;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    for (let i = 50; i < 55; i++) {
      expect(dist(pos.get(`n${i}`)!, centre)).toBeLessThan(span * 1.5);
    }
  });

  it('warm start: adding one note barely moves the others', () => {
    const base = journal(40, 0);
    const before = settle(createLayoutRun(base));
    const grown = { ids: [...base.ids, 'new'], links: [...base.links, ['new', 'n0'] as [string, string]] };
    const after = settle(createLayoutRun(grown, before));
    const moved = base.ids.map((id) => dist(before.get(id)!, after.get(id)!));
    const median = moved.sort((a, b) => a - b)[Math.floor(moved.length / 2)];
    expect(median).toBeLessThan(10); // world units; link distance is 60 (cold start: ~39)
    expect(dist(after.get('new')!, after.get('n0')!)).toBeLessThan(120);
  });
});

describe('camera', () => {
  const viewport = { width: 400, height: 600 };

  it('fits bounds inside the padded viewport', () => {
    const cam = fitCamera({ minX: -500, minY: -300, maxX: 500, maxY: 300 }, viewport, 50);
    const tl = worldToScreen({ x: -500, y: -300 }, cam);
    const br = worldToScreen({ x: 500, y: 300 }, cam);
    expect(tl.x).toBeGreaterThanOrEqual(49.9);
    expect(br.x).toBeLessThanOrEqual(350.1);
    expect(tl.y).toBeGreaterThanOrEqual(49.9);
    expect(br.y).toBeLessThanOrEqual(550.1);
  });

  it('does not blow up a tiny graph', () => {
    expect(fitCamera({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, viewport).scale).toBeLessThanOrEqual(1.5);
  });

  it('round-trips screen and world', () => {
    const cam = { x: 12, y: -30, scale: 0.7 };
    const w = screenToWorld(worldToScreen({ x: 33, y: -8 }, cam), cam);
    expect(w.x).toBeCloseTo(33);
    expect(w.y).toBeCloseTo(-8);
  });

  it('zooms around the focal point and clamps', () => {
    const cam = { x: 10, y: 20, scale: 1 };
    const focal = { x: 200, y: 300 };
    const worldAtFocal = screenToWorld(focal, cam);
    const z = zoomAround(cam, focal, 2);
    const s = worldToScreen(worldAtFocal, z);
    expect(s.x).toBeCloseTo(200);
    expect(s.y).toBeCloseTo(300);
    expect(zoomAround(cam, focal, 1000).scale).toBe(MAX_SCALE);
    expect(zoomAround(cam, focal, 0.0001).scale).toBe(MIN_SCALE);
  });

  it('centres a node and zooms in to at least 1x', () => {
    const c = centerOn({ x: 0, y: 0, scale: 0.3 }, { x: 100, y: 50 }, viewport);
    expect(c.scale).toBe(1);
    const s = worldToScreen({ x: 100, y: 50 }, c);
    expect(s).toEqual({ x: 200, y: 300 });
  });

  it('hit-tests in screen space, nearest wins', () => {
    const pos = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 0 }],
    ]);
    const cam = { x: 100, y: 100, scale: 1 };
    expect(hitTest(pos, cam, { x: 108, y: 100 })).toBe('b');
    expect(hitTest(pos, cam, { x: 100, y: 160 })).toBeNull();
    // Zoomed out 10x the same 24px radius still applies on screen.
    expect(hitTest(pos, { x: 100, y: 100, scale: 0.1 }, { x: 120, y: 100 })).not.toBeNull();
  });
});

describe('placeLabels', () => {
  const viewport = { width: 400, height: 400 };
  const cam = { x: 200, y: 200, scale: 1 };

  it('never places overlapping labels, highest priority first', () => {
    const pos = new Map([
      ['hub', { x: 0, y: 0 }],
      ['near', { x: 5, y: 0 }],
      ['far', { x: 150, y: 0 }],
    ]);
    const shown = placeLabels(
      [
        { id: 'near', width: 80, priority: 1 },
        { id: 'hub', width: 80, priority: 5 },
        { id: 'far', width: 80, priority: 0 },
      ],
      pos,
      cam,
      viewport,
    );
    expect([...shown].sort()).toEqual(['far', 'hub']);
  });

  it('shows more labels as you zoom in', () => {
    const pos = new Map(Array.from({ length: 30 }, (_, i) => [`n${i}`, { x: (i % 6) * 12, y: Math.floor(i / 6) * 12 }]));
    const cands = [...pos.keys()].map((id) => ({ id, width: 70, priority: 0 }));
    const out = placeLabels(cands, pos, { x: 150, y: 150, scale: 0.5 }, viewport).size;
    const zoomed = placeLabels(cands, pos, { x: 50, y: 50, scale: 4 }, viewport).size;
    expect(zoomed).toBeGreaterThan(out);
  });

  it('skips labels that are off screen', () => {
    const pos = new Map([['gone', { x: 5000, y: 0 }]]);
    expect(placeLabels([{ id: 'gone', width: 50, priority: 9 }], pos, cam, viewport).size).toBe(0);
  });
});

describe('focus and search', () => {
  const edges = [
    { sourceId: 'a', targetId: 'b' },
    { sourceId: 'c', targetId: 'a' },
    { sourceId: 'c', targetId: 'd' },
    { sourceId: 'e', targetId: 'f' },
  ];

  it('neighbourhood is the note plus one link away, both directions', () => {
    expect([...neighbourhood('a', edges)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ego graph adds two-hop notes when there is room, and caps', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
    expect(egoGraph('a', nodes, edges).nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(egoGraph('a', nodes, edges, 3).nodes).toHaveLength(3);
    expect(egoGraph('a', nodes, edges).edges.every((e) => e.sourceId !== 'e')).toBe(true);
  });

  it('ranks title prefix > word prefix > title substring > body', () => {
    const notes = [
      { id: '1', title: 'Weekend hike', body: 'walked the ridge' },
      { id: '2', title: 'Notes on walking', body: '' },
      { id: '3', title: 'Crosswalk safety', body: '' },
      { id: '4', title: 'Walk to work', body: '' },
    ];
    expect(searchNotes(notes, 'walk').map((n) => n.id)).toEqual(['4', '2', '3', '1']);
    expect(searchNotes(notes, '  ')).toEqual([]);
    expect(searchNotes(notes, 'WALK', 2)).toHaveLength(2);
  });
});
