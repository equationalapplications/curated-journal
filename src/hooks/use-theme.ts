/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // RN 0.88 strict types: useColorScheme is 'light' | 'dark' | null — the
  // 'unspecified' value is gone (null means "no preference / unavailable").
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
