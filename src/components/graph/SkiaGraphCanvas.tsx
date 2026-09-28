import { useMemo } from 'react';
import { Canvas, Circle, Line } from '@shopify/react-native-skia';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SimLink, SimNode } from '@/lib/graphSimulation';
import { hashColor, shortLabel } from '@/lib/graphData';
import { ThemedText } from '@/components/themed-text';
import { Radius, tint } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { TouchTarget } from '@/constants/theme';

const DOT_R = 10;
/** Label box width; matches GRAPH_EDGE_PAD.x * 2 in graphSimulation. */
const LABEL_W = 128;
/** Dot hit area (48dp) plus the one-line label under it. */
const HIT_H = TouchTarget + 16;

type Props = {
  nodes: Array<SimNode & { title: string; okfType?: string }>;
  links: SimLink[];
  size: number;
  onSelectNode: (id: string) => void;
};

export function SkiaGraphCanvas({ nodes, links, size, onSelectNode }: Props) {
  const positions = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  // An edge is chrome: a hairline `outline` tint, not a hardcoded grey.
  const edgeColor = tint(theme.outline, 45);

  return (
    <View style={styles.wrap}>
      {/* Canvas and tap overlay share one size x size box, so overlay
          coordinates are canvas coordinates. */}
      <View style={{ width: size, height: size }}>
        <Canvas style={{ width: size, height: size }}>
          {links.map((link, index) => {
            const source = positions.get(String(link.source));
            const target = positions.get(String(link.target));
            if (!source?.x || !target?.x || source.y == null || target.y == null) return null;
            return (
              <Line
                key={`${link.source}-${link.target}-${index}`}
                p1={{ x: source.x, y: source.y }}
                p2={{ x: target.x, y: target.y }}
                color={edgeColor}
                strokeWidth={1}
              />
            );
          })}
          {nodes.map((node) => (
            <Circle
              key={node.id}
              cx={node.x ?? size / 2}
              cy={node.y ?? size / 2}
              r={DOT_R}
              color={hashColor(node.okfType ?? node.id, dark)}
            />
          ))}
        </Canvas>
        {nodes.map((node) => (
          <Pressable
            key={`tap-${node.id}`}
            accessibilityRole="button"
            accessibilityLabel={node.title}
            accessibilityHint="Shows the full note"
            style={[
              styles.hit,
              {
                // One target for the dot and its label: 48dp around the dot,
                // extended down over the label.
                left: (node.x ?? 0) - LABEL_W / 2,
                top: (node.y ?? 0) - TouchTarget / 2,
                width: LABEL_W,
                height: HIT_H,
              },
            ]}
            onPress={() => onSelectNode(node.id)}>
            <View
              style={[styles.labelWrap, { top: TouchTarget / 2 + DOT_R + 2 }]}
              pointerEvents="none">
              <ThemedText
                type="meta"
                themeColor="onSurfaceVar"
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                // A bg-coloured backing keeps the label legible over edges.
                style={[styles.label, { backgroundColor: tint(theme.bg, 85) }]}>
                {shortLabel(node.title)}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hit: { position: 'absolute' },
  labelWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  label: { paddingHorizontal: 3, borderRadius: Radius.sm, textAlign: 'center' },
});
