import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { hashColor } from '@/lib/graphData';
import { Space } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { OntologyManifest } from '@equationalapplications/core-llm-wiki';

type Props = {
  manifest: OntologyManifest | null;
};

/**
 * Node/edge type key. Types are chips, not bare text: a pill carrying the
 * category colour, so the colour reads as a swatch rather than as a label
 * competing with the canvas.
 */
export function GraphLegend({ manifest }: Props) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const nodeTypes = manifest?.node_types ?? [];
  const edgeTypes = manifest?.edge_types ?? [];

  if (nodeTypes.length === 0 && edgeTypes.length === 0) return null;

  return (
    <View style={styles.container} accessibilityLabel="Graph legend">
      {nodeTypes.length > 0 ? (
        <>
          <ThemedText type="label">Node types</ThemedText>
          <View style={styles.chips}>
            {nodeTypes.map((t) => (
              <View key={t.type} style={styles.chip}>
                <View style={[styles.swatch, { backgroundColor: hashColor(t.type, dark) }]} />
                <ThemedText type="meta" themeColor="onSurfaceVar">
                  {t.type}
                </ThemedText>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {edgeTypes.length > 0 ? (
        <>
          <ThemedText type="label" style={styles.secondaryLabel}>
            Edge types
          </ThemedText>
          <View style={styles.chips}>
            {edgeTypes.map((t) => (
              <ThemedText key={t.type} type="meta" themeColor="outline">
                {t.type}
              </ThemedText>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    gap: Space[2],
  },
  secondaryLabel: { marginTop: Space[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Space[1] },
  swatch: { width: 10, height: 10, borderRadius: 999 },
});
