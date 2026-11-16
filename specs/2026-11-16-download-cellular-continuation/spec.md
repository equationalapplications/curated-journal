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
- `confirmingNetwork` exits are unchanged: Wi-Fi → `downloading`, cellular → `cellularConfirm`, else `awaitingWifi`. `downloading` already reads `context.pauseState`, which the restore event (or the pause task) set and `confirmingNetwork`/`cellularConfirm` do not touch, so a confirmed continuation RESUMES the saved download rather than starting fresh.
- Unchanged: manual `RESUME` (the user just tapped it), `SELECT_MODEL`, restored-paused, smoke states.

## Rejected alternatives

- Gate every continuation behind a tap: contradicts the ruling (automatic continuation stays; only cellular asks).
- Copy-only (warn in the UI text): still spends cellular data without consent.

## Tests

`__tests__/modelHubMachine.test.ts`: restore on cellular → `cellularConfirm`, no download until confirmed, then resumes from the saved pause state; restore on Wi-Fi → resumes from the saved pause state with no prompt; foreground resume on cellular → `cellularConfirm`, then resumes; foreground resume on Wi-Fi → resumes. The old "restore downloads without a network check" test now asserts the check runs. RED on main, GREEN after.

## INTENT check

Rule 9 (no surprise network use) is better served: cellular use is always consented to. No new network, state, or store. No contradiction.

## Verification

- [x] `npx tsc --noEmit`, `npm run lint`, `npx jest --maxWorkers=2` pass.
- [ ] On device: start a download on Wi-Fi, kill the app, reopen the hub on cellular → cellular prompt appears.
- [ ] On device: start on Wi-Fi, background, return on cellular → cellular prompt appears; returning on Wi-Fi resumes with no prompt.
