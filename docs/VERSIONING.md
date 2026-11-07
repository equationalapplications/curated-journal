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
3. Production build (a **local developer sideload**, not a release artifact —
   GitHub releases carry no binaries; see the artifact policy below):
   `./gradlew assembleRelease` (from `android/`) through the `heavy-build`
   wrapper — never bare gradle on this machine.
4. Verify the **built artifact** with `aapt2 dump badging` — never trust source
   files for what shipped — and confirm the manifest meta-data on the artifact
   with `aapt2 dump xmltree --file AndroidManifest.xml` (the
   `EXPO_UPDATES_CHECK_ON_LAUNCH` entry must say `NEVER`; `dump badging` does
   not show manifest meta-data). **And verify the signing certificate:**
   `<sdk>/build-tools/<ver>/apksigner verify --print-certs
   android/app/build/outputs/apk/release/app-release.apk` must show
   SHA-256
   `E9:45:EC:20:6C:3A:03:C5:BC:99:AB:D4:BA:8F:A8:33:57:61:0E:DB:40:AF:67:9E:8C:59:0C:52:51:57:EF:70`
   (the upload-key lineage of record, verified 2026-11-06). Use
   `apksigner`, not `keytool -printcert -jarfile`: with minSdk 26 the
   build is signed v2+ only and has no v1 JAR signature for keytool to
   read. Any other certificate — above all `FA:C6:17:45:…:3B:9C`, the
   public debug key — means
   the build fell back to the debug keystore: stop, restore
   `credentials/keystore.properties`, rebuild. (The guard plugin refuses such
   builds outright; this check is the backstop.)
5. Tag `vX.Y.Z` at the merge commit of the PR that carried the bump and
   create the GitHub release — **notes only, no binary assets** (see the
   Artifact and release-asset policy below; the 2026-11-07 policy retired
   APK attachments). Release notes for the first post-#68 release (3.1.0+) must
   carry the pre-3.0.0 stranding
   note (old-island binaries need this store install).

## Store releases (EAS, from 5.0.0)

Store builds run on EAS, not this machine, so the `heavy-build` and bare-gradle
rules above don't apply to them. Store artifacts deliver only through the
stores (Play / App Store Connect); since the 2026-11-07 asset policy below,
GitHub releases are source and notes only and no sideload artifact is
published with them. Steps 3–4 of the release train remain as the recipe for
**local developer sideload builds** (device smoke tests before promoting a
store release) — they have no GitHub-release destination. The `github-apk` EAS
profile likewise has no release to attach an APK to, and an APK built through
EAS is signed with the EAS upload key and does **not** install over the
fielded debug-signed sideloads; see bullet 3 before choosing that path.

