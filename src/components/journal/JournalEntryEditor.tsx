import { useRef, useState } from 'react';
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
};

export function JournalEntryEditor({ onSave, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const theme = useTheme();
  // Save enqueues and closes the editor; a second tap landing before the
  // editor unmounts must not queue the note twice.
  const saved = useRef(false);
  const handleSave = () => {
    if (saved.current) return;
    saved.current = true;
    void onSave({ title, body });
  };

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
          <Button label="Save" variant="primary" onPress={handleSave} />
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
