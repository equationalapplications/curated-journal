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
  __dirname,
  '..',
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

// Line comments stripped, so an explanatory comment quoting the old expression
// cannot trip the negative assertion below.
function stripLineComments(kotlin: string): string {
  return kotlin.replace(/\/\/.*$/gm, '');
}

describe('react-native-screens null-stack guard patch (#51)', () => {
  let source: string;

  beforeAll(() => {
    source = stripLineComments(readFileSync(KOTLIN_PATH, 'utf8'));
  });

  it('installs the source file the patch targets', () => {
    expect(source).toContain('fun onUpdate()');
  });

  it('returns early when the screen has no stack', () => {
    expect(source).toContain('if (stack == null) {');
  });

  it('no longer treats a null stack as "is top"', () => {
    expect(source).not.toContain('stack == null || stack.topScreen == parent');
  });

  it('computes isTop only after the null-stack guard', () => {
    const guard = source.indexOf('if (stack == null) {');
    const isTop = source.indexOf('val isTop = stack.topScreen == parent');
    expect(isTop).toBeGreaterThan(guard);
  });
});
