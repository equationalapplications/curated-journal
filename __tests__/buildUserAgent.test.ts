import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { buildUserAgent } from '@/lib/buildUserAgent';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0' }));

describe('buildUserAgent', () => {
  it('matches the required format on iOS', () => {
    Platform.OS = 'ios';
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; ios)');
  });

  it('matches the required format on android', () => {
    Platform.OS = 'android';
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; android)');
  });

  it('falls back to 1.0 when nativeApplicationVersion is null', () => {
    jest.mocked(Application).nativeApplicationVersion = null;
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; android)');
  });
});
