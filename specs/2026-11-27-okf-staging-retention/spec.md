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
| Document picker cache copy (`Paths.cache/DocumentPicker/<uuid>.zip`, made by `getDocumentAsync` default `copyToCacheDirectory`) | In the import `prepare`, right after it is copied to `import-{id}.zip` (only if the URI is inside the cache; a user original is never deleted). Leftovers: next launch. |
| Any crash leftover | Next launch. |

New `src/lib/stagingSweep.ts` `sweepStaging(kinds)` deletes `export-*` / `import-*` files and directories in `Paths.cache`, best-effort, never throws, logs failures. Called with both kinds once from `RootLayout` at launch (via `useLaunchStagingSweep`, a `setTimeout(0)` so first render is not blocked; errors swallowed; it still runs before any user-started import or export; the launch sweep also empties `DocumentPicker/`) and with `['export']` at the start of `exportOkfFromDump` (an import modal may be open; its staging must not be touched). A module-level set of active export ids makes the sweep skip `export-{id}` and `export-{id}.zip` of exports in flight, so overlapping exports do not delete each other's files. A finished export's share-sheet zip is not active and is swept by the next export.

**Accepted trade-off (owner):** share-sheet zips are swept at the next export and next launch with no grace period. A slow Android share target that outlives the app process could lose the file.

## Out of scope

- Deleting a share-sheet zip earlier than the next export/launch.
- `src/app/model-hub/import.tsx` (model files, not journal content).
- Retention of copies outside the cache (user-chosen SAF/share destinations are the user's).
- Editing INTENT.md (rule 13 is PR #129).

## Verification

Automated: `__tests__/stagingRetention.test.ts` (SAF save deletes on success and failure; cancel fallback and share path leave the zip; next export sweeps an old export zip and only `export-*`; old export zip deleted before `zip()` and the new one survives; two overlapping exports both succeed; picker copy deleted only inside the cache, `DocumentPicker/` emptied at launch and not at export start; `useLaunchStagingSweep` sweeps once, deferred; failing delete does not mask the SAF error; sharing unavailable deletes the zip; launch sweep removes both kinds and ignores other entries; sweep never throws on delete or list failure); typecheck, lint, jest.

On-device (the owner's, not blocking):

- [ ] Android: share to Drive, confirm the upload completes; relaunch and confirm the cache zip is gone.
- [ ] Android: save to Downloads, confirm no `export-*` remains in cache afterwards.
- [ ] iOS: share sheet export, relaunch, confirm cache is clean.
- [ ] Import a bundle, confirm no `import-*` remains in cache.
