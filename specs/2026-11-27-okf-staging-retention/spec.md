# Spec: delete OKF staging copies from the cache

**Status: Implemented** — 2026-11-27 (9.2.4)
Date: 2026-11-27
Version cost: PATCH, 9.2.2 → 9.2.4 (9.2.3 reserved for #125) per `docs/VERSIONING.md`; whichever merges later re-bumps.
Prepares: INTENT rule 13 (PR #129): "Any out-of-file copy this app creates is named in this file with its retention."

## Why

Export and import stage journal content in `Paths.cache` as `export-{id}/`, `export-{id}.zip`, `import-{id}/` and `import-{id}.zip`. The export zip was never deleted, so a full journal copy outlived its purpose. Retention must be short and stated.

## Owner decision (2026-11-27)

Approved by the owner on 2026-11-27 (decisions 1-3 below, plus the accepted trade-off under Behaviour).

1. Direct SAF save: delete the cache zip as soon as the save completes, fails or is cancelled (the SAF write finishes before `saveOkfToDevice` returns).
2. Share sheet: do not delete when `shareAsync` resolves. On Android it resolves before async targets (Drive) finish reading the content:// URI. Sweep leftovers at the start of the next export and at app launch.
3. Import staging: deleted when the import finishes, fails or is cancelled; crash leftovers swept at launch.

## Behaviour

| Copy | Deleted |
| --- | --- |
| Import zip + extract dir | When the import ends (finish, fail, cancel; `importMachine` runs `cleanup` on teardown and `prepare` cleans on failure). Crash leftovers: next launch. |
| Export dir `export-{id}/` | In `finally` of the export (was already deleted there before this change; now guarded so a failed `create()` does not mask the real error). |
| Export zip, direct SAF save | In `finally` of `saveOkfToDevice`, on success, failure or cancel. Exception: if the picker is cancelled and the code falls back to the share sheet, the zip is treated as a share-sheet zip. |
| Export zip, share sheet | Next export start, or next launch. |
| Export zip, sharing unavailable (share-sheet export, or the SAF-cancel fallback) | Deleted at once; the export throws "Sharing is not available on this device." and Settings shows "Export failed" (before this change it returned silently and left the zip). |
| Document picker cache copy (`Paths.cache/DocumentPicker/<uuid>.zip`, made by `getDocumentAsync` default `copyToCacheDirectory`) | In the import `prepare`, right after it is copied (and again, idempotently, in its failure path) to `import-{id}.zip` (only if the URI is inside the cache; a user original is never deleted). Leftovers: next launch. |
| iOS picker Inbox copy (`<container>/tmp/<bundle-id>-Inbox/<name>`; `getDocumentAsync` opens with `asCopy: true`, so iOS puts a copy here before the module copies it into `DocumentPicker/`) | In the import `prepare`, on iOS only, right after the copy to `import-{id}.zip` (and idempotently in its failure path), by the picked asset's `name` (best-effort, exists-guarded). Leftovers: the launch sweep deletes the children of every `*-Inbox` dir in the app's tmp dir (`new Directory(Paths.cache, '..', '..', 'tmp')`; expo-file-system defers permission for paths outside caches/documents to the OS). |
| Any crash leftover | Next launch. |

New `src/lib/stagingSweep.ts` `sweepStaging(kinds)` deletes `export-*` / `import-*` files and directories in `Paths.cache`, best-effort, never throws, logs failures. Called with both kinds once from `RootLayout` at launch (via `useLaunchStagingSweep`, once per process (a `RootLayout` remount is not a launch), a `setTimeout(0)` so first render is not blocked; errors swallowed; it still runs before any user-started import or export; the launch sweep also empties `DocumentPicker/`, which clears model-hub picker leftovers too) and with `['export']` at the start of `exportOkfFromDump` (an import modal may be open; its staging must not be touched). A module-level set of active export ids makes the sweep skip `export-{id}` and `export-{id}.zip` of exports in flight, so overlapping exports do not delete each other's files. `saveOkfToDevice` protects its zip's name until its `finally`, so a second export's sweep cannot delete a zip mid-save (picker, `createFileAsync`, base64). A finished export's share-sheet zip is not active and is swept by the next export.

**Accepted trade-off (owner):** share-sheet zips are swept at the next export and next launch with no grace period. A slow Android share target that outlives the app process could lose the file.

## Out of scope

- Deleting a share-sheet zip earlier than the next export/launch.
- `src/app/model-hub/import.tsx` (model files, not journal content).
- Retention of copies outside the cache (user-chosen SAF/share destinations are the user's).
- Editing INTENT.md (rule 13 is PR #129).

## Verification

Automated: `__tests__/stagingRetention.test.ts` (SAF save deletes on success and failure; cancel fallback and share path leave the zip; a failing delete does not mask the SAF error; sharing unavailable deletes the zip; a second export started while a SAF save is pending does not delete the first zip; a real export A is released and swept by a real export B; overlapping exports with a gated share keep both zips and URIs; a failed `create()` surfaces the real error, skips the missing dir and still releases the id; a partial zip is deleted when `zip()` or `shareAsync` throws; old export zip deleted before `zip()`; launch sweep removes both kinds and ignores other entries; sweep never throws on delete or list failure; `DocumentPicker/` emptied at launch and not at export start; `deletePickerCopy` needs the trailing slash and never touches a user original; `useLaunchStagingSweep` is deferred (fake timers: no deletes before the timer, deletes after); `_layout.tsx` imports the hook and calls it as the first statement of `RootLayout`, source-level; share with sharing unavailable deletes the zip and throws; a failed SAF write deletes the half-written SAF file; `share:false` protects the zip until the save releases it; iOS Inbox copy deleted by name, launch sweep empties `*-Inbox`, no-op on Android and web). `__tests__/importPickerCopy.test.tsx` renders the import screen: `prepare` calls `deletePickerCopy` with the picker URI after the copy and in the failure path. Typecheck, lint, jest.

On-device (the owner's, not blocking):

- [ ] Android: share to Drive, confirm the upload completes; relaunch and confirm the cache zip is gone.
- [ ] Android: save to Downloads, confirm no `export-*` remains in cache afterwards.
- [ ] iOS: share sheet export, relaunch, confirm cache is clean.
- [ ] Import a bundle, confirm no `import-*` remains in cache.
- [ ] iOS: after an import, `xcrun simctl get_app_container booted <bundleId> data`, then `ls <data>/tmp/*-Inbox` shows no journal zip; relaunch and confirm the Inbox is empty.
