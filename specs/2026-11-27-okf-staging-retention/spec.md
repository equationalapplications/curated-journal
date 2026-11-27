# Spec: delete OKF staging copies from the cache

**Status: Implemented** — 2026-11-27 (9.2.4)
Date: 2026-11-27
Version cost: PATCH (9.2.3 → 9.2.4) per `docs/VERSIONING.md`; PR #125 takes 9.2.3, whichever merges later re-bumps.
Prepares: INTENT rule 13 (PR #129): "Any out-of-file copy this app creates is named in this file with its retention."

## Why

Export and import stage journal content in `Paths.cache` as `export-{id}/`, `export-{id}.zip`, `import-{id}/` and `import-{id}.zip`. The export zip was never deleted, so a full journal copy outlived its purpose. Retention must be short and stated.

## Owner decision (2026-11-27)

1. Direct SAF save: delete the cache zip as soon as the save completes, fails or is cancelled (the SAF write finishes before `saveOkfToDevice` returns).
2. Share sheet: do not delete when `shareAsync` resolves. On Android it resolves before async targets (Drive) finish reading the content:// URI. Sweep leftovers at the start of the next export and at app launch.
3. Import staging: deleted when the import finishes, fails or is cancelled; crash leftovers swept at launch.

## Behaviour

| Copy | Deleted |
| --- | --- |
| Import zip + extract dir | When the import ends (finish, fail, cancel; `importMachine` runs `cleanup` on teardown and `prepare` cleans on failure). Crash leftovers: next launch. |
| Export dir `export-{id}/` | In `finally` of the export (unchanged). |
| Export zip, direct SAF save | In `finally` of `saveOkfToDevice`, on success, failure or cancel. Exception: if the picker is cancelled and the code falls back to the share sheet, the zip is treated as a share-sheet zip. |
| Export zip, share sheet | Next export start, or next launch. |
| Any crash leftover | Next launch. |

New `src/lib/stagingSweep.ts` `sweepStaging(kinds)` deletes `export-*` / `import-*` files and directories in `Paths.cache`, best-effort, never throws, logs failures. Called with both kinds once from `RootLayout` at launch (synchronous, errors swallowed, does not gate bootstrap; nothing can be running at launch) and with `['export']` at the start of `exportOkfFromDump` (an import modal may be open; its staging must not be touched).

## Out of scope

- Deleting a share-sheet zip earlier than the next export/launch.
- Concurrent exports (the settings screen starts one at a time).
- Retention of copies outside the cache (user-chosen SAF/share destinations are the user's).
- Editing INTENT.md (rule 13 is PR #129).

## Verification

Automated: `__tests__/stagingRetention.test.ts` (SAF save deletes on success and failure; cancel fallback and share path leave the zip; next export sweeps an old export zip and only `export-*`; launch sweep removes both kinds and ignores other entries; sweep never throws on delete or list failure); typecheck, lint, jest.

On-device (the owner's, not blocking):

- [ ] Android: share to Drive, confirm the upload completes; relaunch and confirm the cache zip is gone.
- [ ] Android: save to Downloads, confirm no `export-*` remains in cache afterwards.
- [ ] iOS: share sheet export, relaunch, confirm cache is clean.
- [ ] Import a bundle, confirm no `import-*` remains in cache.
