import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onSave: (input: { title: string; body: string }) => void | Promise<void>;
  onCancel: () => void;
  /** Machine-owned save-in-flight flag (hashing|ingesting) — derives the Save button label. */
  saving?: boolean;
};

export function JournalEntryEditor({ onSave, onCancel, saving = false }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollView testID="editor-kbd-aware" bottomOffset={16}>
        <TextInput
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { color: theme.text }]}
          placeholderTextColor={theme.outline}
        />
        <TextInput
          placeholder="Write in markdown…"
          value={body}
          onChangeText={setBody}
          multiline
          style={[styles.input, styles.body, { color: theme.text }]}
          placeholderTextColor={theme.outline}
        />
        <View style={styles.actions}>
          <Button title="Cancel" onPress={onCancel} />
          <Button title={saving ? 'Saving…' : 'Save'} onPress={() => onSave({ title, body })} />
        </View>
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8 },
  body: { flex: 1, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
});
