import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useMachine } from '@xstate/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useOntologyManifest, useWiki } from '@equationalapplications/expo-llm-wiki';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { GraphLegend } from '@/components/graph/GraphLegend';
import { GraphNodeSheet } from '@/components/graph/GraphNodeSheet';
import { Button, IconButton } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner, Note } from '@/components/ui/states';
import { ProgressBar } from '@/components/ui/progress';
import { buildGraphFromDump } from '@/lib/graphData';
import { egoGraph, neighbourhood, searchNotes } from '@/lib/graphFocus';
import { graphStructureKey } from '@/lib/graphLayout';
import { useGraphLayout } from '@/hooks/useGraphLayout';
import { useJournal } from '@/contexts/JournalContext';
import { useTheme } from '@/hooks/use-theme';
import { graphLoadMachine } from '@/machines/graphLoadMachine';
import { graphViewMachine } from '@/machines/graphViewMachine';
import { GRAPH_NODE_CAP } from '@/lib/constants';
import { Radius, Space } from '@/constants/theme';

type Graph = ReturnType<typeof buildGraphFromDump>;

export default function GraphScreen() {
  const { entityId } = useJournal();
  const wiki = useWiki();
  const theme = useTheme();
  const { manifest } = useOntologyManifest(entityId);
  const router = useRouter();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [view, sendView] = useMachine(graphViewMachine);
  const { focusId, sheetId, query } = view.context;
  const [actorRef, send] = useMachine(graphLoadMachine, {
    input: {
      load: async () => buildGraphFromDump(await wiki.exportDump([entityId]), entityId),
    },
  });

  // (Re)load whenever the tab gains focus. Tab screens stay mounted, so a
  // mount-only load never saw notes saved after the first visit. The old
  // graph stays on screen while the reload runs (the machine keeps
  // `context.graph`), and a LOAD while already loading restarts the load so
  // the result can't miss a save that landed mid-read. Must be an effect,
  // not useMemo: the React compiler drops side effects in useMemo.
  useFocusEffect(
    useCallback(() => {
      send({ type: 'LOAD' });
    }, [send]),
  );

  const state = actorRef;
  const graph = state.context.graph as Graph | null;

  // The view machine decides overview vs. a note's neighbourhood from the
  // overview's ids; a note outside the capped overview gets its own
  // neighbourhood graph, so every note in a large journal is reachable.
  const inOverview = useMemo(() => new Set(graph?.nodes.map((n) => n.id)), [graph]);
  useEffect(() => {
    sendView({ type: 'OVERVIEW', ids: inOverview });
  }, [inOverview, sendView]);
  const egoMode = view.matches({ focus: 'neighbourhood' });
  const shown = useMemo(() => {
    if (!graph) return null;
    return egoMode && focusId ? egoGraph(focusId, graph.all.nodes, graph.all.edges) : graph;
  }, [graph, egoMode, focusId]);

  // Layout is keyed on structure (ids + edges), not on the graph object:
  // a reload that finds the same graph reuses the saved positions.
  const structureKey = shown ? graphStructureKey(shown.nodes, shown.edges) : null;
  const { positions, settling } = useGraphLayout(structureKey, egoMode ? null : entityId);

  const canvasNodes = useMemo(() => {
    if (!shown) return [];
    const degree = new Map<string, number>();
    for (const e of shown.edges) {
      degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
      degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
    }
    return shown.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      okfType: n.okfType ?? undefined,
      degree: degree.get(n.id) ?? 0,
    }));
  }, [shown]);

  const highlight = useMemo(
    () => (focusId && shown ? neighbourhood(focusId, shown.edges) : null),
    [focusId, shown],
  );

  const byId = useMemo(() => new Map(graph?.all.nodes.map((n) => [n.id, n])), [graph]);
  const results = useMemo(() => searchNotes(graph?.all.nodes ?? [], query), [graph, query]);
  const focused = focusId ? byId.get(focusId) : undefined;
  const sheetNode = sheetId ? byId.get(sheetId) : undefined;

  // The machine owns the issued request ({id, nonce}); TAP_NODE without a
  // requestCentre leaves this object identical, so the canvas doesn't
  // re-centre on every tap of an already-focused graph.
  const focusRequest = view.context.focusRequest;
  const onSelectNode = useCallback((id: string) => sendView({ type: 'TAP_NODE', id }), [sendView]);
  const onBackgroundPress = useCallback(() => sendView({ type: 'TAP_BACKGROUND' }), [sendView]);

  const onCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

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
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={18}
            tintColor={theme.outline}
            style={styles.searchIcon}
          />
          <Input
            value={query}
            onChangeText={(text) => sendView({ type: 'SEARCH', query: text })}
            placeholder={`Find a note (${graph.all.nodes.length})`}
            accessibilityLabel="Find a note"
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
            onSubmitEditing={() => {
              if (results[0]) sendView({ type: 'PICK', id: results[0].id });
            }}
          />
        </View>
        {query ? (
          <IconButton label="Clear search" onPress={() => sendView({ type: 'SEARCH', query: '' })}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
              size={18}
              tintColor={theme.onSurfaceVar}
            />
          </IconButton>
        ) : null}
      </View>

      {focused ? (
        <View style={[styles.focusBar, { borderBottomColor: theme.separator }]}>
          <ThemedText type="label" numberOfLines={1} style={styles.focusLabel}>
            {egoMode ? 'Around' : 'Focused'}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1} style={styles.focusTitle}>
            {focused.title}
          </ThemedText>
          <Button label="Details" variant="link" onPress={() => sendView({ type: 'OPEN_DETAILS' })} />
          <Button
            label={egoMode ? 'All notes' : 'Clear'}
            variant="ghost"
            onPress={() => sendView({ type: 'CLEAR_FOCUS' })}
          />
        </View>
      ) : graph.truncated ? (
        <Note style={styles.banner}>
          Showing {GRAPH_NODE_CAP} of {graph.all.nodes.length} notes, the most recent
          high-confidence ones. Find a note above to see any of them.
        </Note>
      ) : null}

      <GraphLegend manifest={manifest} />

      <View style={styles.canvasArea} onLayout={onCanvasLayout}>
        {positions && canvasSize.width > 0 ? (
          <GraphCanvas
            nodes={canvasNodes}
            edges={shown?.edges ?? []}
            positions={positions}
            width={canvasSize.width}
            height={canvasSize.height}
            selectedId={focusId}
            highlight={highlight}
            focusRequest={focusRequest}
            fitRequest={view.context.fitRequest}
            onSelectNode={onSelectNode}
            onBackgroundPress={onBackgroundPress}
          />
        ) : null}
        {settling ? (
          <ThemedText type="meta" style={styles.settling} accessibilityLiveRegion="polite">
            Arranging notes…
          </ThemedText>
        ) : null}
        <View style={styles.fab}>
          <IconButton
            label="Show whole graph"
            onPress={() => sendView({ type: 'FIT' })}
            style={[styles.fabButton, { backgroundColor: theme.elev1, borderColor: theme.outlineVar }]}>
            <SymbolView
              name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'fit_screen', web: 'fit_screen' }}
              size={20}
              tintColor={theme.onSurfaceVar}
            />
          </IconButton>
        </View>

        {view.matches({ search: 'typing' }) ? (
          <View style={styles.results}>
            <ListGroup>
              {results.length === 0 ? (
                <ThemedText type="small" themeColor="outline" style={styles.noResults}>
                  No notes match “{query.trim()}”.
                </ThemedText>
              ) : (
                results.map((n, i) => (
                  <ListRow
                    key={n.id}
                    divider={i < results.length - 1}
                    accessibilityLabel={`Focus ${n.title}`}
                    onPress={() => {
                      Keyboard.dismiss();
                      sendView({ type: 'PICK', id: n.id });
                    }}>
                    <ThemedText numberOfLines={1}>{n.title}</ThemedText>
                    {!inOverview.has(n.id) ? (
                      <ThemedText type="meta">Not in the overview; opens its neighbourhood</ThemedText>
                    ) : null}
                  </ListRow>
                ))
              )}
            </ListGroup>
          </View>
        ) : null}
      </View>

      <GraphNodeSheet
        node={sheetNode ?? null}
        onClose={() => sendView({ type: 'CLOSE_SHEET' })}
        onOpenNote={(factId) => {
          sendView({ type: 'CLOSE_SHEET' });
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
  banner: { marginHorizontal: Space[4], marginBottom: Space[2] },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[1],
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    paddingBottom: Space[2],
  },
  searchField: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: Space[3], zIndex: 1 },
  searchInput: { paddingLeft: Space[3] + 18 + Space[2] },
  focusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    paddingLeft: Space[4],
    paddingRight: Space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  focusLabel: { flexShrink: 0 },
  focusTitle: { flex: 1 },
  canvasArea: { flex: 1, overflow: 'hidden' },
  settling: { position: 'absolute', left: Space[4], top: Space[2] },
  fab: { position: 'absolute', right: Space[4], bottom: Space[4] },
  fabButton: { borderWidth: 1, borderRadius: Radius.sm },
  results: { position: 'absolute', left: Space[4], right: Space[4], top: 0 },
  noResults: { padding: Space[3] },
});
