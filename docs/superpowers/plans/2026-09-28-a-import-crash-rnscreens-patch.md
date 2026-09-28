# Android Import Crash (#51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry upstream react-native-screens PR #4498 as a `patch-package` patch so the fatal Android OKF-import crash is fixed for every header-bearing route.

**Architecture:** The crash is an upstream bug in `ScreenStackHeaderConfig.onUpdate()`, which treats a screen detached from its stack as "is top" and falls into a `check(container is ScreenStack)` assertion. The fix is six lines in one Kotlin file. We apply it to `node_modules`, generate a patch file, and wire `patch-package` into `postinstall` so the patch is re-applied on every install — including in the EAS build environment. A canary jest test reads the installed Kotlin and fails if the patch is ever absent.

**Tech Stack:** `patch-package` (npm), Gradle/Android autolinking, Jest (`jest-expo`), react-native-screens 4.26.2.

**Spec:** `docs/superpowers/specs/2026-09-28-issues-51-53-import-crash-and-model-hub-design.md` §4.1, §6, §7 (R2), §8 (Part A). The spec travels with this plan — read §4.1 before starting.

## Global Constraints

- `react-native-screens` stays at `~4.26.0` (installed 4.26.2). Do **not** bump it, and do **not** add an `overrides` entry — Plan A is deliberately a patch, not a version change.
- Do **not** upgrade to `react-native-screens` 5.0.0-alpha.
- The patch must be **committed**. It is the deliverable; a patch that only exists in `node_modules` is not a fix.
- The Kotlin file in 4.26.2 is at the **flat** package path `com/swmansion/rnscreens/ScreenStackHeaderConfig.kt`. Upstream's diff is written against a later `legacy/` subpackage that does not exist here. Do not "fix" a path mismatch by editing the patch file by hand.
- Lint scope is `npx eslint src __tests__`. Baseline is **0 errors / 71 pre-existing warnings** — do not add new ones, and do not try to fix the existing 71.
- Test baseline before starting: **47 suites / 250 tests, all passing.**

---

### Task 1: Carry the null-stack guard as a patch-package patch

**Files:**
- Modify: `package.json` (add `patch-package` devDependency, add `postinstall` script)
- Create: `patches/react-native-screens+4.26.2.patch` (generated, then committed)
- Create: `__tests__/rnscreensHeaderPatch.test.ts`
- Modify (transient, not committed): `node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt`

**Interfaces:**
- Consumes: nothing. This task is self-contained and has no dependency on the model-hub work in Plan B.
- Produces: a committed `patches/react-native-screens+4.26.2.patch` that `patch-package` re-applies on every `npm install`, and a canary test `__tests__/rnscreensHeaderPatch.test.ts` that fails if the patch is missing.

