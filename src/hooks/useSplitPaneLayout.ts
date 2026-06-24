import { useWindowDimensions } from 'react-native';
import { SPLIT_PANE_MIN_WIDTH } from '@/lib/constants';

export function useSplitPaneLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= SPLIT_PANE_MIN_WIDTH;
  return { isWide, width, height };
}
