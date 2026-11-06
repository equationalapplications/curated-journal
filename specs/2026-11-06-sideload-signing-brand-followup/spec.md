# Spec: sideload signing guard + brand follow-up + review-hygiene

**Status: Implemented** — 2026-11-06. One PR carries spec + plan + implementation
+ version bump; `plan.md`/`LEDGER.md` are transient and deleted in the
same-PR cleanup commit (AGENTS.md SDD workflow).

## Why this cycle exists

Three sources converge:

1. **#86 high-depth review (finding 1, release-blocking):** VERSIONING.md
   declares the public debug keystore retired as a GitHub-APK identity,
   but nothing enforces it. The generated `android/app/build.gradle`
   signs release builds with `debug.keystore` whenever
   `../credentials/keystore.properties` is absent — the state of every
   fresh clone (`credentials/` is gitignored) — and the old
   `keytool -printcert` verification step was deleted in #86. A release
   built from a fresh clone would silently extend the public-key
   lineage past v5.0.0, which the doc says must never happen.
2. **#85 high-depth review (finding 1, release-blocking):** the brand
   cycle replaced `icon.png`/`favicon.png` but not the Android adaptive
   set; with `minSdkVersion: 26` every supported Android device renders
   `android.adaptiveIcon.foregroundImage` — still the old placeholder
   art. The merged spec's own "Splash drift (accepted)" ruling deferred
   adaptive icons and `splash-icon.png` to a fast follow-up "that wires
   it into app.json properly"; this is that follow-up.