- [ ] **Step 1: Confirm the baseline test suite is green and the bug line is present**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
grep -n "val isTop" node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt
```

Expected: the suite reports 47 suites / 250 tests passing, and the grep prints
`233:        val isTop = stack == null || stack.topScreen == parent`.

**If the grep finds nothing, stop.** The installed version is not 4.26.2 and this plan's patch will not apply — report back rather than adapting it.

- [ ] **Step 2: Install `patch-package` and wire `postinstall`**

Run:

```bash
npm install --save-dev patch-package
```

Then edit `package.json` so the `scripts` block contains a `postinstall` entry. Place it first in the block:

```json
  "scripts": {
    "postinstall": "patch-package",
    "start": "expo start",
```

Do not otherwise reorder or reformat the scripts block.

- [ ] **Step 3: Write the failing canary test**

Create `__tests__/rnscreensHeaderPatch.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the canary test and verify it fails**

Run:

```bash
npx jest __tests__/rnscreensHeaderPatch.test.ts
```

Expected: 2 of 4 tests FAIL. The two that must fail are
`returns early when the screen has no stack` and `no longer treats a null stack as "is top"`.
The other two pass already, because the source file exists and the guard has not been added yet.

This failure is the point of the test — it proves the canary detects an unpatched install.

- [ ] **Step 5: Apply the guard to the installed Kotlin file**

In `node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt`, find this block (around line 231):

```kotlin
    fun onUpdate() {
        val stack = screenStack
        val isTop = stack == null || stack.topScreen == parent

        if (!isAttachedToWindow || !isTop || isDestroyed) {
            return
```

Replace it with:

```kotlin
    fun onUpdate() {
        val stack = screenStack
        // A screen that is not in a stack has nothing to configure a header for, and
        // `canNavigateBack()` below asserts on exactly this condition. Treating a null
        // stack as "is top" let a detached screen reach that assertion and throw.
        if (stack == null) {
            return
        }
        val isTop = stack.topScreen == parent

        if (!isAttachedToWindow || !isTop || isDestroyed) {
            return
```

This is the substance of
[software-mansion/react-native-screens#4498](https://github.com/software-mansion/react-native-screens/pull/4498),
which is still open and unmerged. The comment is carried over verbatim so the patch is
recognisable against upstream and easy to drop when #4498 ships.

- [ ] **Step 6: Run the canary test and verify it passes**

Run:

```bash
npx jest __tests__/rnscreensHeaderPatch.test.ts
```

Expected: 4 of 4 PASS.

- [ ] **Step 7: Generate the patch file**

Run:

```bash
npx patch-package react-native-screens
```

Expected: `patches/react-native-screens+4.26.2.patch` is created, and the output contains no
warnings or errors.

- [ ] **Step 8: Read the generated patch and confirm it is only the intended change**

Run:

```bash
cat patches/react-native-screens+4.26.2.patch
```

Expected: a single-file diff against
`android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt` containing one
removed line (`val isTop = stack == null || stack.topScreen == parent`) and the added guard
plus its comment. If the diff touches any other file, or contains unrelated hunks, the
installed package has local modifications — investigate before committing.

- [ ] **Step 9: Prove the patch re-applies from clean**

Run:

```bash
git stash list
rm -rf node_modules/react-native-screens
npm install
npx jest __tests__/rnscreensHeaderPatch.test.ts
```

Expected: `npm install` runs `postinstall`, `patch-package` reports applying
`react-native-screens`, and all 4 canary tests PASS. This is the step that proves the fix
survives a fresh install — and therefore that it will be present in an EAS build.

- [ ] **Step 10: Run the full suite and lint**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
```

Expected: 48 suites / 254 tests passing (47 + the new canary suite, 250 + 4). Lint reports
0 errors and 71 warnings.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json patches/ __tests__/rnscreensHeaderPatch.test.ts
git commit -m "$(cat <<'EOF'
fix(android): carry rnscreens #4498 to stop the OKF import crash (#51)

ScreenStackHeaderConfig.onUpdate() computes isTop as
`stack == null || stack.topScreen == parent`, so a screen transiently
detached from its stack is treated as top and falls into
canNavigateBack(), whose check(container is ScreenStack) throws on that
same null. The programmatic router.back() in import.tsx when the import
reaches `done` is exactly such a prop update, so importing an OKF zip on
Android black-screens and kills the app in release builds.

The fix is upstream software-mansion/react-native-screens#4498, still
open and unmerged; 4.28.0 still carries the bug. Carried here as a
patch-package patch so every header-bearing route is covered, not just
the import flow — entry/[factId] is reachable in normal navigation too.

The patch keys to 4.26.2, where the file is at the flat package path; a
later 4.x moved it to legacy/, so a version bump will fail the patch
loudly in postinstall rather than silently reintroducing the crash.
Drop this patch when #4498 merges.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

Note `package-lock.json` is included: `patch-package` must be in the lockfile or a clean
`npm ci` in CI will not install it.

---

### Task 2: Verify the fix on a real Android build

This task produces no committed code. It produces the evidence that closes #51, and it is
the acceptance criterion for the issue — do not skip it or substitute an emulator-only run.

**Files:** none modified. If any step reveals a problem, return to Task 1.

**Interfaces:**
- Consumes: the committed patch from Task 1.
- Produces: verification evidence for the #51 close comment.

- [ ] **Step 1: Start Metro with the mock provider**

Run:

```bash
EXPO_PUBLIC_DEV_LLM=mock npx expo start
```

Leave it running in the background. Metro and the `Pixel_API_36` emulator
(`emulator-5554`) both survive across sessions in this environment.

- [ ] **Step 2: Build and install a dev client, and confirm the patched file is what compiles**

Run:

```bash
npx expo run:android
```

Then confirm the patch reached the build. Delete the Gradle build directory for the module
and rebuild, checking that compilation succeeds from the patched source:

```bash
find android -type d -name "react-native-screens" -path "*build*" | head
./gradlew :react-native-screens:compileDebugKotlin --console=plain 2>&1 | tail -20
```

Expected: the module compiles cleanly. Autolinking includes
`node_modules/react-native-screens/android` as a Gradle subproject, so the patched Kotlin is
the source that is compiled — there is no vendored copy to go stale.

- [ ] **Step 3: Reproduce the original crash scenario and confirm it is gone**

On the emulator, drive the exact flow from issue #51:

1. Settings → **Import OKF** → **Pick OKF zip**
2. Pick any `.zip` from the Android file picker
3. The import must complete and return to Settings with no crash

**Expected: no crash, no black screen, the app returns to Settings.**

This is the #51 acceptance test. If it still crashes, do not close the issue — the patch did
not reach the running binary.

- [ ] **Step 4: Check the logcat snapshot for the assertion**

`adb logcat -c` is denied by the permission classifier in this environment. Use a pid-scoped
snapshot instead:

```bash
adb logcat -d --pid=$(adb shell pidof com.equationalapplicationsllc.curatedjournal) | tail -40
```

Expected: no `ScreenStackFragment added into a non-stack container` and no
`IllegalStateException` from `com.swmansion.rnscreens`.

- [ ] **Step 5: Spot-check the other header-bearing route**

Issue #51 notes `entry/[factId]` is exposed to the same crash outside the import flow.
Navigate to a note entry screen and back a few times on Android.

**Expected: no crash.** This confirms the patch fixes the mechanism rather than the one
trigger we happened to report.

- [ ] **Step 6: Confirm a clean build environment applies the patch**

Run:

```bash
git stash list && git status --short
```

Expected: the working tree is clean apart from the committed patch. A clean checkout carries
`patches/react-native-screens+4.26.2.patch`, and `npm install` in any build environment —
including EAS Build, which installs dependencies in the build container — runs `postinstall`
and applies it. Verify by checking that the patch file is tracked, not ignored:

```bash
git ls-files patches/
```

Expected: `patches/react-native-screens+4.26.2.patch`.

- [ ] **Step 7: Report the result for the issue close comment**

Record: the canary test result, the dev-client import result, the logcat snapshot, and the
`entry/[factId]` spot-check. When closing #51, state that the underlying upstream bug
(software-mansion/react-native-screens#4498) remains open and that this patch should be
dropped when it ships.
