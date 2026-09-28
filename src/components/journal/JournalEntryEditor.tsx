import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Space, TouchTarget } from '@/constants/theme';

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
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAwareScrollView
        testID="editor-kbd-aware"
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <ThemedText type="label" style={styles.label}>
          New note
        </ThemedText>
        <Input
          testID="editor-title"
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />
        <Input
          testID="editor-body"
          placeholder="Write in markdown…"
          value={body}
          onChangeText={setBody}
          multiline
          style={[styles.input, styles.body]}
        />
        <View style={styles.actions}>
          <Button label="Cancel" variant="default" onPress={onCancel} />
          <Button
            label={saving ? 'Saving…' : 'Save'}
            variant="primary"
            disabled={saving}
            onPress={() => onSave({ title, body })}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Space[4], gap: Space[3] },
  label: { marginBottom: -Space[2] },
  input: { minHeight: TouchTarget },
  body: { flex: 1, minHeight: 220, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space[2] },
});
