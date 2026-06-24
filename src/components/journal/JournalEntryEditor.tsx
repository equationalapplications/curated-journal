import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';

type Props = {
  onSave: (input: { title: string; body: string }) => Promise<void>;
  onCancel: () => void;
};

export function JournalEntryEditor({ onSave, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={styles.input} />
      <TextInput
        placeholder="Write in markdown…"
        value={body}
        onChangeText={setBody}
        multiline
        style={[styles.input, styles.body]}
      />
      <View style={styles.actions}>
        <Button title="Cancel" onPress={onCancel} />
        <Button
          title={saving ? 'Saving…' : 'Save'}
          onPress={async () => {
            setSaving(true);
            try {
              await onSave({ title, body });
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8 },
  body: { flex: 1, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
});
