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
    expect(() => deriveRuntimeVersion('3.x.y')).toThrow();
    expect(() => deriveRuntimeVersion('03.1.0')).toThrow();
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

describe('iPad support (specs/2026-11-12-ipad-support)', () => {
  // An iPhone-only build runs on iPad in compatibility mode, where the
  // keyboard frame and window size disagree and the keyboard covers inputs.
  it('ships as a universal iOS app', () => {
    expect(appConfig.expo.ios?.supportsTablet).toBe(true);
  });

  // R2: iPad multitasking (Split View, Stage Manager) needs no full-screen
  // requirement. Prebuild forces all four ~ipad orientations whenever
  // multitasking is on, so `orientation` pins the iPhone list, not iPad's.
  it('stays multitasking-compatible (R2)', () => {
    expect(appConfig.expo.orientation).toBe('default');
    expect(appConfig.expo.ios?.requireFullScreen).not.toBe(true);
    expect(appConfig.expo.ios?.infoPlist?.UIRequiresFullScreen).not.toBe(true);
  });

  // R3: universal iOS is a native change, so it ships as a MAJOR (9.0.0).
  // Assert the floor, not the exact value, so later MAJORs don't break this.
  it('ships on a 9.x-or-later runtime (R3)', () => {
    const major = Number(appConfig.expo.runtimeVersion.split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(9);
  });
});
