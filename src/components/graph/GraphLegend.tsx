import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { hashColor } from '@/lib/graphData';
import type { OntologyManifest } from '@equationalapplications/core-llm-wiki';

type Props = {
  manifest: OntologyManifest | null;
};

export function GraphLegend({ manifest }: Props) {
  const nodeTypes = manifest?.node_types ?? [];
  const edgeTypes = manifest?.edge_types ?? [];

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">Node types</ThemedText>
      {nodeTypes.map((t) => (
        <ThemedText key={t.type} type="small" style={{ color: hashColor(t.type) }}>
          {t.type}
        </ThemedText>
      ))}
      <ThemedText type="smallBold">Edge types</ThemedText>
      {edgeTypes.map((t) => (
        <ThemedText key={t.type} type="small">
          {t.type}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ container: { padding: 12, gap: 4 } });
