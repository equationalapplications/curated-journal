import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useMachine } from '@xstate/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useOntologyManifest, useWiki } from '@equationalapplications/expo-llm-wiki';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphLegend } from '@/components/graph/GraphLegend';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';
import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner, Note } from '@/components/ui/states';
import { ProgressBar } from '@/components/ui/progress';
import { buildGraphFromDump } from '@/lib/graphData';
import { runGraphSimulation } from '@/lib/graphSimulation';
import { useJournal } from '@/contexts/JournalContext';
import { graphLoadMachine } from '@/machines/graphLoadMachine';
import { Space } from '@/constants/theme';

export default function GraphScreen() {
  const { entityId } = useJournal();
  const wiki = useWiki();
  const { manifest } = useOntologyManifest(entityId);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width, height - 120);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();
  const [actorRef, send] = useMachine(graphLoadMachine, {
    input: {
      load: async () => buildGraphFromDump(await wiki.exportDump([entityId]), entityId),
    },
  });

  // (Re)load whenever the tab gains focus. Tab screens stay mounted, so a
  // mount-only load never saw notes saved after the first visit. The old
  // graph stays on screen while the reload runs (the machine keeps
  // `context.graph`), and a LOAD while already loading is ignored. Must be an
  // effect, not useMemo: the React compiler drops side effects in useMemo.
  useFocusEffect(
    useCallback(() => {
      send({ type: 'LOAD' });
    }, [send]),
  );

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
      return {
        ...p,
        title: meta?.title ?? p.id,
        body: meta?.body,
        confidence: meta?.confidence,
        okfType: meta?.okfType ?? undefined,
      };
    });
  }, [graph, size]);

  const selected = layoutNodes.find((n) => n.id === selectedId);

  if (state.matches('failed')) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ErrorBanner
          message={state.context.error?.message ?? "Couldn't load the graph."}
          action={
            <Button label="Retry" variant="default" onPress={() => send({ type: 'RETRY' })} />
          }
        />
      </View>
    );
  }

  if (!graph) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.loading}>
          <ProgressBar value={0} />
          <ThemedText type="small" themeColor="onSurfaceVar" style={styles.loadingLabel}>
            Loading graph…
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {graph.truncated ? (
        <Note style={styles.banner}>
          Showing 200 most recent high-confidence notes. Run Night Shift to organize the full
          graph.
        </Note>
      ) : null}
      <GraphLegend manifest={manifest} />
      <GraphCanvas
        nodes={layoutNodes}
        links={graph.edges.map((e) => ({ source: e.sourceId, target: e.targetId }))}
        size={size}
        onSelectNode={setSelectedId}
      />
      <GraphNodeSheet
        node={selected ?? null}
        onClose={() => setSelectedId(null)}
        onOpenNote={(factId) => {
          setSelectedId(null);
          router.push({ pathname: '/entry/[factId]', params: { factId } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Space[4] },
  loading: { width: '60%', gap: Space[2] },
  loadingLabel: { textAlign: 'center' },
  banner: { margin: Space[3] },
});
