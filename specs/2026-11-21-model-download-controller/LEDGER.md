# LEDGER (transient, deleted at cleanup)

## Notes

- This PR's diff includes #125 (`fix/download-cellular-continuation`) until
  #125 lands on main. Merged with `git merge --no-ff` (f11f9cf); version
  conflicts in package.json, package-lock.json and app.json resolved to 9.3.0.

## Task status

| # | Task | Status |
|---|---|---|
| 1 | RED reproductions | done (b-commit "RED reproductions"), file deleted in task 8 |
| 2 | Fake native task seam (`__tests__/helpers/fakeNativeDownload.ts`) | done |
| 3 | Service driver handle API | done |
| 4 | Controller + T-C tests (`modelDownloadController.test.ts`, 45 tests) | done |
| 5 | Hub machine + T-H tests (`modelHubController.test.ts`, `modelHubGraph.test.ts`) | done |
| 6 | Provider/layout/screens + T-S (`modelHubPausingScreens`, `modelHubLayoutLoadError`) | done |
| 7 | T-own (`downloadOwnership.test.ts`) | done |
| 8 | Replace RED file | done |
| 9 | Finish | done |

## RED evidence (against #125 baseline, merge f11f9cf)

`npx jest __tests__/downloadRedReproductions.test.ts`: 5 failed, 5 total.

- S1 FAIL: `resumeDownload` never called with P (the pause state was dropped).
- S2 FAIL: machine value is `paused` while `pauseDownload()` is still pending.
- S3 FAIL: `task.cancel` called 0 times after a rejected `pauseAsync`.
- S4 FAIL: machine reaches `failed` ("Could not pause") on a completed task.
- S5 FAIL: two `DownloadTask` constructed for two `startDownload` calls
  (expected length 1, received 2).

After the controller landed, the same scenarios pass as T-H1, T-H2, T-C5/T-H3,
T-H4 and T-C7 (`modelHubController.test.ts`, `modelDownloadController.test.ts`).

## Mutation spot-checks (controller + hub suites, 59 tests)

- Remove the cancel in the failed-pause branch: 5 failed (T-C5, T-H3, T-C23).
- Remove the pause join: 1 failed (T-C2, promise identity).
- Remove the latch check in start/resume: 7 failed (T-C14b, T-C21b, T-H11).
- Remove the generation check in the settle step: 4 failed (T-C5, T-C16).

## Decisions / deviations

- The RED file drives #125's API, so it cannot pass after the API change; it
  is deleted in the commit that adds the new-API hub tests (T-H1..T-H6, T-H9,
  T-H9b, T-H11).
- Existing machine tests (T-H10): `__tests__/helpers/hubApi.ts` builds a real
  controller over a scripted stub driver, so those suites keep their
  assertions with mock changes only. Three kinds of assertion edits: restore
  events are preceded by a controller `load()` from a seeded row (what the
  layout does); assertions on effects that now go through the queue wait with
  `until`; D1 and D4 rewrites as the spec lists them (the RETRY test reaches
  `failed` through a pause-failed result; a new D1 test covers a failed
  paused write that does not move the hub).
- The plan's cutoff for "progress since the pause was asked" (F8 re-issue): any
  progress event delivered after `pauseAsync` was called counts.
- `releaseStrictStop()`'s `wasSet` is read at arrival; the result resolves
  through the queue.
- `_layout.tsx` Retry bumps an `attempt` counter that re-runs the load effect;
  the layout never retries on its own (T-S3).
- Not written: T-C12's variant with the real `createModelDownloadStateStore`
  over a fake DB (the openStore fake covers the same controller path);
  T-C13b case 5 (a controller built while backgrounded) is covered by the
  `setApp('background')` cases only; no separate web (D8) test. Mutation
  checks were run for four tests, not every Catches line.
- The `TransferTask` type is structural in the controller, so only the
  service names `DownloadTask` (T-own).
