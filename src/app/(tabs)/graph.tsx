import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useMachine } from '@xstate/react';
import { useOntologyManifest, useWiki } from '@equationalapplications/expo-llm-wiki';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphLegend } from '@/components/graph/GraphLegend';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';
import { ThemedText } from '@/components/themed-text';
import { buildGraphFromDump } from '@/lib/graphData';
import { runGraphSimulation } from '@/lib/graphSimulation';
import { useJournal } from '@/contexts/JournalContext';
import { graphLoadMachine } from '@/machines/graphLoadMachine';

export default function GraphScreen() {
  const { entityId } = useJournal();
  const wiki = useWiki();
  const { manifest } = useOntologyManifest(entityId);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width, height - 120);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actorRef, send] = useMachine(graphLoadMachine, {
    input: {
      load: async () => buildGraphFromDump(await wiki.exportDump([entityId]), entityId),
    },
  });
  const state = actorRef;
  const graph = state.context.graph as
    | ReturnType<typeof buildGraphFromDump>
    | null;

  const layoutNodes = useMemo(() => {
    if (!graph) return [];
    const simNodes = graph.nodes.map((n) => ({ id: n.id }));
    const links = graph.edges.map((e) => ({
      source: e.sourceId,
      target: e.targetId,
    }));
    const positioned = runGraphSimulation(simNodes, links, size);
    return positioned.map((p) => {
      const meta = graph.nodes.find((n) => n.id === p.id);
      return { ...p, title: meta?.title ?? p.id, okfType: meta?.okfType ?? undefined };
    });
  }, [graph, size]);

  const selected = layoutNodes.find((n) => n.id === selectedId);

  if (state.matches('failed')) {
    return (
      <View style={styles.container}>
        <ThemedText>Couldn&apos;t load the graph.</ThemedText>
        <ThemedText type="small">{state.context.error?.message}</ThemedText>
        <ThemedText type="link" onPress={() => send({ type: 'RETRY' })}>
          Retry
        </ThemedText>
      </View>
    );
  }

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
      <GraphCanvas
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
