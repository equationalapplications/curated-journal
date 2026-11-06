# Curated Journal — agent notes

## Spec alignment

Every spec must be checked against `INTENT.md` before implementation work
begins. If a spec contradicts `INTENT.md` *on intent*, the spec is wrong
until `INTENT.md` is amended through PR review: INTENT wins on *intent*
(what we are trying to do), specs win on *detail* (exactly how). Do not
design around an INTENT rule silently.

## Expo has changed

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/
before writing any code. APIs that exist in docs prose may not be public
in the installed package version — verify against the installed types.

## Versioning

Every change to `main` carries a version bump: MAJOR if it breaks OTA for
shipped binaries, MINOR for OTA-safe features, PATCH for fixes. Full
policy and the release train: [docs/VERSIONING.md](docs/VERSIONING.md).
Update an `INTENT.md` status line in the same PR that changes behavior.

## Heavy builds and resources

- Never run bare `gradlew` on this machine — release builds go through
  the `heavy-build` wrapper. Sanity-check `df -h` and `free -m` before
  launching one.
- Android builds are long; run them serially, not in a parallel wave with
  other EA workstreams.

## Known platform gotchas (each cost a debug round)

- **Android 15+ edge-to-edge keyboards:** `adjustResize` is dead and
  `KeyboardAvoidingView` is unreliable on SDK 57 (Android 15 edge-to-edge — OS-level behavior, carried into 58). Use
  `react-native-keyboard-controller` (`KeyboardProvider` in the root
  layout + `KeyboardAwareScrollView` for scrollables); for fixed layouts
  use keyboard-height padding with `marginTop: 'auto'`.
- **SAF file writes:** `expo-file-system`'s StorageAccessFramework (from
  `expo-file-system/legacy`, still the supported path on SDK 58) defaults `writeAsStringAsync` to
  UTF-8 — passing base64 content REQUIRES `{ encoding:
  EncodingType.Base64 }`, or the zip writes as literal text and corrupts.
- **SAF directory picker:** it reopens at the last-used provider unless
  seeded with a tree URI (`getUriForDirectoryInRoot('Download')`); Drive
  trees reject `createFileAsync`.
- **XState v5:** a bare string in an event's `actions` parses as a state
  target ("Invalid target: syncPin") — use `actions: [...]`. Fields in one
  `assign({a: f(ctx), b: f(ctx)})` all see the same pre-event context.
  `actor.stop()` never runs exit actions — use AbortController-in-input.
- **jest-expo:** hoisted `jest.mock` breaks React Native testing-library
  UNSAFE queries — prefer testID-based structural assertions for
  native-backed components.

## Where decisions live

- Charter: `INTENT.md` (repo root).
- Versioning/OTA policy: `docs/VERSIONING.md`.
- Everything else: GitHub issues and PR discussions in this repo.

## Spec workflow (SDD)

- **Read INTENT.md first.** INTENT wins on *intent*, specs on *detail*; a
  spec that contradicts a rule is wrong until INTENT is amended by PR.
- **Authority chain:** INTENT beats spec beats plan beats prompt. When the
  spec does not answer a question, STOP and ask — never invent.
- **Specs live in `specs/<name>/`** — one folder per cycle: `spec.md`,
  `plan.md`, `LEDGER.md`. The folder is the unit of review and of cleanup.
- **Lifecycle:** the spec's status line carries `Draft` → `Reviewed` →
  `Implemented`; one PR carries spec + plan + implementation and stays
  draft until implemented; `plan.md` + `LEDGER.md` are transient
  scaffolding deleted in the same-PR cleanup commit — never a separate
  cleanup PR, never written after a merge.
- **INTENT.md is static** — not a status ledger (Kurt ruling 2026-11-04):
  no Built/Planned status lines, no delivery progress. Implementation
  status lives in the spec's status line and LEDGER while in flight, and
  in the delivery records after merge.
- **Where decisions live:** the spec folder while in flight; the recorded
  decision history after merge.
