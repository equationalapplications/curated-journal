# Spec: continued downloads ask before using cellular data

**Status: Implemented** — 2026-11-16 (PR #125, 9.2.1)
Approved by the owner: the ruling of 2026-11-16 on #124 served as spec approval (Reviewed); no further review gate.
Date: 2026-11-16
Version cost: PATCH (9.2.0 → 9.2.1) per `docs/VERSIONING.md`
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
- Declining the cellular prompt (Cancel) on a CONTINUATION (restore, foreground resume, Resume, Retry; tracked by a `continuation` context flag) goes to `paused` (reason `restored`), keeping `pauseState` and persisting the row as `paused` with it. A fresh download's Cancel still returns to `selecting`.
- Manual `RESUME` from `paused`, and `RETRY` from `failed` with a pause state, now also go through `confirmingNetwork`: they ask only on cellular; Wi-Fi proceeds silently. Resume therefore asks again after a decline.
- `APP_BACKGROUND` in `confirmingNetwork` or `cellularConfirm` (continuations) goes to `paused` (reason `background`, `idlePause` so no live download is paused and the pause state is kept); the next `APP_FOREGROUND` re-runs the check.
- `awaitingWifi` gains `LEAVE_WAITING` → `selecting`, with a "Choose another model" button in `AwaitingWifi`; the saved row is left as is, so an offline restore no longer traps the user (the list and "Import custom .gguf" are reachable).
- `download.tsx` shows "Starting download…" only in `downloading`.
- Abandoning a continuation clears its row: a successful custom import (`IMPORT_SMOKE_OK`) and `SELECT_MODEL` of a model different from the row's model both call `clearDownloadState` (errors swallowed). Otherwise a later hub open would restore the abandoned download and, on success, replace the user's imported or chosen model without a "Replace model" confirmation. `LEAVE_WAITING` alone keeps the row ("not now"); same-model `SELECT_MODEL` keeps today's behavior.
- `CellularConfirm` closes its sheet whenever the machine is not in `cellularConfirm` (e.g. `APP_BACKGROUND` moves to `paused`, then foreground on Wi-Fi goes to `downloading`), via `dismiss` from `useConfirmSheet`.
- `RETRY` from `failed` with a pause state IS reachable (a declined continuation whose `paused` write fails errors `pauseTask` into `failed` keeping the pause state; also a resumed download whose user pause rejects). It goes `confirmingNetwork` → `cellularConfirm`, and Cancel returns to `paused`. This corrects an earlier note calling it unreachable.
- Known, not fixed here (separate issue to be filed): a pre-existing pause race, `APP_FOREGROUND` while the background `pauseTask` is still in flight leaves a stale pause state.
- Known, not fixed here (separate issue): a Wi-Fi drop after the check falls back to cellular silently; this also affects fresh downloads.

`src/app/model-hub/_layout.tsx`, `download.tsx`, `index.tsx`: a continued download lands on `download.tsx` (restore replaces the list; foreground leaves it beneath), so the network states need UI there.
- The cellular confirm sheet has ONE owner, `CellularConfirm` (`src/components/model-hub/cellular-confirm.tsx`), rendered by the hub layout inside `ModelHubProvider`; `index.tsx` no longer renders it, so it shows exactly once whichever screen is on top.
- `AwaitingWifi` (`src/components/model-hub/awaiting-wifi.tsx`) is the shared "Connect to Wi-Fi" message and Try again (`CHECK_NETWORK`), used by both screens.
- `download.tsx` shows "Checking your connection…" in `confirmingNetwork` and `AwaitingWifi` in `awaitingWifi`, and any transition INTO `selecting` (not the initial `selecting` of a restore mount) dismisses to `/model-hub`, where the error banner and list show.
- Unchanged: `SELECT_MODEL`, restored-paused entry, smoke states.

## Rejected alternatives

- Gate every continuation behind a tap: contradicts the ruling (automatic continuation stays; only cellular asks).
- Copy-only (warn in the UI text): still spends cellular data without consent.

## Tests

`__tests__/modelHubMachine.test.ts`: restore on cellular → `cellularConfirm`, no download until confirmed, then resumes from the saved pause state; restore on Wi-Fi → resumes from the saved pause state with no prompt; foreground resume on cellular → `cellularConfirm`, then resumes; foreground resume on Wi-Fi → resumes. Note: the machine test that restores a `resumeData` record under status `downloading` is synthetic (production persists no pause state there). The foreground Wi-Fi test also asserts `checkNetwork` ran.

`__tests__/modelHubDownloadNetworkStates.test.tsx` (testID/role based): sheet visible once on `cellularConfirm` with both buttons sending CELLULAR_CONFIRM / CELLULAR_CANCEL; sheet renders once with list and download screens both mounted; checking line on `confirmingNetwork`; Try again sends CHECK_NETWORK on `awaitingWifi`; transition into `selecting` dismisses to `/model-hub`; initial `selecting` does not; the download framing ("Downloading your AI") stays during `confirmingNetwork`/`awaitingWifi`.

Added for the review round: foreground decline stays paused with resume data and Resume on cellular re-asks; Resume on Wi-Fi proceeds silently; fresh-download cancel still goes to `selecting`; restore decline persists the paused row; APP_BACKGROUND during the check and on the cellular prompt re-pauses and the next foreground re-checks; offline restore exits via `LEAVE_WAITING` and reaches custom import. UI: Choose another model sends `LEAVE_WAITING`; "Starting download…" only in `downloading`.

`__tests__/modelHubLayoutRestoreCellular.test.tsx`: renders the REAL `src/app/model-hub/_layout.tsx` (real machine and provider; store, network gate, download service and router mocked): restore over cellular shows the sheet exactly once, replaces to `/model-hub/download`, downloads nothing until confirm, then Confirm closes the sheet and starts the download; Cancel closes the sheet and starts nothing. Fails if `<CellularConfirm />` is removed from the layout.
`__tests__/modelHubDownloadSmokeFailed.test.tsx` covers "Choose another model" landing on the list (via the transition effect).

The old "restore downloads without a network check" test now asserts the check runs. RED on main, GREEN after.

## INTENT check

Rule 9 (no surprise network use) is better served: cellular use is always consented to. No new network, state, or store. No contradiction.

## Verification

- [x] `npx tsc --noEmit`, `npm run lint`, `npx jest --maxWorkers=2` pass.
- [ ] On device: start a download on Wi-Fi, kill the app, reopen the hub on cellular → cellular prompt appears.
- [ ] On device: start on Wi-Fi, background, return on cellular → cellular prompt appears; returning on Wi-Fi resumes with no prompt.
