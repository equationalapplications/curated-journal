import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useMarkdownStyles } from '@/components/ui/markdown-styles';
import { ThemedText } from '@/components/themed-text';
import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type GraphNodeDetail = {
  id: string;
  title: string;
  body?: string;
  okfType?: string;
  confidence?: string;
};

type Props = {
  node: GraphNodeDetail | null;
  onClose: () => void;
  onOpenNote: (id: string) => void;
};

/**
 * The expanded view of a graph node: full title, its type and confidence as
 * chips, and the note's full text. The dialog shape at the bottom of the
 * screen (DESIGN.md Part 3); the body scrolls inside the sheet.
 */
export function GraphNodeSheet({ node, onClose, onOpenNote }: Props) {
  const theme = useTheme();
  const markdown = useMarkdownStyles();
  const { height } = useWindowDimensions();
  const body = node?.body?.trim() ?? '';
  const chips = [node?.okfType, node?.confidence].filter((c): c is string => Boolean(c));

  return (
    <Sheet
      visible={node != null}
      onClose={onClose}
      title={node?.title ?? ''}
      footer={
        <>
          <Button label="Close" onPress={onClose} />
          <Button
            label="Open note"
            variant="primary"
            onPress={() => node && onOpenNote(node.id)}
          />
        </>
      }>
      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <ThemedText
              key={chip}
              type="meta"
              themeColor="onSurfaceVar"
              style={[styles.chip, { backgroundColor: theme.elev1, borderColor: theme.outlineVar }]}>
              {chip}
            </ThemedText>
          ))}
        </View>
      ) : null}
      <ScrollView style={{ maxHeight: height * 0.45 }} accessibilityLabel="Note text">
        {body ? (
          <Markdown style={markdown}>{body}</Markdown>
        ) : (
          <ThemedText type="small" themeColor="outline">
            This note has no text yet.
          </ThemedText>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[1] },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
