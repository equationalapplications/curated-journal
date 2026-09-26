import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

// OKF import extracts zips with react-native-nitro-unzip and expo-file-system,
// neither of which runs on web (spec NG4). The native screen lives in import.tsx.
export default function ImportScreen() {
  return (
    <View style={styles.container}>
      <ThemedText>Importing OKF bundles is available in the iOS and Android apps.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
