# Plan: model download controller (transient, deleted at cleanup)

Spec: `spec.md` in this folder (binding). Each task: test first, then code.

1. RED reproductions against #125 (`__tests__/downloadRedReproductions.test.ts`),
   S1 to S5. Commit failing, record output in LEDGER.
2. Test seam: fake native `FileSystemDownloadTask` + real `NetworkTasks.js`
   (`__tests__/helpers/fakeNativeDownload.ts`): drop-pause, drop-cancel, F4
   never-settle, late delivery, iOS release ordering, addListener/release.
3. Service driver: `startDownload`/`resumeDownload` return `{ task, promise,
   kind }`; drop `activeTask`, `pauseDownload`, `cancelActiveDownload`; keep P7.
4. Controller (`src/services/modelDownloadController.ts`), tests T-C1..T-C23
   first: factory, queue, lazy load, row writes (10 s bound, failed-save rule,
   openStore retry), pause procedure (re-issue, foreground-only 30 s watchdog,
   branch on `task.state`), settle/retire generations, latch, gate,
   attach/park/abandon/record/readRow, `cancelTransfer` guard (F11),
   `transferPlatform`, singleton.
5. Hub machine (H1..H15): `pausing`, `REFUSED`, `TRANSFER_STOPPED`, root
   `controllerEvents` invoke, `downloads` in `ModelHubApi`; rewrite the
   machine tests' mocks (D4 rewrites), add T-H1..T-H11 + T-H7 graph test.
6. Provider/layout/screens: `useModelHub`, `_layout.tsx` (load, catch + Retry,
   live/finished restore), `import.tsx`, `download.tsx`, `index.tsx`;
   T-S1..T-S3; update #125 suites' mocks (T-H10).
7. T-own ownership scan; version stays 9.3.0.
8. Replace the RED file with the new-API equivalents (T-H1..T-H5, T-C3, T-C5,
   T-H6), run each T-C test against its mutation where cheap.
9. Finish: spec status `Implemented`, on-device checks unchecked, delete
   plan.md + LEDGER.md, PR body.
