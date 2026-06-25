import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
};

export function Screen({ children, style, edges }: ScreenProps) {
  return (
    <SafeAreaView style={[{ flex: 1 }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}
