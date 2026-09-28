import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RoundedRect,
  Skia,
  Text,
  matchFont,
  type SkFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { boundsOf, centerOn, fitCamera, hitTest, zoomAround, type Camera } from '@/lib/graphCamera';
import { hashColor, shortLabel } from '@/lib/graphData';
import { LABEL_HEIGHT, LABEL_OFFSET, placeLabels } from '@/lib/graphLabelPlacement';
import type { Pos } from '@/lib/graphLayout';
import { tint } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type CanvasNode = { id: string; title: string; okfType?: string; degree: number };

type Props = {
  nodes: CanvasNode[];
  edges: { sourceId: string; targetId: string }[];
  positions: ReadonlyMap<string, Pos>;
  width: number;
  height: number;
  selectedId: string | null;
  /** When set, these notes (a neighbourhood) stay bright and the rest dim. */
  highlight: ReadonlySet<string> | null;
  /** Centre the camera on a note; the nonce re-triggers for the same id. */
  focusRequest: { id: string; nonce: number } | null;
  /** Bump to fit the whole graph on screen again. */
  fitRequest: number;
  /** True while the layout is still finding its positions (start ones are throwaway). */
  settling: boolean;
  /** Structure key of the shown graph; a change means a different graph is on screen. */
  structureKey: string | null;
  onSelectNode: (id: string) => void;
  onBackgroundPress: () => void;
};

const DOT_R = 6;
const FONT_SIZE = 12;
const DIM = 0.22;
const CAMERA_MS = 250;

// Built lazily, NOT at module load: `matchFont` touches the platform font
// manager, whose web implementation throws (`Skia.FontMgr.System()` is a
// stub in CanvasKit), which would reject GraphCanvas.web's lazy import and
// take down the whole graph tab. On web we also surface the failure
// benignly: `font` stays null, dots and edges still draw, labels don't.
const platformFontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
function loadFont(): SkFont | null {
  try {
    return matchFont({ fontFamily: platformFontFamily, fontSize: FONT_SIZE });
  } catch (e) {
    console.warn('[graph] no system font for labels; drawing without them.', e);
    return null;
  }
}
const font: SkFont | null = loadFont();

/**
 * The graph as a pannable, zoomable Skia canvas.
 *
 * - Edges live in world space inside one transformed group (one path, so a
 *   thousand edges are one draw call); their stroke is divided by the zoom so
 *   they stay hairlines.
 * - Dots and labels live in screen space, each following its world position
 *   through a derived transform, so they keep their size at every zoom.
 * - Which labels are drawn is decided per zoom level (placeLabels): the
 *   selected note and its neighbours first, then the best-connected notes, and
 *   never two overlapping. Pinch in and more names appear.
 * - One tap handler hit-tests in screen space: 48dp targets at any zoom.
 */
