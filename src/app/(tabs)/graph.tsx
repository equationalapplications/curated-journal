import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useWiki, useOntologyManifest } from '@equationalapplications/expo-llm-wiki';
import { SkiaGraphCanvas } from '@/components/graph/SkiaGraphCanvas';
import { GraphLegend } from '@/components/graph/GraphLegend';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';
import { ThemedText } from '@/components/themed-text';
import { buildGraphFromDump } from '@/lib/graphData';
import { runGraphSimulation } from '@/lib/graphSimulation';
import { useJournal } from '@/contexts/JournalContext';

export default function GraphScreen() {
  const { entityId } = useJournal();
  const wiki = useWiki();
  const { manifest } = useOntologyManifest(entityId);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width, height - 120);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<ReturnType<typeof buildGraphFromDump> | null>(null);

  useEffect(() => {
    void (async () => {
      const dump = await wiki.exportDump([entityId]);
      setGraph(buildGraphFromDump(dump, entityId));
    })();
  }, [entityId, wiki]);

  const layoutNodes = useMemo(() => {
    if (!graph) return [];
    const simNodes = graph.nodes.map((n) => ({ id: n.id }));
    const links = graph.edges.map((e) => ({ source: e.sourceId, target: e.targetId }));
    const positioned = runGraphSimulation(simNodes, links, size);
    return positioned.map((p) => {
      const meta = graph.nodes.find((n) => n.id === p.id);
      return { ...p, title: meta?.title ?? p.id, okfType: meta?.okfType ?? undefined };
    });
  }, [graph, size]);

  const selected = layoutNodes.find((n) => n.id === selectedId);

  if (!graph) {
    return (
      <View style={styles.container}>
        <ThemedText>Loading graph…</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {graph.truncated ? (
        <ThemedText style={styles.banner}>
          Showing 200 most recent high-confidence notes. Run Night Shift to organize the full graph.
        </ThemedText>
      ) : null}
      <GraphLegend manifest={manifest} />
      <SkiaGraphCanvas
        nodes={layoutNodes}
        links={graph.edges.map((e) => ({ source: e.sourceId, target: e.targetId }))}
        size={size}
        onSelectNode={setSelectedId}
      />
      <GraphNodeSheet
        visible={Boolean(selected)}
        title={selected?.title ?? ''}
        onClose={() => setSelectedId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { padding: 12 },
});