3. **#86/#85 reviews (9 further findings):** docs and repo hygiene that
   this cycle fixes inline (user ruling 2026-11-06: "fix everything
   now").

Checked against `INTENT.md`: no rule touched. Rule 10 drives the bump:
both blockers feed native prebuild (adaptive/splash assets regenerate
launcher and splash resources; the guard adds an `app.json` plugin), the
regenerated tree differs beyond version stamps → **MAJOR**. No network,
no background work, no privacy-surface change (rules 1–14 unaffected).

## Requirements

### R1 — Local release builds can never silently sign with the debug keystore

- `plugins/with-sideload-release-guard.js`: an Expo config plugin whose
  Android mod appends a Gradle guard to `android/app/build.gradle`:
  when `../credentials/keystore.properties` does not exist (and the
  build is not on EAS, which supplies its own `keystore.properties`),
  every task whose name contains `Release` fails at execution with a
  GradleException naming `docs/VERSIONING.md` as the remedy. Debug
  builds and non-build tasks are unaffected.
- Wired in `app.json` `plugins` as a local plugin (`"./plugins/with-sideload-release-guard"`).
- No-op when `keystore.properties` exists (the EAS store-build path is
  untouched; the template's own keystore.properties wiring does the
  signing).

### R2 — GitHub-APK signing lineage is explicit and verifiable

- Local release builds sign with the EAS upload keystore via the
  existing `../credentials/keystore.properties` (SHA-1
  `10:F4:9C:AF:F4:78:3F:75:D8:0A:F8:E8:95:CA:C7:9C:03:1B:14:48`,
  SHA-256
  `E9:45:EC:20:6C:3A:03:C5:BC:99:AB:D4:BA:8F:A8:33:57:61:0E:DB:40:AF:67:9E:8C:59:0C:52:51:57:EF:70`,
  verified 2026-11-06 with `keytool -list` against
  `credentials/android/keystore.jks`).
- VERSIONING.md release train gains a mandatory post-build certificate
  check via `apksigner verify --print-certs` (not `keytool -printcert
  -jarfile`: with minSdk 26 the APK is signed v2+ only and carries no
  v1 JAR signature — CodeRabbit finding on this PR) that must match the
  recorded SHA-256 before any release ships; mismatch = stop.
  Release notes: every GitHub APK release from v7.0.0 onward carries the
  hand-migration warning (a user may have skipped any earlier version,
  so the trigger is the release, not a key change between neighbors).

### R3 — Android adaptive set and splash carry the cj-c-v3 brand

Derived from the approved 1024 master (`assets/images/icon.png`) — no
designer variants exist for these slots; the derivation is this cycle's
recorded ruling and the PR shows the rendered results:

- `android-icon-foreground.png`: monogram-only (C + sage J keyed out of
  the cream field), scaled to fit the adaptive safe zone (~62% of the
  1024 canvas), centered on transparency.
- `android-icon-background.png`: solid cream field sampled from the
  master (replaces the navy placeholder background so the masked tile
  matches the iOS icon).
- `android-icon-monochrome.png`: white silhouette of the same keyed
  monogram at the same scale/placement (Android 13+ themed icons).
- `splash-icon.png`: brand mark prepared for the navy splash
  background — the master rendered inside a cream rounded-square tile
  (`app.json` splash `imageWidth: 160` unchanged; splash
  `backgroundColor` stays `#16233F`).
- `android.adaptiveIcon.backgroundColor` stays `#16233F` (fallback only).

### R4 — Review hygiene (9 findings, all docs/assets plumbing)

1. `README.md` contributor section points specs at `specs/` (was
   `docs/superpowers/specs/`).
2. Merged spec `specs/2026-11-05-brand-favicons/spec.md` "Files touched"
   amended to list everything that PR actually touched (INTENT.md,
   app.json, package.json, package-lock.json were omitted).
3. Store preview mockups (`curated-journal-banner-preview.png`,
   `curated-journal-store-assets-preview.png`) converted to JPEG
   (Play accepts it; ~70% weight cut). Deliverable PNGs stay. Git
   history keeps the original blobs — noted, not rewritten.
4. `AGENTS.md` "where decisions live" stated once: charter INTENT.md,
   versioning docs/VERSIONING.md, in-flight cycles the spec folder,
   everything else the recorded history (issues/PRs) — the duplicate
   Spec-workflow bullet is removed.
5. VERSIONING.md: the `github-apk` EAS profile mention carries its
   lineage warning (an EAS- or upload-key-built APK does not install
   over fielded debug-signed sideloads).
6. VERSIONING.md: bullet 1 vs bullet 3 contradiction resolved in bullet
   3's favor — hand-migration warnings are required only for releases
   whose signing key changed (that includes R2's lineage statement).
7. VERSIONING.md: store-release step 2 rewritten as completed one-time
   setup (past tense), with its still-open obligation (verify upload
   key under Play App integrity; record the Google app-signing key)
   moved into the store checklist.
8. VERSIONING.md: the upload-key SHA-1 gains a verify command
   (`keytool -list` against `credentials/android/keystore.jks`) and a
   mismatch consequence.
9. `.gitignore`: `/credentials/` rule commented; duplicated
   `/credentials.json` rules collapsed to one.

## Acceptance criteria

- `npx expo prebuild --platform android --no-install` on this branch:
  generated `build.gradle` contains the guard; with
  `credentials/keystore.properties` present, release signing config is
  the upload keystore; guard is a no-op.
- With `credentials/keystore.properties` temporarily renamed, the guard
  makes any `*Release*` Gradle task fail loudly (verified by inspecting
  the generated guard; the execution-path test happens at the release
  train, not in CI).
- Image outputs verified: 1024×1024, correct alpha behavior (foreground
  transparent margins; monochrome white; background opaque cream).
- `npm run lint` 0 errors; `npx tsc --noEmit` clean; jest suite green.
- Version bumped to **7.0.0** in `package.json`, `app.json`,
  `package-lock.json` (three synced files, same PR).

## Non-goals

- No runtime/app-code changes; no privacy-surface change.
- No store submissions, tags, or builds in this PR (the release train
  follows at merge, per docs/VERSIONING.md, only when the user says so).
- No git-history rewrite for the preview PNG blobs.
- No new signing identity: the EAS upload keystore remains the store
  upload key and, from 7.0.0, the GitHub-APK sideload lineage of record.