export function SkiaGraphCanvas({
  nodes,
  edges,
  positions,
  width,
  height,
  selectedId,
  highlight,
  focusRequest,
  fitRequest,
  settling,
  structureKey,
  onSelectNode,
  onBackgroundPress,
}: Props) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const reduceMotion = useReducedMotion();

  const tx = useSharedValue(width / 2);
  const ty = useSharedValue(height / 2);
  const sc = useSharedValue(1);
  // The camera as of the last gesture end / camera move: drives label placement.
  const [committed, setCommitted] = useState<Camera>({ x: width / 2, y: height / 2, scale: 1 });
  const userMoved = useRef(false);
  // True between a gesture's begin and end: progress publishes must not
  // fight the user's fingers for the camera mid-gesture. Gesture callbacks
  // run as worklets on the UI runtime, so the JS-side ref is updated via
  // scheduleOnRN — a direct write from a worklet would only change the UI
  // runtime's copy.
  const interacting = useRef(false);
  const setInteracting = useCallback((v: boolean) => {
    interacting.current = v;
  }, []);

  const viewport = useMemo(() => ({ width, height }), [width, height]);

  const moveCamera = useCallback(
    (cam: Camera, animate: boolean) => {
      const timing = animate && !reduceMotion;
      tx.set(timing ? withTiming(cam.x, { duration: CAMERA_MS }) : cam.x);
      ty.set(timing ? withTiming(cam.y, { duration: CAMERA_MS }) : cam.y);
      sc.set(timing ? withTiming(cam.scale, { duration: CAMERA_MS }) : cam.scale);
      setCommitted(cam);
    },
    [reduceMotion, tx, ty, sc],
  );

  // Keep the whole graph in view while it settles, until the user takes over.
  // When the shown graph changes (overview ↔ neighbourhood), the old camera
  // position is meaningless for the new graph: re-fit regardless of userMoved.
  const prevGraphKey = useRef(structureKey);
  useEffect(() => {
    const graphChanged = prevGraphKey.current !== structureKey;
    prevGraphKey.current = structureKey;
    if (graphChanged) {
      userMoved.current = false;
      moveCamera(fitCamera(boundsOf(positions.values()), viewport), false);
      return;
    }
    if (userMoved.current || interacting.current) return;
    moveCamera(fitCamera(boundsOf(positions.values()), viewport), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, viewport, moveCamera, structureKey]);

  // Explicit "show whole graph" (the FIT button, and CLEAR_FOCUS's re-fit).
  // fitRequest === 0 means nothing has been requested yet.
  useEffect(() => {
    if (fitRequest === 0) return;
    userMoved.current = false;
    moveCamera(fitCamera(boundsOf(positions.values()), viewport), true);
    // Only on an explicit request, not on every settle step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  // Centring on a note whose position hasn't arrived yet (the layout machine
  // is still restoring the new graph) must not drop the request: park it and
  // retry when positions change. The nonce guard keeps later positions
  // updates from re-centring on an already-handled request.
  const lastNonce = useRef<number | null>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const centre = (id: string) => {
      userMoved.current = true;
      moveCamera(centerOn({ x: tx.get(), y: ty.get(), scale: sc.get() }, positions.get(id)!, viewport), true);
    };
    if (focusRequest.nonce !== lastNonce.current) {
      lastNonce.current = focusRequest.nonce;
      // A stale park from an earlier request must never fire later.
      pendingFocus.current = null;
      // Park unless the note's position belongs to the graph being shown:
      // while settling, positions may still be the previous graph's, and
      // centring on those locks the camera to a spot the new layout won't
      // agree with. The parked branch below retries once settled.
      if (!settling && positions.has(focusRequest.id)) {
        centre(focusRequest.id);
      } else {
        pendingFocus.current = focusRequest.id;
      }
      return;
    }
    const id = pendingFocus.current;
    if (id && positions.has(id)) {
      if (settling) return; // start positions are throwaway; wait for the fit
      pendingFocus.current = null;
      centre(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, positions, settling, viewport, moveCamera]);

  const commit = useCallback((x: number, y: number, scale: number) => {
    userMoved.current = true;
    setCommitted({ x, y, scale });
  }, []);

  const zoomBy = useCallback(
    (x: number, y: number, factor: number) => {
      userMoved.current = true;
      moveCamera(zoomAround({ x: tx.get(), y: ty.get(), scale: sc.get() }, { x, y }, factor), true);
    },
    [moveCamera, tx, ty, sc],
  );

  const handleTap = useCallback(
    (x: number, y: number) => {
      // Only notes actually on screen are tappable: while restoring, stale
      // positions from the previous graph are still in `positions`.
      const onScreen = new Set(nodes.map((n) => n.id));
      const hit = hitTest(positions, { x: tx.get(), y: ty.get(), scale: sc.get() }, { x, y }, 24, onScreen);
      if (hit) onSelectNode(hit);
      else onBackgroundPress();
    },
    [nodes, positions, onSelectNode, onBackgroundPress, tx, ty, sc],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(4)
      .averageTouches(true)
      .onBegin(() => {
        scheduleOnRN(setInteracting, true);
      })
      .onChange((e) => {
        tx.set(tx.get() + e.changeX);
        ty.set(ty.get() + e.changeY);
      })
      .onEnd(() => {
        scheduleOnRN(setInteracting, false);
        scheduleOnRN(commit, tx.get(), ty.get(), sc.get());
      })
      .onFinalize(() => {
        scheduleOnRN(setInteracting, false);
      });
    const pinch = Gesture.Pinch()
      .onBegin(() => {
        scheduleOnRN(setInteracting, true);
      })
      .onChange((e) => {
        const next = zoomAround(
          { x: tx.get(), y: ty.get(), scale: sc.get() },
          { x: e.focalX, y: e.focalY },
          e.scaleChange,
        );
        tx.set(next.x);
        ty.set(next.y);
        sc.set(next.scale);
      })
      .onEnd(() => {
        scheduleOnRN(setInteracting, false);
        scheduleOnRN(commit, tx.get(), ty.get(), sc.get());
      })
      .onFinalize(() => {
        scheduleOnRN(setInteracting, false);
      });
    // Double-tap zooms in 2x around the finger: the one-handed way to zoom.
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(20)
      .onEnd((e, success) => {
        if (success) scheduleOnRN(zoomBy, e.x, e.y, 2);
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((e, success) => {
        if (success) scheduleOnRN(handleTap, e.x, e.y);
      });
    return Gesture.Race(Gesture.Exclusive(doubleTap, tap), Gesture.Simultaneous(pan, pinch));
  }, [commit, handleTap, zoomBy, tx, ty, sc, setInteracting]);

  const worldTransform = useDerivedValue(() => [
    { translateX: tx.get() },
    { translateY: ty.get() },
    { scale: sc.get() },
  ]);
  const hairline = useDerivedValue(() => 1 / sc.get());

  const [edgePath, focusEdgePath] = useMemo(() => {
    const base = Skia.Path.Make();
    const focus = Skia.Path.Make();
    for (const e of edges) {
      const a = positions.get(e.sourceId);
      const b = positions.get(e.targetId);
      if (!a || !b) continue;
      const target = highlight?.has(e.sourceId) && highlight.has(e.targetId) ? focus : base;
      target.moveTo(a.x, a.y);
      target.lineTo(b.x, b.y);
    }
    return [base, focus];
  }, [edges, positions, highlight]);

  const labels = useMemo(() => new Map(nodes.map((n) => [n.id, shortLabel(n.title)])), [nodes]);
  const labelWidths = useMemo(
    // No font (web without a system font manager): empty widths, which makes
    // every label zero-width in placeLabels and drops them from the canvas.
    () => (font ? new Map([...labels].map(([id, text]) => [id, font.measureText(text).width])) : new Map()),
    [labels],
  );
  const visibleLabels = useMemo(
    () =>
      font
        ? placeLabels(
            nodes.map((n) => ({
              id: n.id,
              width: (labelWidths.get(n.id) ?? 0) + 6,
              priority:
                n.id === selectedId
                  ? 1e6
                  : highlight?.has(n.id)
                    ? 1e3 + n.degree
                    : highlight
                      ? n.degree - 1e3
                      : n.degree,
            })),
            positions,
            committed,
            viewport,
          )
        : new Set<string>(),
    [nodes, labelWidths, selectedId, highlight, positions, committed, viewport],
  );

  const edgeColor = tint(theme.outline, highlight ? 20 : 45);
  const labelBg = tint(theme.bg, 85);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.wrap, { width, height }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Graph of ${nodes.length} notes`}
        accessibilityHint="Use Find a note above to open a note.">
        <Canvas style={{ width, height }}>
          <Group transform={worldTransform}>
            <Path path={edgePath} color={edgeColor} style="stroke" strokeWidth={hairline} />
            {highlight ? (
              <Path
                path={focusEdgePath}
                color={theme.outline}
                style="stroke"
                strokeWidth={hairline}
              />
            ) : null}
          </Group>
          {/* Two passes: every dot first, then every label on top, so no dot
              ever paints over a label. */}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            return (
              <Follow
                key={n.id}
                p={p}
                tx={tx}
                ty={ty}
                sc={sc}
                opacity={!highlight || highlight.has(n.id) ? 1 : DIM}>
                {n.id === selectedId ? (
                  <Circle
                    cx={0}
                    cy={0}
                    r={DOT_R + 4}
                    color={theme.primary}
                    style="stroke"
                    strokeWidth={2}
                  />
                ) : null}
                <Circle cx={0} cy={0} r={DOT_R} color={hashColor(n.okfType ?? n.id, dark)} />
              </Follow>
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            const text = labels.get(n.id);
            if (!p || !text || !visibleLabels.has(n.id)) return null;
            const w = labelWidths.get(n.id) ?? 0;
            return (
              <Follow
                key={`label-${n.id}`}
                p={p}
                tx={tx}
                ty={ty}
                sc={sc}
                // Outside the focused neighbourhood, labels recede with their dots.
                opacity={!highlight || highlight.has(n.id) ? 1 : 0.5}>
                <RoundedRect
                  x={-w / 2 - 3}
                  y={LABEL_OFFSET}
                  width={w + 6}
                  height={LABEL_HEIGHT}
                  r={4}
                  color={labelBg}
                />
                <Text
                  x={-w / 2}
                  y={LABEL_OFFSET + FONT_SIZE + 0.5}
                  text={text}
                  font={font!}
                  color={highlight?.has(n.id) ? theme.onSurface : theme.onSurfaceVar}
                />
              </Follow>
            );
          })}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

/** Screen-space group that follows a world position through the camera. */
function Follow({
  p,
  tx,
  ty,
  sc,
  opacity,
  children,
}: {
  p: Pos;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  sc: SharedValue<number>;
  opacity: number;
  children: ReactNode;
}) {
  const { x, y } = p;
  const transform = useDerivedValue(
    () => [{ translateX: x * sc.get() + tx.get() }, { translateY: y * sc.get() + ty.get() }],
    [x, y],
  );
  return (
    <Group transform={transform} opacity={opacity}>
      {children}
    </Group>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
