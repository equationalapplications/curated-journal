import type { Pos } from '@/lib/graphLayout';

/**
 * Pan/zoom camera for the graph: `screen = world * scale + (x, y)`.
 * Functions are marked as worklets so gesture handlers can run them on the
 * UI thread; they are plain functions everywhere else.
 */
export type Camera = { x: number; y: number; scale: number };
export type Viewport = { width: number; height: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function boundsOf(points: Iterable<Pos>): Bounds | null {
  let b: Bounds | null = null;
  for (const p of points) {
    if (!b) b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else {
      b.minX = Math.min(b.minX, p.x);
      b.minY = Math.min(b.minY, p.y);
      b.maxX = Math.max(b.maxX, p.x);
      b.maxY = Math.max(b.maxY, p.y);
    }
  }
  return b;
}

/**
 * Fit the bounds into the viewport with `pad` screen pixels on each side.
 * Never zooms in past 1.5x, so a two-note graph isn't blown up.
 */
export function fitCamera(bounds: Bounds | null, viewport: Viewport, pad = 56): Camera {
  if (!bounds || viewport.width <= 0 || viewport.height <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };
  }
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = clampScale(
    Math.min(1.5, (viewport.width - 2 * pad) / w, (viewport.height - 2 * pad) / h),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: viewport.width / 2 - cx * scale, y: viewport.height / 2 - cy * scale, scale };
}

export function worldToScreen(p: Pos, cam: Camera): Pos {
  'worklet';
  return { x: p.x * cam.scale + cam.x, y: p.y * cam.scale + cam.y };
}

export function screenToWorld(p: Pos, cam: Camera): Pos {
  'worklet';
  return { x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale };
}

/** Zoom by `factor` keeping the world point under `focal` (screen) fixed. */
export function zoomAround(cam: Camera, focal: Pos, factor: number): Camera {
  'worklet';
  const scale = clampScale(cam.scale * factor);
  const k = scale / cam.scale;
  return { x: focal.x - (focal.x - cam.x) * k, y: focal.y - (focal.y - cam.y) * k, scale };
}

/** Centre `world` in the viewport, zooming in to at least `minScale`. */
export function centerOn(cam: Camera, world: Pos, viewport: Viewport, minScale = 1): Camera {
  const scale = clampScale(Math.max(cam.scale, minScale));
  return {
    x: viewport.width / 2 - world.x * scale,
    y: viewport.height / 2 - world.y * scale,
    scale,
  };
}

/**
 * The node nearest a tap, within `radius` screen pixels (a 48dp target is a
 * 24px radius), or null. Distances are measured on screen, so the target
 * size is the same at every zoom level.
 */
export function hitTest(
  positions: ReadonlyMap<string, Pos>,
  cam: Camera,
  tap: Pos,
  radius = 24,
): string | null {
  let best: string | null = null;
  let bestD = radius * radius;
  for (const [id, p] of positions) {
    const s = worldToScreen(p, cam);
    const d = (s.x - tap.x) ** 2 + (s.y - tap.y) ** 2;
    if (d <= bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}
