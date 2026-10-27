import appConfig, { deriveRuntimeVersion } from '../app.config'
import appJson from '../app.json'

describe('deriveRuntimeVersion', () => {
  it('keeps the MAJOR and zeroes the rest', () => {
    expect(deriveRuntimeVersion('3.2.1')).toBe('3.0.0');
    expect(deriveRuntimeVersion('2.0.1')).toBe('2.0.0');
  });

  it('rejects malformed version strings', () => {
    expect(() => deriveRuntimeVersion('')).toThrow();
    expect(() => deriveRuntimeVersion('abc')).toThrow();
    expect(() => deriveRuntimeVersion('3.')).toThrow();
  });

  it('guards against the retired appVersion policy returning to app.json', () => {
    expect(appJson.expo.runtimeVersion).toBeUndefined();
  });

  it('maps MINOR and PATCH bumps to the same runtime version', () => {
    expect(deriveRuntimeVersion('3.0.0')).toBe(deriveRuntimeVersion('3.1.7'));
    expect(deriveRuntimeVersion('3.1.7')).toBe(deriveRuntimeVersion('3.2.0'));
  });

  it('starts a new island only when the MAJOR changes', () => {
    expect(deriveRuntimeVersion('3.9.9')).not.toBe(deriveRuntimeVersion('4.0.0'));
  });
});

describe('app config privacy + OTA gate', () => {
  it('disables the launch-time update check (strict privacy holds from app start)', () => {
    expect(appConfig.expo.updates.checkAutomatically).toBe('NEVER');
  });

  it('keeps the OTA url and production channel literal', () => {
    expect(appConfig.expo.updates.url).toBe(
      'https://u.expo.dev/7bfd46bc-09d3-40d0-a3af-1ea0ea77304b',
    );
    expect(appConfig.expo.updates.requestHeaders).toEqual({
      'expo-channel-name': 'production',
    });
  });

  it('derives the runtime version from the app version MAJOR', () => {
    expect(appConfig.expo.runtimeVersion).toBe(
      deriveRuntimeVersion(appJson.expo.version),
    );
    expect(appConfig.expo.runtimeVersion).toMatch(/^\d+\.0\.0$/);
  });
});
