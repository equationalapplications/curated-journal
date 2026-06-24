import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
};

export function GraphNodeSheet({ visible, title, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <ThemedText type="subtitle">{title}</ThemedText>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#fff' },
});
