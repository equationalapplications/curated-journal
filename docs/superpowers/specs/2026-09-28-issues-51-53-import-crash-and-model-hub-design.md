# Issues #51 and #53 — Android Import Crash, and the Model Hub One-Way Door

Date: 2026-09-28
Status: Draft (approved in chat 2026-09-28, not yet implemented)
Issues: [#51](https://github.com/equationalapplications/curated-journal/issues/51) (import crash), [#53](https://github.com/equationalapplications/curated-journal/issues/53) (model hub one-way door)
Branch: `fix/issues-51-53`, branched from `main` @ `fe98159`
Base: Curated Journal 1.4.0, `react-native-screens` 4.26.2, React Native 0.86.0 (Fabric), Expo / Expo Router 57

---

## 1. Problem Statement

Two independent defects, both shipped, both reported from on-device testing of a production
APK on a Pixel-class Android device. They share a PR only because they were found together;
nothing in the design couples them.

### 1.1 #51 — Android OKF import crashes

Importing an OKF zip on Android crashes the app: the screen goes black and the process must
be force-closed. It is not a dev-build artifact — it reproduces in a production APK.

The crash is **not ours**. `ScreenStackHeaderConfig.onUpdate()` computes

```kotlin
val isTop = stack == null || stack.topScreen == parent
```

so a screen *transiently detached from its stack* is classified as "is top" and the method
proceeds into `canNavigateBack()`, whose `check(container is ScreenStack)` throws on exactly
that null container:

```
java.lang.IllegalStateException: ScreenStackFragment added into a non-stack container
  at com.swmansion.rnscreens.ScreenStackFragment.canNavigateBack(ScreenStackFragment.kt:503)
  at com.swmansion.rnscreens.ScreenStackHeaderConfig.onUpdate(ScreenStackHeaderConfig.kt:282)
```

A navigation prop update has to land on a detached screen for this to fire. In our flow it
is the programmatic `router.back()` in `src/app/import.tsx:119` that runs when the machine
reaches `done`. Cancelling the SAF picker does **not** crash — the import has to actually run.
Setting `headerShown: false` on the `import` route avoids it, but that is not a fix: the
crash is reachable from any route with a header, and `entry/[factId]` is one.

Upstream has the fix in
[software-mansion/react-native-screens#4498](https://github.com/software-mansion/react-native-screens/pull/4498)
("don't run header update for a screen detached from its stack"). Re-verified 2026-09-28:
still **OPEN, unmerged, MERGEABLE**. Latest stable 4.28.0 (released 2026-09-14) still carries
the bug. Upgrading does not help, and the only alternative release line is 5.0.0-alpha — a
breaking major we should not adopt to pick up six lines of Android Kotlin.

### 1.2 #53 — "Change AI model" is a one-way door

`Settings → Change AI model` destroys the user's working model before showing them a menu to
look at. There is no way back: the Android back gesture exits to the launcher.

The cause is a **provider teardown**, not just a navigation call. `performChangeModel` in
`src/app/(tabs)/settings.tsx:25-34`:

```ts
const path = await getModelPath();
if (path) { const file = new File(path); if (file.exists) file.delete(); }
await clearModelPath();
await rebootstrap();                       // === bootstrap()
router.replace('/model-hub' as Href);
```

`rebootstrap` is `bootstrap` from `src/app/_layout.tsx`. It finds no model path and calls
`setPhase('needsModelHub')`, which makes `isReady` false. In `src/app/_layout.tsx` the entire
`WikiProvider` / `LlmProvider` / `JournalWikiProvider` / `JournalProvider` subtree **unmounts**
and the bare `stack` renders in its place. Settings is destroyed before `router.replace`
executes. The explicit `replace` is redundant — the teardown is what strands the user.

A visible exit cannot be bolted on. A `Done` button gated on
`useAppReady() && navigation.canGoBack()` was tried during the original UI pass and verified
on the emulator to be **unrenderable** — by the time the hub mounts, the stack is already
empty. It was reverted rather than committed as dead code.

A second, independent defect hides in the same flow: the confirmation sheet says "This will
delete your current model immediately…", but the deletion has *already happened* by the time
the user reads that sentence. The warning describes a past event.

## 2. Goals

- **G1.** Stop the fatal Android import crash for every affected route, not just the import
  flow, and in release builds.
- **G2.** Make `Settings → Change AI model` a normal drill-down: the user can open the
  catalogue, look, and return to Settings with a working model and their place intact.
- **G3.** Make the destructive action happen at a point of commitment the user can see and
  confirm, with copy that describes what will actually happen.
- **G4.** Keep the machine the single owner of the "a model is installed" invariant, so the
  retire-then-download ordering is testable rather than a convention spread across screens.
- **G5.** Keep the maintenance cost of the upstream patch visible and loud rather than silent.

## 3. Non-Goals

- **N1.** Not fixing the upstream bug in `react-native-screens` itself. We carry it as a
  patch until #4498 lands or is superseded.
- **N2.** Not changing the model catalogue, download, resume, verify or smoke-test flows.
  Only *when the previous model is destroyed* changes.
- **N3.** Not adding a route param or a navigation flag to mark the hub as "change mode".
  `navigation.canGoBack()` is already a reliable discriminator once deletion is deferred; a
  flag would be a second source of truth for a fact the navigator already knows.
- **N4.** Not addressing the transient import-screen layout glitch recorded in a prior
  session (content at `y=42` after heavy navigation churn, not reproducible from a clean
  start). Same rnscreens modal fragility family, but not this spec's subject.
- **N5.** Not upgrading to `react-native-screens` 5.0.0-alpha.
- **N6.** Not re-homing the import machine above the screen so navigation survives an import
  (the follow-up noted in the `usePreventRemove` comment at `src/app/import.tsx:106-109`).

## 4. Design

### 4.1 Part A — carry #4498 as a patch

**Chosen approach: `patch-package`.** The alternatives were rejected for concrete reasons:

| Approach | Why not |
|---|---|
| Wait for upstream | Import is a shipped feature and the crash is fatal in release builds. #4498 has been open since it was reported; 4.28.0 shipped without it. Waiting is not a plan. |
| In-app workaround | Per the established finding, no app-level change covers every affected route — `entry/[factId]` is exposed too. A workaround that only defers the crash is not a fix. |
| `overrides` → a fork / 5.0.0-alpha | Forking a third-party library is a permanent ownership cost. 5.0.0-alpha is a breaking major. |

**The change to carry**, verbatim in substance from #4498:

```diff
     fun onUpdate() {
         val stack = screenStack
-        val isTop = stack == null || stack.topScreen == parent
+        // A screen that is not in a stack has nothing to configure a header for, and
+        // `canNavigateBack()` below asserts on exactly this condition. Treating a null
+        // stack as "is top" let a detached screen reach that assertion and throw.
+        if (stack == null) {
+            return
+        }
+        val isTop = stack.topScreen == parent
 
         if (!isAttachedToWindow || !isTop || isDestroyed) {
             return
```

**Verified applicable to the installed version.** In 4.26.2 the file is at

```
node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt
```

— the *flat* package path. The `legacy/` subpackage that upstream's diff is written against
was introduced in a later 4.x. Line 233 of the installed file reads
`val isTop = stack == null || stack.topScreen == parent`, byte-identical to the line the patch
replaces, so the hunk applies.

**Wiring.**

- `devDependencies`: add `patch-package`.
- `scripts`: add `"postinstall": "patch-package"`.
- Apply the guard in `node_modules`, then `npx patch-package react-native-screens` to emit
  `patches/react-native-screens+4.26.2.patch`. The patch file is committed.
- No `overrides` entry. The patch is keyed to `4.26.2`; `package.json` already asks for
  `~4.26.0`, so the patch and the declared range stay consistent.

**How the patch reaches the build.** `android/` is a committed native project, and
`expo-modules-autolinking` includes `node_modules/react-native-screens/android` directly as a
Gradle subproject. The patched Kotlin is therefore compiled from `node_modules` at build time;
no re-vendoring step is needed. EAS Build installs dependencies in the build environment, so
`postinstall` runs there and the patch is applied. *This is asserted by the build, not
assumed — step A4 below verifies it on a clean checkout.*

**Failure mode is a feature.** The patch breaks when rnscreens moves to 4.27+ (the file
relocates to `legacy/`). `patch-package` exits non-zero when a patch fails to apply, so a
version bump fails the build loudly instead of silently reintroducing a fatal crash. This is
recorded in the PR description and in a comment at the patch declaration site.

**Guard test.** `__tests__/rnscreensHeaderPatch.test.ts` reads the installed
`ScreenStackHeaderConfig.kt` from `node_modules` and asserts the null-stack guard is present.
It is a canary for the case where `postinstall` was skipped or the patch file went missing —
`patch-package` failing is loud, but a test failure is unmissable in CI output.

### 4.2 Part B — defer deletion to the commitment point

**Chosen approach: delete on model selection** in the catalogue; the Settings entry point
becomes entirely non-destructive.

The rejected alternatives, from the issue and from this session:

| Approach | Why not |
|---|---|
| Delete *after* the new model verifies | A working model is never destroyed, but peak disk usage becomes two full models at once (~3GB each) and the `disk-full` path becomes reachable in a new way. The safest option is not free. |
| Delete at download *start* | Marginally later than selection, but adds a state to the machine for a behaviour indistinguishable from selection in every case that matters — including `awaitingWifi`, where the download does not start at all. |
| Pass a "came from Settings" flag, render `Done` | The issue is right that this is weaker: it still strands the user with no model if they leave, and it needs the hub to distinguish two cases it currently conflates. Deferral makes the distinction fall out for free. |

**B1. Settings becomes non-destructive.** `performChangeModel` in
`src/app/(tabs)/settings.tsx` loses the file deletion, the `clearModelPath()` and the
`rebootstrap()`, and becomes:

```ts
const performChangeModel = () => {
  router.push('/model-hub' as Href);
};
```

Consequences: `phase` stays `ready`, the provider subtree stays mounted, the tabs remain on the
stack underneath, and the back gesture returns to Settings **with the model still working**.
`getModelPath`, `File`, `clearModelPath` and `useModelHubCompletion` all drop out of this
screen's imports.

The confirm sheet survives with corrected copy. The old text promised an immediate deletion
that no longer happens; the new text says the replacement is chosen on the next screen and
that the current model stays until then. Buttons stay `Cancel` / `Continue`, with `Continue`
no longer styled `destructive` — nothing is destroyed by it any more.

**B2. The hub learns what is installed.** `src/app/model-hub/_layout.tsx` already opens
SQLite on mount to read resumable download state. It additionally reads `getModelId()` and
passes the result down.

- `ModelHubMachineInput` gains `currentModelId: CuratedModelId | 'custom' | null`.
- `ModelHubApi` gains `retireCurrentModel: () => Promise<void>` — delete the file at the
  stored model path and `clearModelPath()`. Implemented in `createModelHubApi` alongside the
  existing `setModelPath`, sharing the same `Paths.document` / `File` idiom.
- Machine `context` gains `currentModelId`, initialised from `input`. **Input, not an event**
  — it is initial context, so it must not ride `RESTORE_DOWNLOAD`, which is already used for
  the download-restore path and would race the first render.
- `useModelHub` exposes `currentModelId` so the hub can render the "Current" badge.

**B3. A visible exit, gated on the stack.** `src/app/model-hub/index.tsx` renders a back row
above the "Choose Your AI" title, gated on `navigation.canGoBack()`:

```
  ← Settings                    ← rendered only when canGoBack()
  ┌──────────────────────────┐
  │ Choose Your AI            │
  │ Your journal stays fully  │
  │ offline…                  │
  │                           │
  │ MODELS                    │
  │ ┌───────────────────────┐ │
  │ │ Phi-4 Mini            │ │
  │ ├───────────────────────┤ │
  │ │ Qwen3 4B             │ │
  │ └───────────────────────┘ │
```

`headerShown: false` stays on the stack (`model-hub/_layout.tsx:53`). The hub is still the
first-run destination, where there is genuinely nothing behind it and a back control would
be wrong, so the gate has to be a real stack query rather than a prop.

This also resolves the duplication noted in #53: with deletion deferred the app is `ready`
while the hub is on screen, so `TabsLayout`'s `<Redirect href="/model-hub" />` no longer
fires spuriously and the explicit `replace` is gone.

**B4. The commitment point.** Tapping a catalogue row in change mode opens a **destructive**
confirm sheet on the hub itself — `useConfirmSheet` is already imported there. Copy names both
models and states the consequence: the current model is deleted now and cannot be restored.
`Cancel` / `Replace`. On confirm the screen sends a single `SELECT_MODEL` event; it does not
touch the filesystem.

If the tapped model is the one already installed, nothing happens: the row is rendered
non-selectable with a "Current" badge, so there is no destructive event to guard against at
the UI level. A custom model installed via `.gguf` import has id `custom`, which matches no
catalogue entry; the hub shows no badge and every row remains selectable.

**B5. The machine owns retirement.** `modelHubMachine.ts` gains a promise actor and one
state:

```
selecting --SELECT_MODEL--> retiringCurrent --(onDone)--> confirmingNetwork
                                 |
                              (onError) --> selecting   [error set]
```

- `retireTask` (`fromPromise`) calls `api.retireCurrentModel()`.
- It is **skipped entirely** when `event.modelId === context.currentModelId`, which
  transitions straight to `confirmingNetwork`. No file is touched and `MODEL_PATH_KEY` is
  not cleared.
- `onError` returns to `selecting` with an error message. A failed unlink must not fall
  through to `confirmingNetwork`: the invariant is that either the old model is fully
  retired or the new one is never started.
- `retiringCurrent` is a real state, not a fire-and-forget action, precisely so the failure
  branch is reachable and testable. It matches the existing `verifyTask` / `smokeTestTask`
  idiom in the same machine.

The end of the flow is unchanged and already correct: `smokeTest` success calls
`setModelPath(new)` → `clearDownloadState()` → `complete`; `download.tsx` reacts to `complete`
with `completeOnboarding()` (i.e. `bootstrap()`, which now finds the *new* model path) then
`router.replace('/')`; `src/app/index.tsx` redirects to `/journal`. `phase` never leaves
`ready` during the whole exchange, so the provider subtree is never torn down.

**B6. Custom `.gguf` import retires late, on purpose.** `src/app/model-hub/import.tsx` has
the opposite ordering problem: the replacement file is only known *after* the picker returns,
so there is no selection moment to retire at. Retiring on entry would destroy a working model
in exchange for a file the user may cancel.

The existing code also loses the old path before the machine could use it —
`runImport` calls `setModelPath(dest.uri)` at line 43, *before* `send({ type:
'IMPORT_SMOKE_OK' })` at line 54. So the retirement must capture the path at screen mount,
while it is still the one in SecureStore:

- On mount, `runImport`'s caller reads `getModelPath()` and holds it.
- `IMPORT_SMOKE_OK` gains an optional `retirePath: string | null`.
- The machine's `customImport` handler unlinks it, best-effort.

Deliberate asymmetry with the catalogue path: catalogue retires at selection, custom import
retires after the replacement has been copied and passed its smoke test. The catalogue can
afford to be eager because the model is already known and confirmed; the custom path cannot.
Both are safe — neither destroys a model before the user has committed — and the custom path
is strictly the safer of the two.

The unlink is best-effort with `console.warn` on failure, copying the existing rationale at
`src/app/import.tsx:52-59`: cleanup must never be the error that masks the real one. An
orphaned `.gguf` wastes disk but is recoverable by hand; failing the import that just
succeeded would not be.

**B7. `IMPORT_FAILED` now returns to a working app.** In change mode a failed custom import
calls `router.back()` to the hub with the old model still installed and `MODEL_PATH_KEY`
intact. Previously the user would have arrived back to an app with no model at all. This is
an improvement that falls out of the change, not a separate goal.

## 5. Data Flow

### 5.1 Change model, success

```
Settings ──Change──▶ confirm (non-destructive copy)
       │
       │  router.push('/model-hub')      phase stays 'ready'; tabs stay mounted
       ▼
  ┌──────────────────────────┐
  │ ← Settings               │  canGoBack() === true  → back row renders
  │ Choose Your AI           │  rows: "Current" row disabled + badged
  │ …                        │
  └──────────┬───────────────┘
             │ tap "Qwen3 4B"
             ▼
     confirm (destructive, names both models)
             │ Replace
             ▼
     SELECT_MODEL ──▶ retiringCurrent ──▶ [unlink old .gguf + clearModelPath()]
                                        ──▶ confirmingNetwork
                                        ──▶ downloading ──▶ verifying
                                        ──▶ smokeTest ──▶ setModelPath(new) ──▶ complete
                                                                                    │
   bootstrap() ◀────────────────────────────────────────────────────────────────────┘
   phase: 'ready' ──▶ 'ready'          (never 'needsModelHub')
   router.replace('/') ──▶ Redirect ──▶ /journal
```

### 5.2 Change model, abandoned

```
Settings ──Change──▶ hub ──▶ back gesture ──▶ Settings
                                     model untouched, MODEL_PATH_KEY intact
```

### 5.3 Change model, download fails

Retirement has already happened; the user is in the hub's normal retry path
(`failed` → `Retry` → `selecting` / `downloading`). This is the same exposure the app has
today on a first-run download failure. The difference is that it is now *reached deliberately*
rather than by a one-way door, and the pre-import exit exists.

## 6. Error Handling

| Failure | Behaviour |
|---|---|
| `retireCurrentModel` throws (file locked, already gone) | `retireTask.onError` → `selecting` with a visible error. The new download never starts. The old model may be half-retired; the retry re-runs the retirement, which is idempotent (`File.exists` is checked, as in the current `settings.tsx`). |
| Selected model is the current one | Retirement is skipped by a machine guard. The UI prevents it by rendering the row non-selectable. The guard is the invariant; the UI is the affordance. |
| User backs out of `awaitingWifi` after selecting | The old model is already retired and `MODEL_PATH_KEY` is cleared. Next launch `bootstrap()` finds no model → `needsModelHub` → the hub, where a download can be resumed. Honest and recoverable, but the user has lost the model they were running. Accepted: this is the committed state, and the commit was confirmed by an explicitly destructive dialog. |
| User kills the app mid-download | Same as the row above. Resumable download state is persisted to SQLite, so the hub restores it. |
| `File.delete()` in the custom-import path throws | Caught and `console.warn`ed; the import still completes. An orphaned file wastes disk; a failed import after a successful smoke test does not. |
| rnscreens version bumped, patch stops applying | `patch-package` exits non-zero in `postinstall` → the build fails. `__tests__/rnscreensHeaderPatch.test.ts` fails independently. |
| Web | The model hub is a native flow (`llama.rn`); web runs the mock provider. `retireCurrentModel` is best-effort there and its failure routes to `selecting` with an error rather than crashing. |

## 7. Known Risks

**R1 — unlinking a mmapped model.** The old `.gguf` is deleted while the old `llmProvider` is
still mounted and has it memory-mapped. POSIX keeps the inode alive until the mapping is
released, so the running app stays functional and the file is genuinely gone from the
directory. This holds on both Android and iOS. The design depends on never re-opening the old
path — the only consumer of that path is `bootstrap()`, which re-reads `MODEL_PATH_KEY` and
finds it cleared. *To be verified on-device as step B13, not assumed.*

**R2 — patch drift.** Carrying a third-party patch means owning it until #4498 lands. Bounded
by: six lines, one file, a loud failure on version bump, and a test canary. The alternative —
a fatal crash in a shipped feature — is worse. Revisit when react-native-screens ships 4.29
or #4498 merges.

**R3 — the `awaitingWifi` window.** Between the destructive confirm and the network gate
resolving, the user can be sitting with no model and no download. This is the cost of eager
retirement and it is why the confirm sheet is destructive-styled. Moving retirement to
`downloading` would close it, at the cost of the extra machine state rejected in §4.2.

**R4 — the custom-import asymmetry** (B6) means a user who abandons a custom import keeps the
old model, while a user who abandons a catalogue download does not. Inconsistent, but each is
individually the right call, and the difference is invisible unless both paths are exercised
back to back.

## 8. Testing

TDD, extending the existing suites. Current baseline: 47 suites / 250 tests; lint 0 errors /
71 pre-existing warnings, scoped to `npx eslint src __tests__`.

**Part A**

- A1. `__tests__/rnscreensHeaderPatch.test.ts` — read the installed
  `ScreenStackHeaderConfig.kt`, assert the `if (stack == null) { return }` guard precedes
  `val isTop =`. Fails if the patch is missing.
- A2. `npx patch-package --check` (or a clean `npm ci` + reinstall) applies the patch with no
  conflict.
- A3. Build a dev client; confirm the patched file is the one Gradle compiles (build log or
  a deliberate local corruption that the build then does *not* pick up — read the log, don't
  ship the corruption).
- A4. Clean-checkout EAS/Android build succeeds, proving `postinstall` runs in the build env.

**Part B — machine** (`__tests__/modelHubMachine.test.ts`)

- B1. `SELECT_MODEL` with a *different* id enters `retiringCurrent`, then
  `confirmingNetwork`; `retireCurrentModel` was called exactly once.
- B2. `SELECT_MODEL` with the *same* id as `currentModelId` goes straight to
  `confirmingNetwork`; `retireCurrentModel` is **never** called.
- B3. `retireCurrentModel` rejecting leaves the machine in `selecting` with an error, and the
  network gate is never consulted.
- B4. `IMPORT_SMOKE_OK` with a `retirePath` unlinks it; with `null` it does not.
- B5. The full success path still reaches `complete` with `setModelPath` called for the new
  model — i.e. the existing tests must not regress.

**Part B — UI** (new `__tests__/modelHubChangeContrast.test.tsx`, in the style of
`modelHubDownloadContrast.test.tsx`)

- B6. The back row renders when `canGoBack()` is true and is absent when false (first run).
- B7. The current model renders a "Current" badge and its row is not pressable.
- B8. Tapping a *different* model opens a destructive confirm; `Cancel` sends no
  `SELECT_MODEL`.
- B9. Settings' "Continue" issues `router.push`, not `replace`, and does not delete.

**Part B — on-device** (Pixel_API_36 emulator + the production APK path)

- B10. Settings → Change → hub → **back gesture returns to Settings with the model working**,
  and Night Shift still runs. This is the #53 acceptance test.
- B11. The visible back row is present and tapping it behaves the same.
- B12. Settings → Change → pick a different model → confirm → download → the new model is
  installed, and `getModelId()` reports it.
- B13. Settings → Change → back out. Confirm the old `.gguf` is still on disk and
  `MODEL_PATH_KEY` is unchanged (**R1**).
- B14. Settings → Change → pick a model → import a bad `.gguf` → confirm → fail → back to the
  hub with the old model still installed.
- B15. Settings → Import OKF → pick a zip → import completes and returns, **no crash** (the
  #51 acceptance test).
- B16. Navigate to `entry/[factId]` and back, on Android, to confirm the other header-bearing
  route is also clean.

`adb logcat -c` is denied by the permission classifier in this environment; use
`adb logcat -d --pid=$(adb shell pidof <pkg>)` snapshots.

## 9. Rollout

1. Land Part A and Part B on `fix/issues-51-53` as two logically separate commits (A is
   dependency tooling, B is app logic; they share no files).
2. Per `docs/VERSIONING.md`, a version bump goes in a **separate** `chore/version-X.Y.Z` PR.
   This change is JS-only plus a dependency patch — no native module API change, no new
   native code, OTA-safe — so **PATCH**: 1.4.0 → 1.4.1.
3. Close #51 and #53 on merge, each referencing the verification that closed it. #51 should
   note that the underlying upstream bug remains open and that the patch should be dropped
   when #4498 ships.

## 10. Open Questions

None blocking. Two items are carried into implementation rather than decided here:

- Whether the Part A patch should be re-based onto 4.28.0 proactively. Not recommended —
  `~4.26.0` is the tested configuration and the fix is identical in substance. Revisit if a
  4.28 bump is wanted for other reasons.
- Whether the `retiringCurrent` state should surface its own spinner. It is a single unlink
  and is expected to be sub-frame; the hub's existing UI has no loading affordance for
  sub-second work. Default is no spinner, unless on-device testing shows a visible stall.
