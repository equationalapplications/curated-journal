import { Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { splitCitationSegments } from '@/lib/citationParser';
import { useCitationNavigation } from '@/contexts/CitationNavigationContext';
import { useJournal } from '@/contexts/JournalContext';

type Props = {
  content: string;
};

export function CitationText({ content }: Props) {
  const { openCitation } = useCitationNavigation();
  const { setPaneMode, setSelectedFactId } = useJournal();
  const segments = splitCitationSegments(content);

  return (
    <Text style={styles.text}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <Text key={index}>{segment.value}</Text>;
        }
        return (
          <Pressable
            key={index}
            onPress={() => {
              void Haptics.selectionAsync();
              setSelectedFactId(segment.value);
              setPaneMode('notes');
              openCitation(segment.value);
            }}>
            <Text style={styles.chip}>[{segment.value}]</Text>
          </Pressable>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 24 },
  chip: { color: '#3c87f7', fontWeight: '600' },
});