1. Merge the PR that carries the bump, then tag `vX.Y.Z` as in step 5.
2. **Done once** — Android signing settled at Play app creation
   (2026-11-02 19:46), not at a store release: Play auto-enrolled its
   **Google-generated app-signing key** when the app was created —
   SHA-256
   `3C:F3:88:99:38:51:EE:19:5F:E4:7F:52:54:45:6C:20:7E:72:F9:EA:53:4B:B0:FC:06:74:A6:9E:B6:4A:13:DF`,
   verified live in Release → Setup → App integrity 2026-11-07 (the
   upload key read
   `E9:45:EC:20:6C:3A:03:C5:BC:99:AB:D4:BA:8F:A8:33:57:61:0E:DB:40:AF:67:9E:8C:59:0C:52:51:57:EF:70`
   there at the same check). Recorded because the consequences are
   permanent. The
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
     uninstall → install from Play → OKF import. Store release notes must
     say so. (Every GitHub APK release from v7.0.0 onward must carry the
     hand-migration warning; see the sideload signing guidance in bullet 3.)
   - The EAS keystore stays the **upload key** only (upload SHA-1
     `10:F4:9C:AF:F4:78:3F:75:D8:0A:F8:E8:95:CA:C7:9C:03:1B:14:48`;
     certificate SHA-256
     `E9:45:EC:20:6C:3A:03:C5:BC:99:AB:D4:BA:8F:A8:33:57:61:0E:DB:40:AF:67:9E:8C:59:0C:52:51:57:EF:70`).
     Verify the local copy after any EAS credentials change:
     `keytool -list -v -keystore credentials/android/keystore.jks` with
     the `storePassword` from `credentials/keystore.properties` — if the
     SHA-1 differs, EAS regenerated the keystore and every lineage
     assumption in this document is stale: stop and re-verify before any
     release. At each Android store release, check Release → Setup → App
     integrity (the upload key matches the SHA-1 above; the app-signing
     key is the Google key) and record that key's fingerprint in the
     release notes.
   - GitHub sideload APKs and Play installs never cross-update. Within
     GitHub releases, each signing key is its own update lineage: the
     v5.0.0 GitHub APKs were built locally and signed with the legacy
     sideload keystore (`FA:C6:…3B:9C`) — the last release that key
     signs. A later GitHub APK built by the other path (EAS `github-apk`
     with the EAS upload key, or a regenerated local keystore) will
     **not** install over fielded v5.0.0 sideloads; a sideload signing
     change means the same hand migration as the store channel (OKF
     export → uninstall → install → OKF import) and must say so in that
     release's notes. From v7.0.0 this is the standing case for local
     builds: they sign with the EAS upload keystore via
     `../credentials/keystore.properties` — wiring emitted by the
     sideload-guard config plugin, since the SDK 58 template itself has
     none (without it local release builds silently sign with the public
     debug keystore even when `credentials/` exists) — so every GitHub
     APK release from that version on needs the hand-migration warning.
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

## Artifact and release-asset policy (2026-11-07)

- **GitHub releases are source and notes only.** Every binary asset was
  stripped retroactively from v1.0.0–v7.0.0 (12 files, no backup kept);
  release notes carry removal banners. Checksums travel with the delivery
  channel, never GitHub.
- Lifecycle: **build → deliver → delete local.** Local Android release
  APK/AAB exist only while a Play submission is pending; deliver, then
  delete. Dev clients go to EAS (Android dev clients upload with
  `eas upload` — added in eas-cli 16.3.0 and un-hidden in 16.13.4, so the
  `>= 16.0.0` floor in `eas.json` predates the command; run eas-cli
  ≥ 16.13.4 or raise that floor; iOS uses cloud `development` profile
  builds — a local iOS dev client stays local). The simulator
  `CuratedJournal.app` is the iOS dev channel and is kept.

## Delivery records

Permanent record of store deliveries — what shipped, where, when, and what
was verified at delivery. Signing fingerprints live in the Store releases
section above; entries here reference them rather than duplicate.

### 7.0.0 (1) — Play Internal testing, published 2026-11-07

- First Play delivery: internal testing track, published (not left as a
  draft) on the evening of 2026-11-07. Tester opt-in URL:
  `https://play.google.com/apps/internaltest/4700972081921712496`.
- Signing verified at delivery: App integrity (read-only) showed the
  Google-generated app-signing key and the upload key matching the SHA-256
  values recorded above, and the delivered AAB's signer certificate was
  independently keytool-verified byte-identical to the upload key.
- Submission service account: `eas-play-submit@clanker-prod`, reused (no
  new key minted), granted CJ-scoped least privilege — release to testing
  tracks plus read-only app/quality info; no production rights.
- Artifact deletion completed per the build → deliver → delete-local
  policy: the delivered AAB and APK were removed after publish. The iOS
  simulator app is kept as the dev channel.
- Legal pages live on GitHub Pages (user-approved hosting, 2026-11-07) and
  linked from the store listing; source of truth lands in `main` via the
  `docs/legal-store-pages` PR:
  - Privacy: `https://equationalapplications.github.io/curated-journal/privacy/`
  - Terms: `https://equationalapplications.github.io/curated-journal/terms/`
