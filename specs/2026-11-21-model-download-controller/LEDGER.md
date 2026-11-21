# LEDGER (transient, deleted at cleanup)

## Notes

- This PR's diff includes #125 (`fix/download-cellular-continuation`) until
  #125 lands on main. Merged with `git merge --no-ff` (f11f9cf); version
  conflicts in package.json, package-lock.json and app.json resolved to 9.3.0.

## Task status

| # | Task | Status |
|---|---|---|
| 1 | RED reproductions | done |
| 2 | Fake native task seam | todo |
| 3 | Service driver | todo |
| 4 | Controller + T-C | todo |
| 5 | Hub machine + T-H | todo |
| 6 | Provider/layout/screens + T-S | todo |
| 7 | T-own | todo |
| 8 | Replace RED file | todo |
| 9 | Finish | todo |

## RED evidence (against #125 baseline, merge f11f9cf)

`npx jest __tests__/downloadRedReproductions.test.ts`: 5 failed, 5 total.

- S1 FAIL: `resumeDownload` never called with P (the pause state was dropped).
- S2 FAIL: machine value is `paused` while `pauseDownload()` is still pending.
- S3 FAIL: `task.cancel` called 0 times after a rejected `pauseAsync`.
- S4 FAIL: machine reaches `failed` ("Could not pause") on a completed task.
- S5 FAIL: two `DownloadTask` constructed for two `startDownload` calls.

## Decisions / deviations

(none yet)
