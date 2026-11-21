import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Space } from '@/constants/theme';
import { useModelHub } from '@/hooks/useModelHub';

/** The "Connect to Wi-Fi" message and retry, shared by the hub screens. */
export function AwaitingWifi() {
  const { send } = useModelHub();
  return (
    <View style={styles.wifi} testID="awaiting-wifi">
      <ThemedText type="strong">Connect to Wi-Fi to continue</ThemedText>
      <Button label="Try again" variant="default" onPress={() => send({ type: 'CHECK_NETWORK' })} />
      <Button
        label="Choose another model"
        variant="default"
        onPress={() => send({ type: 'LEAVE_WAITING' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wifi: { gap: Space[3] } });
