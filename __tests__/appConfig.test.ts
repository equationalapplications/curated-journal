import { deriveRuntimeVersion } from '../app.config'

describe('deriveRuntimeVersion', () => {
  it('keeps the MAJOR and zeroes the rest', () => {
    expect(deriveRuntimeVersion('3.2.1')).toBe('3.0.0');
    expect(deriveRuntimeVersion('2.0.1')).toBe('2.0.0');
  });

  it('maps MINOR and PATCH bumps to the same runtime version', () => {
    expect(deriveRuntimeVersion('3.0.0')).toBe(deriveRuntimeVersion('3.1.7'));
    expect(deriveRuntimeVersion('3.1.7')).toBe(deriveRuntimeVersion('3.2.0'));
  });

  it('starts a new island only when the MAJOR changes', () => {
    expect(deriveRuntimeVersion('3.9.9')).not.toBe(deriveRuntimeVersion('4.0.0'));
  });
});
