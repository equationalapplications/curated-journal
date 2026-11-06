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
| New feature that does **not** break OTA (JS/TS-only: new screens, components, machines, pure-JS libs) | **MINOR** | Shippable to existing binaries via EAS Update: the runtime version derives from the MAJOR (#64), so MINOR bumps stay on the island installed phones are already on. Delivery: the Settings update-check trigger ships in 3.1.0 (#68). |
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
MAJOR. (Since the #64 runtime-version fix `expo_runtime_version` only
moves on a MAJOR, so this test behaves as originally intended —
`versionName` still changes on every bump.)

## Release train (per release)

0. **3.1.0 is the first OTA-capable release** — the explicit
   update-check trigger (#68) ships there as a MINOR (new user-visible
   Settings section, JS/TS-only). 3.0.0 was merged but never tagged, and
   no `v3.0.0` tag will ever exist. Releases before 3.1.0 could publish
   bundles no installed phone would ever fetch.
1. Bump the three synced files in the change's own PR (see the 1.3.0/1.4.0 bumps
   for the exact shape).
2. Merge → `npx expo prebuild --platform android --no-install` → grep-verify
   `versionName`, `expo_runtime_version`, `expo-channel-name`, **and** the
   manifest meta-data key `expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH`
   = `NEVER` (in `android/app/src/main/AndroidManifest.xml`) **before**
   building. A stale stamp means the APK bakes
   the old version regardless of the tag — and an un-regenerated `android/`
   tree ships with the old launch-time native check, breaking the strict
   privacy gate. `expo_runtime_version` must equal
   `<MAJOR>.0.0` (the derived runtime version, `app.config.ts`).
3. Production build: `./gradlew assembleRelease` (from `android/`) through the
   `heavy-build` wrapper — never bare gradle on this machine.
4. Verify the **built artifact** with `aapt2 dump badging` — never trust source
   files for what shipped — and confirm the manifest meta-data on the artifact
   with `aapt2 dump xmltree --file AndroidManifest.xml` (the
   `EXPO_UPDATES_CHECK_ON_LAUNCH` entry must say `NEVER`; `dump badging` does
   not show manifest meta-data).
5. Tag `vX.Y.Z` at the merge commit of the PR that carried the bump, create the
   GitHub release with the APK attached, and read back the asset byte-size from
   the release API. Release notes for the first post-#68 release (3.1.0+) must
   carry the pre-3.0.0 stranding
   note (old-island binaries need this store install).

## Store releases (EAS, from 5.0.0)

Store builds run on EAS, not this machine, so the `heavy-build` and bare-gradle
rules above don't apply to them. Steps 3–5 of the release train above stay as
they are for the sideload APK on GitHub releases (or use the `github-apk` EAS
profile).

1. Merge the PR that carries the bump, then tag `vX.Y.Z` as in step 5.
2. **Before the first store release only**: settle Android signing. The
   fielded sideload APKs (2.0.0–4.x) carry `debug.keystore`, whose private
   half is **public** — the file is byte-identical to the template keystore
   Expo ships in the public `expo/expo` repo (storepass `android`, SHA-256
   `FA:C6:17:45:…:3B:9C`, verified 2026-11-05). Making it the Play
   app-signing key would let anyone sign APKs that store installs silently
   accept as updates, so the first release instead enrolled Play App
   Signing with a **Google-generated app-signing key**. The sideload
   keystore must never become a store identity. Consequences, all
   permanent:
   - Store builds share no signature with any fielded sideload binary.
     Every existing sideload install must migrate by hand: OKF export →
     uninstall → install from Play → OKF import. Store release notes — and
     GitHub release notes published after the store release — must say so.
   - The EAS keystore stays the **upload key** only (upload SHA-1
     `10:F4:9C:AF:F4:78:3F:75:D8:0A:F8:E8:95:CA:C7:9C:03:1B:14:48`).
     After the first upload, verify it under Release → Setup → App
     integrity; the app-signing key shown there will be the new Google
     key — record its fingerprint with the release notes.
   - GitHub sideload APKs (EAS-key-signed from 5.0.0 on) and Play
     installs never cross-update; each channel updates within itself.
3. Run the **EAS store build and submit** workflow **at the tag** — in the
   Actions tab's "Run workflow" ref picker choose `vX.Y.Z`, or run
   `gh workflow run eas-store-release.yml --ref vX.Y.Z`. Dispatching from a
   branch head builds whatever `main` has become since the tag, not the
   tagged release. Platform: `all`.
4. The `production` profile builds an AAB and an IPA on the `production`
   channel. The build number is managed remotely by EAS (`appVersionSource:
   remote`, `autoIncrement`), so it never needs a manual bump. The marketing
   version is `app.json`'s `version`.
5. EAS auto-submits: Android goes to the Play **internal** track as a draft,
   and iOS goes to App Store Connect / TestFlight. Promote to production in
   each console after a device smoke test of the store build. `eas submit`
   can create the very first Android internal release too — uploading the
   first binary by hand is optional. The app must already exist in Play
   Console with the service-account key granted access to it, or the
   non-interactive submit hard-fails.
6. Verify the store artifact the same way as step 4 (download the AAB from
   the EAS build page, then `bundletool dump manifest`), checking that
   `EXPO_UPDATES_CHECK_ON_LAUNCH` is `NEVER`, and verify the IPA too:
   download it from the same build page, unzip the `Payload/*.app`, and
   read its Info.plist with `plutil -p` — `EXUpdatesCheckOnLaunch` must be
   `Never` (the iOS spelling of the same gate). Strict privacy from launch
   has to hold in store builds too.
