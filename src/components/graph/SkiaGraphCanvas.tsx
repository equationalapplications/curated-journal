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
  onSelectNode: (id: string) => void;
  onBackgroundPress: () => void;
};

const DOT_R = 6;
const FONT_SIZE = 12;
const DIM = 0.22;
const CAMERA_MS = 250;

const font: SkFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: FONT_SIZE,
});

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
  useEffect(() => {
    if (userMoved.current) return;
    moveCamera(fitCamera(boundsOf(positions.values()), viewport), false);
  }, [positions, viewport, moveCamera]);

  useEffect(() => {
    if (fitRequest === 0) return;
    userMoved.current = false;
    moveCamera(fitCamera(boundsOf(positions.values()), viewport), true);
    // Only on an explicit request, not on every settle step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  useEffect(() => {
    if (!focusRequest) return;
    const p = positions.get(focusRequest.id);
    if (!p) return;
    userMoved.current = true;
    moveCamera(centerOn({ x: tx.get(), y: ty.get(), scale: sc.get() }, p, viewport), true);
    // Positions may still be settling; centre once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

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
      const hit = hitTest(positions, { x: tx.get(), y: ty.get(), scale: sc.get() }, { x, y });
      if (hit) onSelectNode(hit);
      else onBackgroundPress();
    },
    [positions, onSelectNode, onBackgroundPress, tx, ty, sc],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(4)
      .averageTouches(true)
      .onChange((e) => {
        tx.set(tx.get() + e.changeX);
        ty.set(ty.get() + e.changeY);
      })
      .onEnd(() => {
        scheduleOnRN(commit, tx.get(), ty.get(), sc.get());
      });
    const pinch = Gesture.Pinch()
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
        scheduleOnRN(commit, tx.get(), ty.get(), sc.get());
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
  }, [commit, handleTap, zoomBy, tx, ty, sc]);

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
    () => new Map([...labels].map(([id, text]) => [id, font.measureText(text).width])),
    [labels],
  );
  const visibleLabels = useMemo(
    () =>
      placeLabels(
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
      ),
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
                  font={font}
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
