# SDK 58 doc hygiene: v57→v58 references + INTENT status-stamp refresh

**Status:** Reviewed
**Date:** 2026-10-28
**Class:** PATCH (docs-only) — 4.0.0 → 4.0.1
**Alignment:** checked against `INTENT.md` — docs hygiene is rule-10
charter-maintenance territory; no intent contradiction.

## Problem

PR #75 (Expo SDK 58, merged 2026-10-28) upgraded the app but left the
root docs pointing at the Expo SDK 57 docs and stale platform facts.
Evidence at branch time (`e4db7a9`):

- `AGENTS.md:13` — "read the versioned docs at …/v57.0.0/" (the file's
  whole point is to point agents at the CURRENT docs).
- `README.md` — badge, intro, docs table, and troubleshooting all say
  SDK 57 / v57.0.0; the framework table said "React Native 0.86"
  (actual: 0.88.0, set by #75); `npx expo install` guidance said
  "compatible with SDK 57".
- `CONTRIBUTING.md` — toolchain section linked v57.0.0.
- `INTENT.md:15` — status stamp still cited commit `42b7fc2`
  (2026-10-27), three merges stale.

## Proposed change

Docs-only, no code:

1. All root docs (`AGENTS.md`, `README.md`, `CONTRIBUTING.md`): v57.0.0
   → v58.0.0 links, SDK 57 → SDK 58 labels, RN 0.86 → 0.88.
2. `AGENTS.md` platform gotchas: keep the SDK 57 keyboard observation but
   mark it carried-into-58 (Android 15 edge-to-edge is OS-level, not
   SDK-level; not device-re-verified); mark `expo-file-system/legacy` as
   still the supported SAF path on 58 (verified against `src/lib/okfExport.ts`
   imports at `e4db7a9`).
3. `INTENT.md` status stamp: refresh to `e4db7a9` with an honest delta
   list (#73 test-only, #74 Settings version row, #75 SDK upgrade) after
   re-verifying the Built claims live (app.config.ts derivation +
   `checkAutomatically: 'NEVER'`, `src/lib/updateCheck.ts`, night-shift
   prune opt-in, wiki packages 7.13.1).
4. Version bump 4.0.0 → 4.0.1 in the three synced files
   (`package.json`, `app.json`, `package-lock.json`) — docs-only changes
   are PATCH-class but still bump (`docs/VERSIONING.md`).

## Files touched

`AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `INTENT.md`, `package.json`,
`app.json`, `package-lock.json`, this spec.

## Test plan

Docs-only: no behavior change. Gates: `tsc --noEmit` clean, lint 0 errors,
jest suite green (unchanged count), plus the docs-only convention: a
fresh-context fact-check review of the diff (SoR skipped per the
2026-10-27 docs-PR convention).

## Non-goals

- No release-train steps (build HOLD per Kurt, 2026-10-28): this PATCH
  rides main untagged like 3.0.1/3.0.2 did; the next train tags from
  wherever main is when it runs.
- No content rewrites beyond version accuracy.
