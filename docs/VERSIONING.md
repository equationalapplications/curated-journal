# Versioning & OTA policy

Every change that lands on `main` carries a version consequence. The version
lives in three synced places (`package.json`, `app.json`, `package-lock.json`)
and is bumped in the same PR as the change that causes it — not in a separate
release PR.

The rule that drives the bump class is **OTA compatibility**: does the change
break the ability to ship an over-the-air update (EAS Update) to binaries
already in the field?

## Bump rules

| Change | Bump | Why |
|---|---|---|
| Anything that breaks OTA compatibility for shipped binaries (native module add/remove/change, SDK upgrade, `app.json` plugin/config changes that regenerate native projects, permission changes, target API bumps) | **MAJOR** | Fielded binaries can never receive the update; only a new install carries it. The major signals "new binary required". |
| New feature that does **not** break OTA (JS/TS-only: new screens, components, machines, pure-JS libs) | **MINOR** | Shippable to existing binaries via EAS Update: the runtime version derives from the MAJOR (#64), so MINOR bumps stay on the island installed phones are already on. |
| Bug fix or patch (JS/TS-only fixes, test-only changes, docs, CI) | **PATCH** | Same as MINOR. |

## How to decide

1. Did the change touch `android/`-generating surfaces — native modules,
   `app.json` plugins, Expo SDK version, permissions, build.gradle inputs that
   come from config? → **MAJOR** (OTA broken for old binaries).
2. Otherwise, is it user-visible new functionality? → **MINOR**.
3. Otherwise → **PATCH**.

When in doubt between MAJOR and MINOR: run `npx expo-doctor`, diff the
regenerated `android/` tree (`npx expo prebuild --platform android --no-install`)
on a scratch branch **before and after applying the bump** — if the
regenerated tree differs beyond the version stamps themselves, it's a
MAJOR. (Since the #64 runtime-version fix the stamps only move on a
MAJOR, so this test behaves as originally intended.)

## Release train (per release)

1. Bump the three synced files in the change's own PR (see the 1.3.0/1.4.0 bumps
   for the exact shape).
2. Merge → `npx expo prebuild --platform android --no-install` → grep-verify
   `versionName`, `expo_runtime_version`, and the `expo-channel-name` header in
   the generated tree **before** building. A stale stamp means the APK bakes
   the old version regardless of the tag. `expo_runtime_version` must equal
   `<MAJOR>.0.0` (the derived runtime version, `app.config.ts`).
3. Production build: `./gradlew assembleRelease` (from `android/`) through the
   `heavy-build` wrapper — never bare gradle on this machine.
4. Verify the **built artifact** with `aapt2 dump badging` — never trust source
   files for what shipped.
5. Tag `vX.Y.Z` at the merge commit of the PR that carried the bump, create the
   GitHub release with the APK attached, and read back the asset byte-size from
   the release API.
