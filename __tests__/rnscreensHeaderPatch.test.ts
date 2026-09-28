import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Canary for the carried react-native-screens patch (issue #51).
 *
 * `patch-package` exits non-zero when a patch fails to apply, so a drifted
 * patch is already loud. This test covers the quieter case: the patch file
 * being absent from the commit, or `postinstall` being skipped.
 *
 * The 4.26.x file lives at the flat package path; a later 4.x moved it to
 * `legacy/`. If this test cannot find the file, that move has happened and
 * the patch needs re-basing — do not silently skip.
 */
const KOTLIN_PATH = join(
  process.cwd(),
  'node_modules',
  'react-native-screens',
  'android',
  'src',
  'main',
  'java',
  'com',
  'swmansion',
  'rnscreens',
  'ScreenStackHeaderConfig.kt',
);

function readSource(): string {
  return readFileSync(KOTLIN_PATH, 'utf8');
}

describe('react-native-screens null-stack guard patch (#51)', () => {
  it('installs the source file the patch targets', () => {
    expect(readSource()).toContain('fun onUpdate()');
  });

  it('returns early when the screen has no stack', () => {
    const source = readSource();
    const guard = source.indexOf('if (stack == null) {');
    expect(guard).toBeGreaterThan(-1);
  });

  it('no longer treats a null stack as "is top"', () => {
    expect(readSource()).not.toContain('stack == null || stack.topScreen == parent');
  });

  it('computes isTop only from a non-null stack', () => {
    const source = readSource();
    const guard = source.indexOf('if (stack == null) {');
    const isTop = source.indexOf('val isTop = stack.topScreen == parent');
    expect(isTop).toBeGreaterThan(guard);
  });
});
