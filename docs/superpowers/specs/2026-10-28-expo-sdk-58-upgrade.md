# Platform Upgrade — Expo SDK 58

Date: 2026-10-28
Status: Draft (gates green, awaiting review + owner merge go)
Parent spec: [Curated Journal demo app](./2026-06-24-curated-journal-demo-app.md)
Predecessor: [SDK 57 upgrade](./2026-09-24-sdk57-llmwiki7-okf02-upgrade.md)
Target platform: Expo SDK 58 (React Native 0.88.0, React 19.3.0)

---

## 1. Problem Statement

CJ is on SDK 57 (RN 0.86.3). SDK 58 shipped (expo ~58.0.20, RN 0.88, React
19.3, iOS 27 / iPhone Duo readiness, strict RN TypeScript API default). Kurt
directed (2026-10-28): upgrade to SDK 58 following Expo's published guide,
modernize, update all deps to latest compatible, and capture reusable
procedure notes for the other EA Expo apps (Clanker AI).

## 2. Bump class (VERSIONING policy)

**MAJOR 3.3.0 → 4.0.0.** SDK upgrade regenerates the native tree (VERSIONING
"how to decide" #1). Verified by prebuild: the regenerated `android/` tree
differs far beyond version stamps. Consequence carried deliberately: a new
runtime island starts; the pending OTA smoke test + rollback drill (spec
§6/§7, INTENT rule 10) now targets the 4.0.0 binary, not 3.3.0. INTENT rule
10's "delivery path untested" status line remains accurate and untouched.

## 3. Changes

### Dependency moves (SDK 58 template + `npx expo install --fix` + manual dev-dep alignment)

- `expo` ~57.0.25 → `^58.0.20`; all `expo-*` packages → their ~58 versions
  (full diff in package.json).
- `react`/`react-dom` 19.2.3 → 19.3.0; `react-native` 0.86.3 → 0.88.0;
  `@types/react` → ~19.3.0.
- `react-native-gesture-handler` ~2.32.0 → **~3.3.0** (major); `reanimated`
  4.5.1 → 4.7.1; `worklets` 0.10.1 → 0.13.0; `screens` 4.26.2 → ~4.30.0;
  `safe-area-context` ~5.7.0 → ~5.10.1; `react-native-web` → ~0.21.4;
  `@shopify/react-native-skia` 2.6.2 → 2.14.0.
- Dev: `jest-expo` → ~58.0.12, `eslint-config-expo` → ~58.0.4, `jest` 29.7 →
  ~30.5.2, `@types/jest` → ~30.0.0, new peer `@react-native/jest-preset@~0.88.0`
  (jest-expo 58 moved the RN preset to a separate package).
- New explicit dep `react-native-nitro-modules@^0.37.0` (peer of
  `react-native-nitro-unzip`; was previously satisfied only by npm peer
  auto-install, which `--legacy-peer-deps` disables — see §5).

### Code changes (all SDK 58 breaking-change fixes)

1. `src/lib/okfExport.ts` — `File.write()` is async in SDK 58
   (expo-file-system new API); the un-awaited call that was correct-sync in
   57 would have raced the zip step. Now `await`ed.
2. `src/app/import.tsx` — `usePreventRemove` moved from the non-public
   `expo-router/build/react-navigation/core` path to a **public `expo-router`
   export** in SDK 58. Import re-pointed; our callback only alerts (no action
   dispatch), so the new `({ data, repeat })` callback signature needs nothing
   further.
3. `src/components/graph/SkiaGraphCanvas.tsx` — Skia 2.x made `SkPath`
   immutable; edge-path building now goes through `Skia.PathBuilder.Make()` +
   `.build()`.
4. `src/components/journal/JournalPane.tsx` — RN strict types: ref is
   `ScrollViewInstance`, not the component.
5. `src/hooks/use-theme.ts` — RN 0.88 removed the `'unspecified'` color
   scheme value (`useColorScheme()` is now `'light' | 'dark' | null`);
   comparison rewritten dark-vs-everything-else-light.

### Dropped patch

`patches/react-native-screens+4.26.2.patch` (our null-stack guard in
`ScreenStackHeaderConfig.onUpdate`) — **upstreamed**: the identical guard
exists in the installed 4.30.0 source. Patch deleted, not re-based.

## 4. Policy-adjacent notes

- `.npmrc` with `legacy-peer-deps=true` added — **temporary**, see §5.
  Remove when expo-llm-wiki ≥7.13.1 publishes and CJ consumes it.
- R8 minify is ON by default in SDK 58 release builds
  (`android.enableMinifyInReleaseBuilds=true`, verified in the regenerated
  tree). Release-train checkpoint: the 4.0.0 `assembleRelease` APK must be
  smoke-tested on device (drill covers it) — JNI-heavy deps (llama.rn,
  nitro-unzip) are the ones to watch for keep-rule needs.
- `expo-doctor` 1.21.5: 19/20 checks pass. The failing "app.config.ts is not
  using app.json" check is a false positive — the checker doesn't recognize
  ESM `import appJson from './app.json'` + spread; `npx expo config --type
  public` confirms every app.json value flows through and runtimeVersion
  derives `4.0.0`.

## 5. Known follow-ups

| ID | Follow-up |
|----|-----------|
| F1 | `@equationalapplications/expo-llm-wiki` peer range caps `expo-sqlite` at `^57` (even at 7.13.0). Peer-widening PR rides in that repo (PATCH 7.13.1). Until it publishes and CJ consumes it, `npm ci` needs the `.npmrc` legacy-peer-deps flag. |
| F2 | Remove `.npmrc` after F1 lands here. |
| F3 | OTA drill re-targets the 4.0.0 binary; on-device proof row must read **4.0.0**. |
| F4 | llama.rn stays 0.12.5 (SDK 58 compat unverified upstream; NG2 of the 57 spec still applies). |
| F5 | Dependabot PRs #61/#66/#67 rebase after this merges (they target the 57 tree). |

## 6. Verification receipts (same-session tool output, 2026-10-28)

- `tsc --noEmit`: exit 0.
- `expo lint`: 0 errors, 31 warnings (exact pre-existing baseline).
- `jest --ci`: **317/317 passed**, 55 suites (same count as 57 baseline).
- Prebuild stamp grep on 4.0.0 tree: `versionName "4.0.0"` (build.gradle:96),
  `expo_runtime_version` 4.0.0 (strings.xml:4), `EXPO_UPDATES_CHECK_ON_LAUNCH`
  NEVER (AndroidManifest.xml:18), channel production (:21).
- `npx expo config --type public`: runtimeVersion `4.0.0`,
  checkAutomatically `NEVER`.
- screens 4.30.0 source contains the null-stack guard (verbatim).
