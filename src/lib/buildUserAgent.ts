import { Platform } from 'react-native';

export function buildUserAgent(): string {
  let version = '1.0';
  try {
    const Application = require('expo-application') as typeof import('expo-application');
    version = Application.nativeApplicationVersion ?? '1.0';
  } catch {
    if (!__DEV__) throw new Error('expo-application is not available. Rebuild the dev client.');
  }
  return `CuratedJournal/${version} (Expo; ${Platform.OS})`;
}
