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
2. **Before the first store release only**: settle Android signing. Compare
   the signing certificate of the fielded sideload APKs with the keystore
   EAS will sign the store build with (`eas credentials` on the expo.dev
   project, `keytool -printcert` against the existing APK), and decide the
   Play App Signing keys. New Play apps are enrolled in Play App Signing
   automatically: Google holds the **app-signing key** whose signature ends
   up on every installed store build, while the key that uploads artifacts —
   EAS's keystore — is only the **upload key**. Uploading the sideload
   keystore to EAS therefore does not change what store installs carry.
   To keep store updates installable over fielded sideloads, the sideload
   keystore itself must become the app-signing key: at the first AAB
   release, use Play Console's "export and upload a key from Java keystore"
   flow (Release → Setup → App signing) to hand Google the sideload key,
   and let EAS keep its own upload key. If Google generates a fresh
   app-signing key instead, its signature won't match the sideloads —
   Android refuses to update an installed app whose signature changes, so
   every sideload user must uninstall and reinstall, wiping their local
   journal unless they exported an OKF backup first. After the first
   release, compare the app-signing certificate shown in Play Console with
   `keytool -printcert` of the sideload APK; it must match. Later store
   releases inherit this alignment; only the first one can get it wrong.
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
