import { useMemo } from 'react';
import { Canvas, Circle, Line } from '@shopify/react-native-skia';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SimLink, SimNode } from '@/lib/graphSimulation';
import { hashColor } from '@/lib/graphData';
import { tint } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { TouchTarget } from '@/constants/theme';

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
            r={10}
            color={hashColor(node.okfType ?? node.id, dark)}
          />
        ))}
      </Canvas>
      {nodes.map((node) => (
        <Pressable
          key={`tap-${node.id}`}
          accessibilityRole="button"
          accessibilityLabel={node.title}
          style={[
            styles.hit,
            {
              // Hit area is padded to 48dp; the 10px dot stays compact.
              left: (node.x ?? 0) - TouchTarget / 2,
              top: (node.y ?? 0) - TouchTarget / 2,
              width: TouchTarget,
              height: TouchTarget,
            },
          ]}
          onPress={() => onSelectNode(node.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hit: { position: 'absolute' },
});
