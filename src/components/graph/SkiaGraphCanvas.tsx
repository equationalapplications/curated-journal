import { useEffect, useMemo, useState } from 'react';
import { Canvas, Circle, Line } from '@shopify/react-native-skia';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SimLink, SimNode } from '@/lib/graphSimulation';
import { hashColor } from '@/lib/graphData';

type Props = {
  nodes: Array<SimNode & { title: string; okfType?: string }>;
  links: SimLink[];
  size: number;
  onSelectNode: (id: string) => void;
};

export function SkiaGraphCanvas({ nodes, links, size, onSelectNode }: Props) {
  const positions = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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
              color="#888"
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
            color={hashColor(node.okfType ?? node.id)}
          />
        ))}
      </Canvas>
      {nodes.map((node) => (
        <Pressable
          key={`tap-${node.id}`}
          style={[
            styles.hit,
            {
              left: (node.x ?? 0) - 14,
              top: (node.y ?? 0) - 14,
              width: 28,
              height: 28,
            },
          ]}
          onPress={() => onSelectNode(node.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hit: { position: 'absolute' },
});
