import { worldToScreen, type Camera, type Viewport } from '@/lib/graphCamera';
import type { Pos } from '@/lib/graphLayout';

export type LabelCandidate = {
  id: string;
  /** Screen-pixel width of the rendered label. */
  width: number;
  /** Higher places first: selected > its neighbours > well-connected notes. */
  priority: number;
};

export const LABEL_HEIGHT = 16;
/** Gap between the dot's centre and the top of its label. */
export const LABEL_OFFSET = 10;

type Rect = { x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Which labels to draw at this zoom level: greedily, highest priority first,
 * any on-screen label whose box doesn't overlap one already placed. Zoomed
 * out you see the hubs; zoom in and more labels fit. Labels never overprint.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  positions: ReadonlyMap<string, Pos>,
  cam: Camera,
  viewport: Viewport,
  gap = 4,
): Set<string> {
  const placed: Rect[] = [];
  const visible = new Set<string>();
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of ordered) {
    const p = positions.get(c.id);
    if (!p) continue;
    const s = worldToScreen(p, cam);
    const rect: Rect = {
      x: s.x - c.width / 2 - gap / 2,
      y: s.y + LABEL_OFFSET - gap / 2,
      w: c.width + gap,
      h: LABEL_HEIGHT + gap,
    };
    const onScreen =
      rect.x + rect.w > 0 && rect.x < viewport.width && rect.y + rect.h > 0 && s.y < viewport.height;
    if (!onScreen) continue;
    if (placed.some((r) => overlaps(r, rect))) continue;
    placed.push(rect);
    visible.add(c.id);
  }
  return visible;
}
