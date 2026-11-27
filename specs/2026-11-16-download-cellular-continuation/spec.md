# Spec: continued downloads ask before using cellular data

**Status: Implemented** — 2026-11-16 (PR #125, 9.2.3)
Approved by the owner: the ruling of 2026-11-16 on #124 served as spec approval (Reviewed); no further review gate.
Date: 2026-11-16
Version cost: PATCH (9.2.2 → 9.2.3) per `docs/VERSIONING.md`
Closes: #124

## Problem

A fresh model download goes through `confirmingNetwork` and shows the cellular prompt. Two continuation paths skip it: restore after a kill (`RESTORE_DOWNLOAD` with status `downloading` → `checkingExisting` with `afterCheck: 'download'` → straight to `downloading`) and foreground resume (`paused` + `APP_FOREGROUND` with `pausedReason === 'background'` → `downloading`). A download started on Wi-Fi, killed or backgrounded, then continued on cellular pulls gigabytes of cellular data without asking. Live in today's app, independent of privacy modes (found in the Opus review of #117).

## Evidence

RED on `main` (9.2.0 plus the new tests, fix not applied), `__tests__/modelHubMachine.test.ts`: 3 failures. Restore on cellular never reaches `cellularConfirm` (goes straight to `downloading`); foreground resume on cellular never reaches `cellularConfirm`; and the restore path never calls `checkNetwork`. GREEN after the change: 54/54.

## Owner ruling

2026-11-16, #124 (and #117, whose Standard copy names this behavior): keep the automatic continuation (the user started the download), but route both paths through the same network check as a fresh download, which prompts only on cellular. Ship now as a PATCH.

## Change

`src/machines/modelHubMachine.ts`:
- `checkingExisting` (no verified file, or verify threw) always goes to `confirmingNetwork`. The `afterCheck` context flag existed only to skip the check on restore, so it is removed.
- `paused` + `APP_FOREGROUND` (background reason) goes to `confirmingNetwork` instead of `downloading`.
- `confirmingNetwork` exits are unchanged: Wi-Fi → `downloading`, cellular → `cellularConfirm`, else `awaitingWifi`. `downloading` already reads `context.pauseState`, which the restore event (or the pause task) set and `confirmingNetwork`/`cellularConfirm` do not touch, so a confirmed continuation resumes from a saved pause state when one exists. In production the `downloading` entry persists `pauseState: null`, so a download killed mid-flight restores with no pause state and starts over (behind the network check); resume-from-pause-state applies only when a pause state was saved (a background pause).
- Declining the cellular prompt (Cancel) on a CONTINUATION (restore, foreground resume, Resume, Retry; tracked by a `continuation` context flag) goes to `paused` (reason `restored`), keeping `pauseState` and persisting the row as `paused` with it. A fresh download's Cancel still returns to `selecting`, including after a background/foreground during its network check. The flag is reset when a download starts (`downloading.entry`), and `paused` + `APP_FOREGROUND` sets `continuation: pauseState !== null || continuation`, so restored/held rows (set true at restore or re-pick) stay continuations while a fresh pick does not.
- Manual `RESUME` from `paused`, and `RETRY` from `failed` with a pause state, now also go through `confirmingNetwork`: they ask only on cellular; Wi-Fi proceeds silently. Resume therefore asks again after a decline.
- `APP_BACKGROUND` in `confirmingNetwork` (fresh starts too, so a late Wi-Fi result cannot start a download while backgrounded) goes to `paused` (reason `background`, `idlePause` so no live download is paused and the pause state is kept; a fresh pause persists `paused` with a null pause state); the next `APP_FOREGROUND` re-runs the check. In `cellularConfirm` only continuations re-pause: a fresh pick's prompt just stays up, since nothing downloads until the user taps.
- `awaitingWifi` gains `LEAVE_WAITING` → `selecting`, with a "Choose another model" button in `AwaitingWifi`; the saved row is left as is, so an offline restore no longer traps the user (the list and "Import custom .gguf" are reachable).
- `download.tsx` shows "Starting download…" only in `downloading`.
- Abandoning a continuation clears its row: a successful custom import (`IMPORT_SMOKE_OK`) and `SELECT_MODEL` of a model different from the row's model both call `clearDownloadState` (errors swallowed). Otherwise a later hub open would restore the abandoned download and, on success, replace the user's imported or chosen model without a "Replace model" confirmation. `LEAVE_WAITING` alone keeps the row ("not now"); same-model `SELECT_MODEL` of an already-installed model (`currentModelId`) keeps today's behavior. Re-selecting the model whose saved row is held (e.g. PAUSE, Resume offline, Choose another model, tap the same model) keeps `pauseState` and sets `continuation` (a held row without pause state, e.g. `LEAVE_WAITING` from an offline restore, stays a continuation), so it resumes via `resumeDownload` behind the network check (a cellular decline returns to `paused`) instead of restarting from zero over the saved resume data.
- Import kill window: `import.tsx` `runImport` clears the download row (via the hub context's `clearDownloadState`; errors swallowed and logged) BEFORE the identity commit (`setModelPath`), so a kill between the commit and `IMPORT_SMOKE_OK` cannot leave an abandoned row that a later Wi-Fi open would download over the import. The machine's `IMPORT_SMOKE_OK` clear stays as a second guard.
- `CellularConfirm` closes its sheet whenever the machine is not in `cellularConfirm` (e.g. `APP_BACKGROUND` moves to `paused`, then foreground on Wi-Fi goes to `downloading`), via `dismiss` from `useConfirmSheet`.
- `RETRY` from `failed` with a pause state IS reachable (a declined continuation whose `paused` write fails errors `pauseTask` into `failed` keeping the pause state; also a resumed download whose user pause rejects). It goes `confirmingNetwork` → `cellularConfirm`, and Cancel returns to `paused`. This corrects an earlier note calling it unreachable.
- Known, not fixed here (separate issue to be filed): a pre-existing pause race, `APP_FOREGROUND` while the background `pauseTask` is still in flight leaves a stale pause state.
- Known, not fixed here (separate issue): a Wi-Fi drop after the check falls back to cellular silently; this also affects fresh downloads.

`src/app/model-hub/_layout.tsx`, `download.tsx`, `index.tsx`: a continued download lands on `download.tsx` (restore replaces the list; foreground leaves it beneath), so the network states need UI there.
- The cellular confirm sheet has ONE owner, `CellularConfirm` (`src/components/model-hub/cellular-confirm.tsx`), rendered by the hub layout inside `ModelHubProvider`; `index.tsx` no longer renders it, so it shows exactly once whichever screen is on top.
- `AwaitingWifi` (`src/components/model-hub/awaiting-wifi.tsx`) is the shared "Connect to Wi-Fi" message and Try again (`CHECK_NETWORK`), used by both screens.
- `download.tsx` shows "Checking your connection…" in `confirmingNetwork` and `AwaitingWifi` in `awaitingWifi`, and any transition INTO `selecting` (not the initial `selecting` of a restore mount) dismisses to `/model-hub`, where the error banner and list show.
- Unchanged: `SELECT_MODEL`, restored-paused entry, smoke states.
- `src/app/model-hub/import.tsx` (#124): the pre-copy orphan sweep keeps the saved download row's model file (`keepModelId` = the row's model, read through a new `readDownloadModelId` on `ModelHubApi`/`useModelHub`; an unreadable row skips the sweep). After a SUCCESSFUL import (row cleared, identity committed) a second sweep with `keepModelId: null` removes that now-abandoned partial. A failed copy or smoke test leaves the file and the row consistent. Why: `LEAVE_WAITING` lets a paused row with resume data reach custom import; if the sweep deleted its Android partial first and the import then failed, a later Resume would `RandomAccessFile.setLength(offset)` on the missing file, zero-filling the head, and the size-only `verifyDownload` would pass a corrupt file into the smoke test.
- Sink guard (#124, the backstop for every path that can delete a kept partial while its `paused` row survives): `resumeDownload` in `src/services/modelDownloadService.ts`, on Android, requires the partial at `pauseState.fileUri` to exist with size >= the resume offset before `DownloadTask.fromSavable(...).resumeAsync()`. Android's `resumeData` is the partial's byte length as a decimal string (`destinationFile.length().toString()`), so it is parsed as an integer; an unparseable offset fails safe. Otherwise it deletes any short partial and falls back to a fresh download of the same url and destination, so the caller still gets a File. iOS is unchanged: its resume data references an OS-owned temp file, with no app-owned partial to check.
- Sweep guard (#124): `createModelHubApi`'s `deleteOrphanedModelFiles` reads the store row (`store.get()`, which waits for queued writes) and also keeps the row's model (`alsoKeepModelId`); an unreadable row skips the sweep. This covers SELECT_MODEL's fire-and-forget `clearDownloadState` failing and `checkingExisting` then sweeping the kept partial. The row's model is spared only when the row status is `paused` (the only status that restores with resume data); a `failed` row is never restored, so its partial is not retained.
- `import.tsx`: when the row read throws but the row clear then succeeds, the second sweep still runs (a keep-null sweep is safe once the row is gone).
- If `setModelPath`/`setModelId` throws after the row clear, the import ends `IMPORT_FAILED` with the row cleared; the kept file is a harmless orphan, and the context's pauseState still lets a same-session re-pick resume.

## Rejected alternatives

- Gate every continuation behind a tap: contradicts the ruling (automatic continuation stays; only cellular asks).
- Copy-only (warn in the UI text): still spends cellular data without consent.

## Tests

`__tests__/modelHubMachine.test.ts`: restore on cellular → `cellularConfirm`, no download until confirmed, then resumes from the saved pause state; restore on Wi-Fi → resumes from the saved pause state with no prompt; foreground resume on cellular → `cellularConfirm`, then resumes; foreground resume on Wi-Fi → resumes. Note: the machine test that restores a `resumeData` record under status `downloading` is synthetic (production persists no pause state there). The foreground Wi-Fi test also asserts `checkNetwork` ran. Stale-flag tests: fail → `RETRY` → re-select on cellular → Cancel lands in `selecting`; fresh pick backgrounded during the check → foreground on cellular → Cancel lands in `selecting`; plus restored-continuation tests (held row without pause state stays a continuation; background on the cellular prompt of a continuation re-pauses).

`__tests__/modelHubDownloadNetworkStates.test.tsx` (testID/role based): sheet visible once on `cellularConfirm` with both buttons sending CELLULAR_CONFIRM / CELLULAR_CANCEL; sheet renders once with list and download screens both mounted; checking line on `confirmingNetwork`; Try again sends CHECK_NETWORK on `awaitingWifi`; transition into `selecting` dismisses to `/model-hub`; initial `selecting` does not; the download framing ("Downloading your AI") stays during `confirmingNetwork`/`awaitingWifi`.

Added for the review round: foreground decline stays paused with resume data and Resume on cellular re-asks; Resume on Wi-Fi proceeds silently; fresh-download cancel still goes to `selecting`; restore decline persists the paused row; APP_BACKGROUND during the check and on the cellular prompt re-pauses and the next foreground re-checks; offline restore exits via `LEAVE_WAITING` and reaches custom import. UI: Choose another model sends `LEAVE_WAITING`; "Starting download…" only in `downloading`.

`__tests__/modelHubLayoutRestoreCellular.test.tsx`: renders the REAL `src/app/model-hub/_layout.tsx` (real machine and provider; store, network gate, download service and router mocked): restore over cellular shows the sheet exactly once, replaces to `/model-hub/download`, downloads nothing until confirm, then Confirm closes the sheet and starts the download; Cancel closes the sheet and starts nothing. Fails if `<CellularConfirm />` is removed from the layout.
`__tests__/modelHubDownloadSmokeFailed.test.tsx` covers "Choose another model" landing on the list (via the transition effect).

`__tests__/modelHubImport.test.tsx` (#124), with a saved row for model A: the sweep runs keeping A; a failed smoke test and a failed copy each leave A's file (no second sweep) and the row (no clear); a successful import clears the row and sweeps A's file with `keepModelId: null`; an unreadable row skips the sweep. The failure tests are RED on the previous head.

`__tests__/modelDownloadService.test.ts` (sink guard): Android with a missing partial, a partial shorter than the offset, or an unparseable offset starts fresh with no `fromSavable`; a partial >= the offset resumes as before; iOS resumes unchanged with no partial. The missing-partial test is RED without the guard. `__tests__/modelFiles.test.ts` is the behavior proof for `alsoKeepModelId` (spares the second model, with and without a keep id; RED without the clause). `__tests__/useModelHub.test.ts` is wiring only: a paused row's model is passed as `alsoKeepModelId`, a failed row's is not; an unreadable row skips the sweep; `readDownloadModelId` returns the row's model, null for a cleared row, and rejects on a read failure. The fresh-start fallbacks also assert `DownloadTask` receives `pause.url`, a File at `pause.fileUri`, the User-Agent header and an onProgress. `__tests__/modelHubImport.test.tsx`: a failing row clear still runs only the first sweep (keeping A) and sends IMPORT_SMOKE_OK; RED if `if (rowCleared && keptModelId)` loses `rowCleared`.

The old "restore downloads without a network check" test now asserts the check runs. RED on main, GREEN after.

## Accepted limitations

- `paused` has no import or choose-another exit on cellular: a declined continuation is resumed with consent, waits for Wi-Fi, or the user leaves the hub.

- An orphaned partial with no row is freed only by the next `checkingExisting` sweep.

- `verifyDownload` is size-only and the smoke test is not a reliable corruption check; the resume sink guard is the backstop. Hash verification is filed as a separate issue.

## INTENT check

Rule 9 (no surprise network use) is better served: cellular use is always consented to. No new network, state, or store. No contradiction.

## Verification

- [x] `npx tsc --noEmit`, `npm run lint`, `npx jest --maxWorkers=2` pass.
- [ ] On device: start a download on Wi-Fi, kill the app, reopen the hub on cellular → cellular prompt appears.
- [ ] On device: start on Wi-Fi, background, return on cellular → cellular prompt appears; returning on Wi-Fi resumes with no prompt.
- [ ] On device: `cellularConfirm` then background then foreground on cellular in quick succession re-presents the sheet (RN iOS Modal re-present timing).
