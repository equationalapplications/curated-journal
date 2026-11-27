# Spec: one model download controller owns every transfer

**Status: Implemented** — 2026-11-21. The owner answered all eight
open questions on 2026-11-21 (see Resolved: owner rulings). The
Sonnet-high review loop finished on round 2 with no MAJOR findings, and
the Opus-high loop converged on 2026-11-21 at round 7. The owner approved
implementation on 2026-11-21. Automated verification passes (type check,
lint, tests). The on-device checks under Verification are the user's to
run and never block anything.
Date: 2026-11-21
Version cost: MINOR (9.2.0 → 9.3.0), JS-only, OTA-safe (Version cost)
Closes: #127, #132
Baseline: PR #125 at head `8f5f484` (lands before this; see Baseline)

How this spec moves (AGENTS.md "Spec workflow", INTENT "How changes are
made", item 1):

- Spec, plan and implementation go in one pull request. The pull
  request opens as a draft carrying this spec only.
- When the owner approves the spec, the status line becomes `Reviewed`.
  Then `plan.md` and `LEDGER.md` are added to this folder, and the
  implementation lands in the same pull request.
- When the implementation is complete and automated verification passes
  (type check, lint, tests), the status line becomes `Implemented`. A
  cleanup commit in the same pull request deletes `plan.md` and
  `LEDGER.md`, and only then does the pull request leave draft.
- On-device checks never hold any of these steps. They are listed,
  unchecked, under Verification.
- The eight questions this spec raised were answered by the owner on
  2026-11-21, accepting every recommendation (Resolved: owner rulings,
  at the end). The body of this spec states those rulings as binding
  requirements.

## Why this cycle exists

Draft PR #117 (privacy modes) went through seven Opus review rounds.
Each round found three or four new MAJOR races in model downloads. The
round-7 majors were: a pause still in flight when the hub returns to a
state at rest; defensive rows that do not cover the states they name; a
failed save that leaves a stale saved row; and a download that
completes during a pause.

The cause is structural. Several independent actors start, pause,
resume and drop downloads, and nothing puts their work in order (see
Survey). Each fix in #117 added another rule about which actor may do
what, in which state, and each rule opened another window. The owner
chose (2026-11-21) to stop patching the privacy spec and give model downloads **one owner**: a model download controller that runs one
operation at a time and is the only code that touches a transfer or
the saved download row.

After this cycle, #117 needs no pause owner of its own. Strict privacy
calls `controller.stopForStrict()` (How #117 shrinks).

## INTENT check

Checked against INTENT.md (static since 2026-11-04) on 2026-11-21. No
requirement here contradicts INTENT on intent. The rules it touches:

- **Rule 9 (data stays in the sandbox; the default mode's traffic is
  model downloads the user starts).** The controller adds no network
  request of any kind. It starts a transfer only when the hub's
  `downloading` state asks it to (I7), and the hub reaches
  `downloading` only from a user action or a continuation of a download
  the user started, behind the network check (P1), or by attaching to a
  transfer that is already running (H9, OQ-1). Pausing, cancelling and
  the pause watchdog (OQ-3) only stop a transfer. Nothing in the
  controller "runs on its own": it reacts to calls and to the native
  transfer settling. Rule 9 is better served than today. Today a
  user-started transfer can keep running unseen behind a Paused screen
  (S4, S5).
- **Rule 11 (strict privacy: no model downloads, no exceptions; nothing
  may act before the mode is honored).** The controller does not build
  strict privacy. It makes it buildable: it is the only code that may
  create a `DownloadTask` (I1, T-own), so #117 has one place to gate (the controller's `gate` input).
  `load()` only reads the saved row and starts nothing, so it cannot
  act before #117's mode load. `stopForStrict()` follows #117's owner
  rulings (a running download pauses at once and keeps what it can;
  the row is saved `paused` before the pause, for the kill window). It
  is defined here so that #117 calls it and does not re-specify it
  (OQ-5).
- **Rule 12 (each step away from strict is an informed choice).**
  Untouched. Nothing is unlocked, and no mode is added.
- **Rule 2 and the out-of-scope item "Silent model installs".** Models
  still enter the device only through the hub's verify, smoke-test and
  commit path, unchanged. Attaching on reopen (OQ-1) continues a
  download the user started. It installs nothing that the user has not
  already chosen.
- **Rule 1 (works with no network).** Untouched. Rule 4 (no background
  maintenance): the smoke test that can follow a completion during a
  background pause (OQ-2) is the install check that already runs today
  when a completion wins that race. It is not a librarian, heal or prune
  pass.
- **Rule 10 (version by OTA compatibility).** JS-only: no native module,
  no config plugin, no `app.json` change beyond the version stamp. The
  one new import, `xstate/graph`, ships inside the already-installed
  `xstate` 5.33.3 and is used by tests only. MINOR (Version cost).
- **"How changes are made", item 1.** One pull request, as above.

## Baseline: what PR #125 does, which this spec keeps

(This PR's branch takes `origin/main` by merge when #125 lands and main
moves. It is never rebased and never force-pushed (the repo rule).)

PR #125 (issue #124; `specs/2026-11-16-download-cellular-continuation/spec.md`;
head `8f5f484`) is the baseline. Every claim about current code in this
spec was read from that head. The controller keeps all of the
following, and #125's tests stay green, with their mocks changed and
their assertions unchanged, except where a row of Deliberate changes
says otherwise.

- **P1 — Every continuation passes the network check.** Restoring a
  `downloading` row, the foreground resume (`paused` + `APP_FOREGROUND`,
  reason `background`), `RESUME`, `RETRY` from `failed` with a pause
  state, and re-picking the model whose pause state is held all set
  `continuation` and go to `confirmingNetwork`. Wi-Fi goes ahead with no
  prompt, cellular goes to `cellularConfirm`, and offline goes to
  `awaitingWifi`.
- **P2 — A declined prompt.** `CELLULAR_CANCEL` on a continuation keeps
  the download paused (reason `restored`) and saves the row `paused`
  with its pause state (none for a download killed in the foreground).
  On a fresh download it goes to `selecting`.
- **P3 — Backgrounding during the check or the prompt** of a
  continuation pauses it (reason `background`). The next foreground
  checks again.
- **P4 — Waiting for Wi-Fi.** `LEAVE_WAITING` goes to `selecting`. It
  keeps the saved row and the pause state ("not now").
- **P5 — An abandoned download's row is cleared**: by `SELECT_MODEL` of
  a different model, by `IMPORT_SMOKE_OK`, and by `import.tsx` before
  the identity commit.
- **P6 — The import keeps a kept partial until it succeeds.** The
  pre-copy sweep keeps the row's model. A successful import clears the
  row, commits, then sweeps with nothing kept. An unreadable row skips
  the sweep.
- **P7 — Android resume sink guard** in `resumeDownload`: the partial
  must exist and be at least the resume offset, or the download starts
  fresh.
- **P8 — The hub's orphan sweep spares a `paused` row's model.** An
  unreadable row skips the sweep.
- **P9 — A running download's row says `downloading` with no pause
  state.** A download killed in the foreground restores with none and
  starts over, behind the check.
- **P10 — Smoke-test ordering** (`specs/2026-11-12-ios-model-memory`,
  B5): the `smoke-testing` marker lands before the load starts. The
  identity is written before the marker clears. A failure records
  `smoke-failed`. A smoke test outlives a closed hub, and the layout
  waits for `smokeTestSettled()`.
- **P11 — Screens.** `CellularConfirm` has one owner, the hub layout.
  `download.tsx` keeps its download framing through the network
  states, and any transition into `selecting` dismisses it to the list.
- **P12 — Failures.** A transfer failure drops the resume data. A
  disk-full failure deletes the partial. `RETRY` goes to `selecting` for
  disk-full, to the check when a pause state is held, and to
  `selecting` otherwise.
- **P13 — A transfer outlives a closed hub.** Closing the hub stops the
  hub machine (`actor.stop()` in `ModelHubProvider`), but the native
  transfer keeps running: in the app process on Android, and in a
  background `URLSession` on iOS.

## Survey: who touches a transfer or the row today

Read at `8f5f484`. Six actors, none ordered against the others:

| # | Actor | Code | What it does |
|---|---|---|---|
| A1 | Hub machine, `downloading` | `runDownload` (`fromCallback`) in `src/machines/modelHubMachine.ts` | Calls `startDownload` or `resumeDownload`, depending on `context.pauseState?.resumeData`. On cleanup it sets `cancelled = true`, which only stops events reaching the machine. The transfer runs on. The state's entry writes the row `downloading` without awaiting the write, and without `.catch`. |
| A2 | Hub machine, `paused` | `pauseTask` (`fromPromise`) | Calls `pauseDownload()`, then writes `paused`. The write is skipped for a `restored` pause, and an idle pause (`idlePause`) writes `paused` without any pause call. The task is stopped whenever the machine leaves `paused`. |
| A3 | Download service | `src/services/modelDownloadService.ts` | Holds one module variable, `activeTask`, which every start or resume overwrites. `pauseDownload()` does `await activeTask.pauseAsync()` and then reads `activeTask.savable()`, reading the variable again after the await. `cancelActiveDownload()` exists, and nothing calls it. |
| A4 | Hub layout and provider | `src/app/model-hub/_layout.tsx`, `src/hooks/useModelHub.tsx` | The layout opens a new store on each hub open, reads the row, and sends `RESTORE_DOWNLOAD`. The provider's `AppState` listener sends `APP_BACKGROUND` and `APP_FOREGROUND`. |
| A5 | Import screen | `src/app/model-hub/import.tsx` | Reads the row (`readDownloadModelId`) and clears it (`clearDownloadState`) directly, outside the machine. |
| A6 | Native callbacks | `expo-file-system` 58.0.13 `DownloadTask` | Settles `downloadAsync()` or `resumeAsync()` whenever the transfer completes, pauses, fails or is cancelled. Nothing orders this against A1–A5. |

#117 adds a seventh: the strict switch in Settings, which runs with the
hub closed.

The races this survey finds, each checked by reading the code at
`8f5f484` (S1–S6). The acceptance tests below reproduce each one.

- **S1 (#127).** `APP_FOREGROUND` while the background `pauseTask` is in
  flight leaves `paused`, which stops `pauseTask` before `onDone` saves
  the new pause state. The context keeps the old one (null for a fresh
  download), and the next transfer starts over from zero. The stopped
  task's promise still runs, so its late `paused` write can land on top
  of the new transfer's `downloading` row.
- **S2 (#127, a second path, not named in the issue).** `RESUME` has the
  same drop: `download.tsx` shows the Resume button as soon as the
  machine is in `paused`, while `pauseTask` is still running. Worse, if
  the network check resolves first, `startDownload` replaces
  `activeTask`, and the old `pauseDownload()` then calls `savable()` on
  the **new**, active task, which throws. The pause's `paused` write
  never happens.
- **S3 (#132).** If `pauseDownload()` rejects while the transfer is
  still active, the machine goes to `failed`, and the transfer keeps
  running behind it.
- **S4 (completion during a pause).** If the transfer completes after
  `pauseAsync()` was asked but before the native pause took effect,
  `pauseAsync()` **resolves**, and the task is `completed` (F2).
  `pauseDownload()` then calls `savable()`, which throws, because it
  allows only `paused`. The hub shows "Could not pause the download.
  Try again." over a complete file, writes `failed`, and its
  `DOWNLOAD_COMPLETE` was dropped when it left `downloading`.
- **S5 (a closed-hub transfer that nothing can reach).** Close the hub
  mid-download (P13), then reopen it while the transfer is still
  running. The restore sees an incomplete file and goes to the network
  check. On Wi-Fi it starts a **second** transfer to the same file. On
  cellular, a decline goes to `paused` with an idle pause, so no pause
  call is made, and the first transfer keeps running behind a Paused
  screen. Picking a different model from there runs the orphan sweep,
  which deletes the partial that the hidden transfer is still writing.
- **S6 (stale and unhandled writes).** The `downloading` and `failed`
  entry writes are fire-and-forget with no `.catch`. A failed write is
  an unhandled rejection, and it leaves the previous row in place,
  which then decides what the next hub open restores.

## Installed-package facts the design rests on

Read from `node_modules/expo-file-system` 58.0.13 (the version
`package-lock.json` pins on `main`): `build/NetworkTasks.js`,
`build/NetworkTasks.types.d.ts`, `ios/FileSystemDownloadTask.swift`, and
`android/src/main/java/expo/modules/filesystem/FileSystemDownloadTask.kt`.

- **F1 — `pause()` throws unless the JS task state is `active`**
  (`assertNetworkTaskState`), so `pauseAsync()` rejects at once on a
  task that has already settled.
- **F2 — `pauseAsync()` can resolve with the task `completed`.** It
  awaits the native pause, then the in-flight operation. If the
  transfer finished first, that operation sets `_state = 'completed'`
  and returns the file, and `pauseAsync()` resolves. `savable()` throws
  unless the state is `paused`. So code must branch on `task.state`
  after the pause settles, never on whether `pauseAsync()` threw.
- **F3 — A pause makes the transfer promise resolve `null`.** A cancel,
  a network failure or an HTTP error rejects it (Android
  `UnableToDownloadException`, iOS `didCompleteWithError`). (#117's R10a
  says "only a cancel rejects". It is a failure too.)
- **F4 — `cancel()` sets the JS state to `cancelled` synchronously,
  but the promise may never settle on Android.** In
  `processDownloadResponse`, the read loop checks `isCancelling` and
  `return`s **without** calling `onComplete`, so
  `suspendCancellableCoroutine` is never resumed when the check wins the
  race against the read that `call.cancel()` interrupts. Code must
  treat `cancel()` as immediate and must not await the transfer's
  promise afterwards.
- **F5 — iOS pause.** `cancelByProducingResumeData` may give no resume
  data. Then the task is `paused` with no `resumeData`, and
  `normalizePauseState` makes that a null pause state.
- **F6 — Android resume.** The resume data is the partial's length on
  disk. Resuming does `RandomAccessFile.setLength(offset)` (P7 guards a
  missing or short partial), and a fresh start truncates the file
  (`FileOutputStream(destination, false)`).
- **F7 — The default session is `background` on iOS** (`sessionType`
  is not set today). Android ignores the option.
- **F8 — A pause can be lost (the lost-pause race).** On Android,
  `pause` is a synchronous `Function` while `start` and `resume` are
  coroutines (`FileSystemModule.kt`), and `FileSystemDownloadTask.kt`
  resets `isPausing = false` and `isCancelling = false` when the start
  or resume coroutine begins. On iOS, `FileSystemDownloadTask.swift`
  resets `isPausing = false` on the main queue after an async pause may
  already have returned. A `pause()` issued right after `downloadAsync()`
  or `resumeAsync()` can therefore be erased, and `pauseAsync()` then
  waits for the whole transfer. The queue makes this reachable:
  `start()` returns as soon as the task exists.
- **F9 — The JS state turns `paused` late.** `_runDownloadOperation`
  sets `_state = 'paused'` only after the native result has reached JS
  (and after awaiting `_pauseRequest`). While the app is suspended, a
  native pause that succeeded can still be queued, and the task still
  reads `active`. So `task.state === 'active'` after a timeout does not
  prove that the pause failed.
- **F10 — `cancel()` after a pause that failed.** On iOS the resume data
  of a cancelled task refers to a temp file that the cancel consumed, so
  keeping the old pause state (below) can make the next resume fail as a
  network failure and start from zero. This is accepted: it is the same
  outcome as a kill in the foreground (P9). On Android the native writer
  can still be inside one `output.write` for a few milliseconds after
  `cancel()`, so a restart to the same file could overlap it for that
  long. This is accepted too: a fresh start truncates the file (F6).
- **F11 — A cancel can be lost (the lost-cancel race, the twin of F8),
  and the JS `cancel()` cannot be repeated.** `start` and `resume` are
  coroutines on Android and main-queue functions on iOS, while `cancel`
  is a plain synchronous `Function` on both (`FileSystemModule.kt`
  `Function("cancel")`; `FileSystemModule.swift:583-586` for the
  main-queue start, `:601-603` for the cancel). On Android the start and
  resume coroutines reset `isCancelling = false` when they begin
  (`FileSystemDownloadTask.kt:65-66`, `:98-99`), and `call` is assigned
  only inside `downloadToFile` (`:154`), so a `cancel()` (`:123-127`)
  that runs before the coroutine begins is erased. On iOS `cancel()`
  with `downloadTask == nil` does nothing
  (`FileSystemDownloadTask.swift:319-323`), and the queued `start` then
  creates the task (`:277-281`). `NetworkTasks.js` has already set
  `_state = 'cancelled'` (`:323`), and a transfer that finishes
  afterwards sets `completed` over it (`:383-384`). The result is a
  hidden transfer: nothing tracks it, it keeps writing the file, and on
  iOS it survives an app kill (F7). Two more facts decide the fix:
  - **A second `task.cancel()` does nothing.** Its first line returns
    when the state is already `cancelled` (`NetworkTasks.js:318-322`),
    so "cancel again" never reaches the native task.
  - **`task.release()` does reach it.** It calls the native `release()`
    (`NetworkTasks.js:308-310`), which runs `sharedObjectDidRelease` on
    Android (`call?.cancel()`, `FileSystemDownloadTask.kt:129-131`) and
    `sharedObjectWillRelease` on iOS, which cancels `downloadTask` on
    the main queue (`FileSystemDownloadTask.swift:331-338`). On iOS that
    main-queue block runs after the queued `start`, so it finds the
    task (but see the residual window below). This ordering was verified in the installed package: `start`
    is an `AsyncFunction(...).runOnQueue(.main)`
    (`FileSystemModule.swift:583-586`) and is enqueued when
    `downloadAsync()` calls it, so the block that `release()` enqueues on
    the same serial main queue afterwards cannot run before it, and
    `NetworkTasks.js` `release()` (`:308-310`) does nothing in JS first.
    So on iOS `release()` may be called at once after `cancel()`. One
    residual window remains: the synchronous `Function("cancel")` runs on
    the JS thread, reads `downloadTask` (nil) and its cleanup writes nil
    (`FileSystemDownloadTask.swift:319-323`, `:341-347`), while the
    main-queue start writes `downloadTask = task` (`:278`). If that write
    lands between them, the release block finds nil, the native object
    deallocates (the delegate reference is weak), and no progress event
    reveals it. On Android `release()` issued at once has the same race as
    `cancel()` (`call` is still null), so it is useful only once the
    transfer has begun, which is when a progress event exists.
  - **A listener added with `task.addListener('progress', …)` survives
    `cancel()`.** `cancel()` removes only `this._subscription`, the
    `onProgress` option's subscription (`NetworkTasks.js:326`, built at
    `:381` by `wireNetworkTaskProgress`), and the `finally` block does
    the same (`:404`). A separate `addListener` subscription is not
    touched. Progress events are emitted only from inside a running
    transfer (`emitProgress` in the Android read loop, `didWriteData` on
    iOS), so a progress event on a cancelled generation suggests that its
    cancel was lost. It does not prove it: an event emitted before the
    cancel can be delivered after it (a false positive, which is
    harmless, because `release()` on a transfer that was cancelled does
    nothing more).
  - **After `release()`** (verified in the installed package): the JS
    `_state` is untouched; `pause()` and `pauseAsync()` throw on their
    state check (`NetworkTasks.js:249`); `cancel()` returns early
    (`:318-322`); `subscription.remove()` is a safe no-op
    (`expo-modules-core` 58.0.28 `common/cpp/EventEmitter.cpp:149-160`, `:189-209`); release drops all
    listeners; Android events emitted after release are dropped
    (`expo-modules-core` 58.0.28, `android/src/main/java/expo/modules/kotlin/sharedobjects/`:
    `remove()` resets `sharedObjectId` (`SharedObjectRegistry.kt:101-108`);
    `toJavaScriptObjectOrNull` then returns null (`:130-134`);
    `SharedObject.kt:66-67`, `getJavaScriptObject() ?: return`).
  - **Promise settlement after a cancel.** On iOS the promise rejects
    with `DownloadCancelledException` through the delegate
    (`FileSystemDownloadTask.swift:429-452`), or resolves if the transfer
    had finished. On Android a lost cancel followed by `release()`
    rejects with `UnableToDownloadException`, not
    `DownloadCancelledException` (`FileSystemDownloadTask.kt:157-178`),
    and an effective cancel may never settle (F4).

## Design: the controller

### Ownership

A new module, `src/services/modelDownloadController.ts`, is a
process-wide singleton (`getModelDownloadController()`). It is plain
TypeScript, not an XState actor, so nothing that stops the hub stops it
(AGENTS.md: `actor.stop()` never runs exit actions). It owns:

- the one live transfer, if any: its `DownloadTask`, model id,
  generation id and last progress;
- the record of the current download: model id, phase and pause state;
- the saved download row. The controller creates the only
  `createModelDownloadStateStore` instance that is live; a dropped one is never used. The database is opened
  lazily, as part of the first store call (see The open and the
  schema step belong to the first store call), and every row write in the app goes through it (I4).

Nothing else may import `DownloadTask`, the service's transfer
functions or the store factory (T-own). The download service keeps its
file logic (start, resume with the P7 guard, verify, delete partial),
but it no longer holds `activeTask`. Its start and resume hand the
task and its promise to the controller. `pauseDownload` and
`cancelActiveDownload` are removed.

### The record

```ts
type Phase = 'none' | 'active' | 'paused' | 'completed' | 'failed';

type ControllerSnapshot = {
  modelId: CuratedModelId | null;
  phase: Phase;
  pauseState: DownloadPauseStateRecord | null; // the controller's copy is the truth
  progress: { bytesWritten: number; totalBytes: number };
  row: { modelId: string | null; status: ModelDownloadStatus } | null; // the row as last asked for
  rowSaved: boolean; // false while that row has not landed
  error: { code: string; message: string } | null; // set in phase `failed`, else null
  stoppedForStrict: boolean; // a latch, see below
};
```

`stoppedForStrict` is a **latch**. Every `stopForStrict()` sets it,
whatever it found (a live transfer, a held record, or nothing running):
from that moment no transfer may be created in this process until the
latch is released.

- **While it is set, `start()` and `resume()` return `refused`** with
  reason `stopped-for-strict`. The check runs before the `gate` and
  before any write or state change (the T-C21 contract), so a refusal
  leaves the record and the row as they were.
- **Only one operation clears it.** The new `releaseStrictStop()` clears
  it and writes nothing. `abandon()`, `start()`, `resume()`, `park()`,
  `pause()` and `record()` never clear it. In particular the hub's
  `failed` entry (`record(failed)`, H6), a `park()`, and the `abandon()`
  of #117's Turn on and remove (R10g) must not release it.
- **Both latch changes act on arrival.** `stopForStrict()` sets the latch
  and `releaseStrictStop()` clears it at the moment of the call,
  synchronously, before any queued operation runs. The rest of each
  operation, and its result, goes through the queue, except as I3 says
  (a `stopForStrict()` before any successful load is decided entirely on
  arrival). So the latch follows call order: a `stopForStrict()` that arrives
  while an earlier `releaseStrictStop()` is still queued leaves the latch
  set, because the release already took effect when it arrived, and a
  `start()` or `resume()` that is queued ahead of a `stopForStrict()`
  and has not begun is refused when it runs. "Has not begun" means has
  not passed its latch check: a `start()` still awaiting its internal
  `load()` is refused, while one past the check (awaiting an async `gate`
  or its own `downloading` write) goes on, creates its task, and the
  queued strict stop then pauses it (I9).
- **It lives in process memory, on the record.** It is independent of
  `load()` (a strict stop before the first load sets it, and a later
  `load()` does not clear it). It survives a hub that closes. It is not
  saved in the row, and a new process starts with it clear: across a
  restart #117's own mode gate is the guard. The layout's restore never
  reads it. Only #117 consumes it, through `releaseStrictStop()` (How
  #117 shrinks).
- Nothing in this PR calls `stopForStrict()`, so until #117 the latch is
  never set and every operation behaves as if it did not exist.

`toRestoreState` takes `{ modelId, status, pauseState }`; the layout
composes it from `snapshot.row` and `snapshot.pauseState`, because the
row in the snapshot omits the pause state.

- `active`: a transfer is in flight. This is the only phase that holds
  one.
- `paused`: no transfer. The pause state, if any, is held.
- `completed` and `failed`: the last transfer ended, and no
  `record()`, `abandon()` or new start has followed yet.
- `none`: no transfer, and no outcome is waiting to be reported. The
  model id and pause state can still be held, for example from a
  loaded row.

### The queue

- **One operation at a time.** Every public operation except
  `snapshot()` and `subscribe()` is put on one FIFO queue. An
  operation's effects (transfer changes, row writes, emitted events)
  are complete before the next operation starts (I3). The exceptions
  are the two latch changes, which act on arrival (see the latch), and a
  `stopForStrict()` that arrives before any successful load, which is
  decided entirely on arrival (see Lazy load and I3).
- **Joins.** A `pause()` for a transfer while a pause of that same
  transfer is queued or running returns the same promise. Promise
  identity (T-C2) holds only pause-to-pause. A `pause()` that joins a
  running `stopForStrict()` is a different call shape and returns its
  own promise, carrying the **pause-shaped result** of that procedure
  (`paused`, `completed`, `failed` or `pause-failed`), never `kept` or
  `not-keepable`, so the hub's `pausing` `onDone` always has a case for
  it (H3). A `stopForStrict()` that arrives while a `pause()` of the record's
  model is **queued or running** (the transfer may not exist yet) joins
  it, and returns its own result shape from the same outcome (a pause on
  phase `none` writes `paused`, so the joined result is `kept`; a joined
  pause that rejects runs the strict stop in the pause's queue turn, before any later operation) (the rules are under "A strict stop and a
  hub pause that cross"). A `start()` or `resume()` for the model whose
  transfer is live attaches to it and never creates a second task.
- **Lazy load.** Every operation, including `start()`, `resume()`,
  `attach()` and `readRow()`, first awaits an internal `load()`, with two
  exceptions. `releaseStrictStop()` never loads: it touches only the
  latch. `stopForStrict()` before any successful load does not wait for
  one and does not read the row. It is decided entirely on arrival: the
  latch is set and it returns `nothing-running` at once, with no event (no transfer can exist before the first successful load, because
  only `start()` and `resume()` create one, and both load first), with
  `rowSaved: true` because it made no write. `snapshot()` before the
  first load returns phase `none`, no model and `row: null`. **A failed
  first read leaves the controller unloaded.** The operation that
  triggered it rejects with the store's error, and the next operation
  retries the load. Nothing is cached from a failed read. **That
  includes a failed open or schema step** (see Row writes and the
  failed-save rule).
- **No re-entry.** An operation never awaits another queued operation.
  Listeners are called inside the operation that emits, after its
  state change. Anything a listener queues runs after that operation.
- **Native settlement is queued too.** When a transfer's promise
  settles on its own, the controller queues a `settle` step for that
  generation. A step whose generation is not the live one is dropped.
  So a completion, a failure and a user pause can arrive in any order,
  and each is handled whole. The step for a resolved file sets the
  phase to `completed`, **clears the held pause state**, and emits
  `completed`. The step for a rejection sets `failed`, drops the pause
  state, stores `{ code, message }` in `error` and emits `failed`. A
  `null` result the controller did not ask for (no pause in progress)
  is handled as the `paused` branch of the pause procedure, and it emits
  `stopped` with reason `unrequested` so a hub in `downloading` is never
  left waiting (I2). If the task is not `paused` when that null arrives,
  or its `savable()` throws, the transfer is cancelled and the outcome is
  still a paused record with the kept pause state: the row is saved
  `paused`, the phase is `paused`, and `stopped` (`unrequested`) carries
  the kept pause state, so row, phase and event agree. A `completed` or
  `error` task emits `completed` or `failed`. A `stopped` event carries the model id, the held
  pause state (normalized, possibly null) and a `reason`: `strict` (from
  `stopForStrict()`) or `unrequested` (the controller did not ask).
- **Settlement bookkeeping.** The controller attaches
  `.then(settle, settle)` to the transfer's promise synchronously when
  the task is created, so a rejection is never unhandled (a cancelled
  promise rejects on iOS and may never settle on Android, F4). Every
  terminal branch of the pause procedure, `abandon()` and every
  settlement **retires the generation**, so a later settle of the same
  promise is dropped (I8) and can neither re-run as an unasked `null`
  nor report a second `completed`.
- **Every cancel is guarded against a lost cancel (F11).** The controller
  cancels a transfer in exactly three places: the pause procedure's
  `pause-failed` branch, its step 4, and `abandon()`. All three call one
  internal `cancelTransfer(task)`. If the task was `active`, so that
  `task.cancel()` changed its state, `cancelTransfer` also guards the
  **retired generation**, in the same synchronous step, and the guard
  depends on the driver's `platform`:
  - **iOS: release at once.** `cancelTransfer` calls `task.release()`
    (wrapped, because a released object throws on later native calls)
    straight after `task.cancel()`. The native release block runs on the
    main queue after the queued `start` (F11), so it finds the task,
    except in the few-instruction data race of F11. No listener is added. `task.cancel()` is
    not called again, because it is a no-op once the state is `cancelled`.
  - **Android: release on the first progress event.** `release()` at
    once has the same race as `cancel()`, so `cancelTransfer` adds one
    listener with `task.addListener('progress', …)` to the retired
    generation. The first progress event that listener sees suggests that
    the native transfer is running although it was cancelled (F11: an
    event emitted before the cancel can also arrive after it, a harmless
    false positive). The listener then calls `task.release()` (wrapped),
    removes itself (also wrapped), and logs the lost cancel. The
    listener is also removed in the retired promise's `.then` handler
    itself, before its generation check drops the step (the settle step of a retired generation is dropped, so it
    cannot do it). On Android
    that promise may never settle (F4), so one unused listener on a dead
    task can remain, which is accepted.

  A generation that was never `active` gets no guard. The guard adds no
  request and starts nothing: it only stops. **Its bound.** On iOS the
  extra work is one main-queue turn, into URLSession's temporary file. On Android it
  lasts from the cancel until the lost transfer's first progress event has
  made its round trip (native emit, JS listener, `release()`, native
  cancel). That is normally tens of milliseconds, but it has **no hard
  bound**: a blocked JS thread delays it, and so does a frozen or cached Android process that
  keeps its native call alive. It is harmless: the same
  URL, the same bytes at the same offsets, and the sweeps remove the file.
  What the guard does not catch is a hidden transfer that ends before its
  first progress event (a transfer that fails before its first byte, or
  with a zero-byte body: the first progress event is not throttled, and
  Android forces a final one on completion). It leaves its file for the
  sweeps. It also does not catch the few-instruction iOS data race
  above (F11); there the bytes go to URLSession's temporary file and
  reach the destination only on completion. The guard is the controller's, not the driver's: the driver
  returns the `DownloadTask` precisely so the controller can do this
  (T-C23).
- **Progress is not queued.** It is passed to subscribers straight away,
  only for the live generation while the phase is `active`.

### The pause procedure

`pause()` and `stopForStrict()` share this procedure when a transfer is
`active`. A strict stop runs it with one addition ahead of step 1: the
kill-window write (`paused`, no pause state), skipped when the procedure
has already begun step 1 (a joined `pause()`, see "A strict stop and a
hub pause that cross"):

0. If the task is not `active` when the procedure starts (it settled
   between the queue check and now), skip step 1 and go to step 2 with
   no `pauseAsync` call. `pauseAsync()` on a settled task throws at once
   (F1).
1. Ask for the pause (`task.pauseAsync()`) and wait for it to settle,
   fulfilled or rejected. Two timers bound the wait, and both count
   **foreground time only** (the driver's `onAppState` input: a timer is
   suspended while the app is in the background and re-armed with its
   full window when the app becomes active, F9). The clock comes from
   the driver's `onAppState(listener)`: it delivers the current state
   (`AppState.currentState`) to the listener when it subscribes, and on
   every change. **`inactive` counts as foreground**: the iOS app
   switcher and the notification shade are transient, and the provider
   sends only `background` and `active` to the hub (`useModelHub.tsx`),
   so the controller sees `background` only when the app is truly
   backgrounded. A pause that starts because of `APP_BACKGROUND` begins
   while backgrounded, so its timers start suspended and are armed with
   the full window at the next foreground:
   - **The re-issue (F8).** If `pauseAsync` has not settled about 1 s
     after the pause was asked, **and a progress event has arrived since
     the pause was asked** (the transfer is demonstrably still
     running, so the first pause was lost), the controller calls
     `task.pause()` once more, if the task is still `active`. The call
     is wrapped, because it throws once the task is no longer `active`
     (F1). With no progress event since the ask, it does not re-issue
     and waits for the watchdog. A re-issue is **not** harmless when the
     first pause is effective: every `pause()` in `NetworkTasks.js`
     replaces `_pauseRequest` and overwrites `_resumeData`, and
     `pauseAsync()` awaits the latest request. On iOS a second
     `cancelByProducingResumeData` on a task that is already cancelled
     yields no data (wiping the resume data) or never settles. The cutoff
     is a 500 ms foreground grace: a progress event delivered in the
     first 500 ms after the ask may have been emitted before it and is
     stale, so only progress delivered between 500 ms and 1 s counts. The grace
     re-runs after every foreground return (both timers re-arm with their
     full windows), so progress delivered before a return never counts
     toward the re-issue that follows it. The
     re-issue is one-shot (it never fires twice for one pause, whatever
     the app does in between). A silent transfer is never re-issued.
   - **The watchdog (OQ-3).** 30 s.
2. Branch on `task.state`, never on whether the call threw (F2). When the
   watchdog fires, **re-read `task.state` first and run this same
   branch**:
   - `paused`: the pause state is `normalizePauseState(task.savable())`.
     Write the row `paused` with it, and set the phase to `paused`.
     Result: `paused`. A watchdog that fires on a task that is already
     `paused` takes this branch, and **a paused task is never
     cancelled.**
   - `completed`: the download finished during the pause. The phase
     becomes `completed`, the held pause state is cleared, and nothing
     is written (the row stays `downloading`, as it does today after a
     completion). Result: `completed`.
   - `error`: the transfer failed during the pause. The phase becomes
     `failed`, and the pause state is dropped (P12). Result: `failed`,
     with the classified code and message.
   - `active` and the pause failed (`pauseAsync` rejected), or the
     watchdog fired with the task still `active` (the native result has
     not reached JS): `task.cancel()`. The transfer is treated as ended
     at once, and its promise is not awaited (F4). The phase becomes
     `failed`. The pause state the transfer started from is kept, as
     `failed` keeps it today (F10 notes the iOS caveat). Result:
     `pause-failed` (#132).
   - `cancelled` (something else cancelled it): the phase becomes
     `failed`, with `pause-failed`.
3. `savable()` is called only when `task.state === 'paused'` (I5).
4. Any exception thrown inside the procedure (an invariant error)
   **cancels the transfer** and ends as `pause-failed`. The procedure
   never exits with a transfer still live (I2).
5. Every branch retires the generation (see Settlement bookkeeping).

**Events per outcome.** Subscribers are called inside the operation,
after its state change, and each outcome emits exactly one event:

| Outcome | Result of `pause()` | Result of `stopForStrict()` | Event emitted |
|---|---|---|---|
| paused with a pause state | `paused` | `kept` | `stopped` (reason `strict`) for a strict stop, none for a plain `pause()` |
| paused, no resume data (F5) | `paused` (pause state null) | `not-keepable` (`no-resume-data`) | `stopped` (reason `strict`) for a strict stop, none for a plain `pause()` |
| completed during the pause | `completed` | `completed` | `completed`, **for a strict stop that ran the procedure only**; none for a plain `pause()`, and none when the strict stop only reports a held `completed` record (its settlement already emitted) |
| error during the pause | `failed` | `not-keepable` (`failed`) | `failed`, **for a strict stop that ran the procedure only**; none for a plain `pause()`, and none when the strict stop only reports a held `failed` record |
| pause failed or timed out, cancelled | `pause-failed` | `not-keepable` (`pause-failed`) | `stopped` (reason `strict`) for a strict stop, none for a plain `pause()` (the caller has the result) |
| unrequested `null` (no pause asked) | n/a (a settle step) | n/a | `stopped`, reason `unrequested` |

A plain `pause()` emits no event for its own outcome: its caller has
the result, and the hub is in `pausing` while it waits. Events matter to
a hub in `downloading` that did not ask.

**A strict stop that finds a held record** (it ran no procedure) reports
from the record and emits as follows:

- Held `paused`: `kept`, with the held pause state, **null included**.
  `not-keepable` with `no-resume-data` is returned only when the
  procedure ran in this call (or in the pause it joined) and found no
  resume data (F5). A held `paused` record with a null pause state (a
  download killed in the foreground whose continuation was declined, an
  H4 idle pause) is `kept` with null, so #117's R8 pre-check, which never
  warns about a paused row, stays consistent. Emits `stopped` (reason
  `strict`).
- Held `completed` or `failed`: reports it and emits nothing (its
  settlement already emitted).
- Phase `none` with a model id held (for example a restored
  `downloading` row sitting in a hub's `cellularConfirm`): result
  `nothing-running`, and it emits `stopped` (reason `strict`, with the held
  pause state) so that such a hub goes to `paused` (H15) and does not keep
  its prompt. With no model id held, nothing is emitted.

**A strict stop and a hub pause that cross.** Two terms. The `strict`
field of a `pause()` result is the value of the `stoppedForStrict` latch
**at the moment that result is computed**. A `pause()` has "run first"
only when it has **already returned**. Two orders:

- **The strict stop arrives while the hub's `pause()` is queued or
  running (a join).** The latch is set when the strict stop arrives,
  before either result is computed. The pause procedure runs once. It
  writes the kill-window row (`paused`, no pause state) **only if it has
  not yet reached step 1** (no `pauseAsync` asked): a pause that is
  already asking cannot be preceded by a write, and its own `paused`
  write at step 2 is the save (the row says `downloading` for at most
  the pause's own bounded wait, and across a kill the next process's
  mode gate is the guard). The `pause()` result carries `strict: true`
  and the hub maps it to `pausedReason: 'strict'` (H3). The
  `stopForStrict()` result is derived from the same outcome, and
  `stopped` (reason `strict`) is emitted **once**, inside the operation,
  before the `pause()` promise resolves, so a hub in `pausing` sees it
  first (H3) and then the `onDone`. Two joins have no procedure to
  share. A joined pause on phase `none` runs none: it writes `paused`
  and leaves the phase `paused`, and the stop reports `kept` with that
  write's `rowSaved`. A joined pause that rejects (for example a
  `WrongModelError`) hands its error to the `pause()` caller as usual,
  while the strict stop runs in that same queue turn and emits exactly
  one `stopped`.
- **The hub's `pause()` ran first.** `stopForStrict()` then finds a
  paused (or ended) transfer, reports from the held record (`kept` or
  `not-keepable`, `completed` or `failed` as held, `nothing-running` only
  when the record is phase `none`), and sets the latch. The `pause()`
  result was computed before, so it said `strict: false`. The strict
  stop emits `stopped` (reason `strict`, with the held pause state). It
  runs as the next queued operation, after an internal `load()`. In
  practice the hub's `onDone` has already been delivered, but the spec
  does not rely on it (that depends on microtask order, H3): an event
  that does reach a hub still in `pausing` is handled by H3, and the hub
  ends `paused` with reason `strict` in either order. It reaches the hub
  in one of these states:
  - `paused` (the common case, no `resumeOnSettle`): relabelled `strict`
    (H5).
  - `confirmingNetwork`, `cellularConfirm` or `awaitingWifi` (the pause
    settled with `resumeOnSettle` set, so the hub moved on to a
    continuation): it goes to `paused` with reason `strict`, and the
    controller is not called (H15). No cellular prompt is shown under a
    strict stop.
  - `downloading` (the network check passed before the strict stop
    arrived, so the hub's `resume()` is queued, ahead of the strict stop
    or behind it). The latch is set on arrival, so a `resume()` that has
    not begun returns `refused` in either order, and one that had already
    begun creates a task that the strict stop then pauses like any live
    transfer. When the strict stop runs first, `stopped` takes the hub to
    `paused` (H13) and the queued `resume()` then returns `refused`. The
    hub has already left `downloading`, so `runDownload` is gone and the
    result is dropped. A `refused` that does reach a hub in `downloading` (a
    latch set earlier, or #117's gate) is mapped by H1: `pausing` with
    reason `strict`, where `pause()` is a no-op on a held `paused` record
    and writes `paused` on phase `none`. Either way the controller never
    creates a task behind a strict stop.

**The strict guarantee is the controller's own.** After any
`stopForStrict()` returns, `start()` and `resume()` refuse until
`releaseStrictStop()`, so no `APP_FOREGROUND`
continuation, no queued `resume()` and no race with a `park()` or a
`record(failed)` can create a transfer (#117 R10d). #117's mode gate (the
`gate` input, under Construction) is therefore not the only guard
against the late strict stop. It is still needed for what the latch does
not cover: a process restart (the latch is not saved), and every
`start()` after `releaseStrictStop()`. #117 releases the latch when the
strict session ends or never starts: after its own mode is strict (the
gate takes over), and on every other exit of R8, including R10g's Cancel,
where the user chose Standard and the release comes before the download
call (How #117 shrinks).

### Row writes and the failed-save rule

- Every write sets the whole row (the store's upsert). Writing the same
  row twice is harmless, so a write can always be retried.
- Every write is awaited inside the operation that makes it. The store
  keeps its own write queue as a second guard.
- **The open and the schema step belong to the first store call, and a
  failure of either is never cached.** The singleton getter passes
  `openStore: () => Promise<Store>` (it calls
  `SQLite.openDatabaseAsync('curated_journal.db')` and
  `createModelDownloadStateStore(db)`) instead of a ready store; tests
  may still pass a ready `store`. The controller creates the store
  promise on the first load. The open, the schema creation inside the
  store's `ensureSchema()` and the first read all run inside the one
  10 s bound below. **If any load before the first successful one fails or times out, the
  controller drops its store promise and leaves the handle open. A close
  would be ref-counted and drop only this handle's reference, but
  leaving it open matches today's layout, costs O(1) per failed load
  (below), and removes a close path that a double close could turn into
  releasing the wiki's reference. The next load calls `openStore()` again and gets a
  fresh handle (on native, a new reference to the shared connection) and
  a fresh store.** Each failed pre-success load leaks one handle
  reference; on web it also leaks one worker map entry, and a hung call
  keeps its pending entry. `openStore()` is called only by loads before
  the first success. Those loads are user-paced (a layout mount or a
  Retry tap, never an automatic retry loop), and it stops for good
  after the first success. Today's layout leaks one handle on every hub
  open, so this is no worse (T-S3 asserts the layout never retries on
  its own). Reopening recovers a rejected open or schema step and a
  single call whose reply never comes; a wedged connection or worker is
  bounded by the 10 s timer, not cleared. A late resolve of the dropped open is
  discarded. A late reject is caught with a no-op handler, so React
  Native logs no unhandled rejection. Why this mechanism and
  not "`ensureSchema` resets `ready` on rejection": `ensureSchema()`
  caches its promise (`if (!ready) ready = db.execAsync(SCHEMA)...`), and
  a hung `execAsync`, or a hung web `openDatabaseAsync` (a worker round
  trip in `expo-sqlite/web/SQLiteModule.ts` that may never answer),
  never rejects, so a reset-on-rejection fix cannot unstick it. Today's
  `_layout.tsx` opens a new DB and store on every hub open, which is why
  closing and reopening the hub recovers today; the singleton must give that property back.
  `modelDownloadState.ts` is therefore **not changed**.
- **Every store call is bounded at 10 s** (`timers` input). A call that
  has not settled by then counts as failed: a write is `rowSaved:
  false`, and the first read of `load()` rejects as a failed read does
  (the layout catches it and shows an error with a Retry button, see
  Screens). A hung SQLite (the database is
  shared with the wiki engine) therefore cannot block the queue for
  longer than the bound per call. The bound is **per operation**, because
  every operation's internal `load()` first retries a pending write (10 s)
  before it does its own work. In the worst case a `pause()` takes that
  retry (10 s), the 30 s watchdog and its `paused` write (10 s): 50 s. A
  `stopForStrict()` takes the retry (10 s), the kill-window write (10 s),
  the watchdog (30 s) and the `paused` write (10 s): 60 s. The layout's
  `load()` queued behind either one adds its own retry (10 s) and read
  (10 s): about 70 s behind a `pause()`, 80 s behind a `stopForStrict()`.
  Those figures count foreground time only and exclude any time the app
  spends in the background. The layout shows its spinner for that long at
  most. The `pausing` screen still has no buttons (OQ-6, owner-ruled).
  These bounds guarantee that it exits.
- **When a write fails**, the operation does not fail. Its result
  carries `rowSaved: false`. The controller keeps the row it asked for,
  and writes it again before the next operation's own write and on the
  next `load()`. A newer row that lands replaces it. The in-memory
  record stays the truth for the rest of the process. Hub transitions
  never depend on `rowSaved`, with one carve-out: the `smoke-testing`
  marker (P10, H11), where a marker that did not land aborts the smoke
  test as today. Other callers that need to know, such as the import's
  `rowCleared`, read it (D1, OQ-4).
- **A stale row is always safe.** A kill before the retry lands leaves
  the previous row. The possible stale rows:

  | Truth | Stale row left | What the next hub open does | Safe because |
  |---|---|---|---|
  | `paused` (pause state P) | `downloading` | continues behind the check (P1, P9), from zero | starts over. Android truncates (F6), and there is no zero-fill. |
  | `failed` | `downloading` or `paused` | continues behind the check, or waits paused | the user started this download, and every continuation asks first on cellular |
  | cleared (abandoned) | `paused` for the old model | shows it paused | Resume runs P7. The orphan sweep may already have removed the partial, and then it starts fresh. |
  | cleared (abandoned) | `downloading` for the old model | continues behind the check | the same consent as a continuation. The import path (P5, P6) reads `rowSaved` and keeps its own guard. |
  | `downloading` (a new transfer) | `paused` or idle | waits paused, or nothing | Resume runs P7, so an offset past the new partial starts fresh |

### Public API

The plan may rename these, but it may not change what each one
guarantees.

| Operation | Precondition | Effect | Guaranteed when it returns |
|---|---|---|---|
| `load(): Promise<ControllerSnapshot>` | none | Also awaited internally by every other operation (Lazy load). The first call in a process reads the row: `downloading` becomes phase `none` with its pause state (null, P9); `paused` becomes `paused`; any other status becomes `none` with that row. A `failed` row holds its pause state (`RETRY` implies it, P1, P12). Later calls reuse the in-memory record. Each call writes any pending row again. | The snapshot is the truth for this process. No transfer was started. It rejects only when the first read fails, as `store.get()` does today, and then the controller stays unloaded: the next operation retries the load. |
| `snapshot(): ControllerSnapshot` | none | sync read | — |
| `subscribe(listener) → unsubscribe` | none | Events: `progress`, `completed`, `failed`, `stopped` (reason `strict` or `unrequested`). Each carries the model id, and `stopped` also carries the held pause state. | — |
| `readRow(): Promise<Row \| null>` | none | Queued read of the row as last asked for. It replaces `readDownloadModelId` and the sweep's `store.get()`. | It reflects every earlier operation. It rejects only when the row was never loaded and the read fails. |
| `start(modelId)` | No live transfer for another model (else it rejects with `TransferInFlightError`). A record for another model with no live transfer is replaced. | First, **if `stoppedForStrict` is set, return `refused` (reason `stopped-for-strict`)**, then the optional `gate` (Construction): a refusal from either returns `refused` and changes nothing. Then, live for this model: attach. Phase `completed` for this model: report it. Otherwise: drop any held pause state, write `downloading` (pause state null), and create a fresh task. `start()` never clears `stoppedForStrict`. If the driver throws before a task exists, the phase becomes `failed` with the classified `error`. | `started` (a task exists and is `active`), `attached`, `completed`, `failed` (the start threw) or `refused`. `rowSaved` says whether the write landed. |
| `resume(modelId)` | as `start` | Like `start` (the latch check and then the gate run first), but it resumes from the held pause state when that has resume data (the P7 guard stays in the service), and otherwise starts fresh. The result's `kind` says which one happened. | `resumed`, `started`, `attached`, `completed`, `failed` or `refused` |
| `attach(modelId)` | none | **Attach only: it never creates a task and never writes the row, and it is not gated** (it starts nothing). Phase `active` for this model: attach. Phase `completed` or `failed` for this model: report it. Anything else (phase `none` or `paused`, or another model): `not-live`. | `attached`, `completed`, `failed` (with `{ code, message }`) or `not-live`, each carrying the snapshot. `not-live` means the caller restores normally (a continuation behind the network check, P1). |
| `pause(modelId)` | The record is for this model or for none. A record for another model with a live transfer rejects with `TransferInFlightError`; a record for another model with no live transfer rejects with `WrongModelError`. | `active`: the pause procedure. `paused`: no-op. `completed` or `failed`: reports it. `none`: **writes the row `paused`** with the held pause state (P2, P3), **sets the phase to `paused`** (as `load()` does for a `paused` row, so a later `stopForStrict()` finds a held `paused` record and not `nothing-running`, and the hub's H5 relabel applies) and starts nothing. The result's `strict` is the latch as it stands when the result is computed. It is not gated and never refuses on the latch. | **No transfer is in flight.** `paused` (pause state, `rowSaved`), `completed`, `failed` or `pause-failed` |
| `park(modelId)` | No live transfer (else it rejects with `TransferInFlightError`) | Saves the row `downloading` with **no pause state** and starts no transfer: the record becomes phase `none` for this model with a null pause state. It does **not** clear `stoppedForStrict`. It is not the pause-on-`none` case above (that writes `paused`). It is the row #117's R10g needs while a continuation waits on the network. | The write was awaited. `rowSaved` says whether it landed. |
| `abandon()` | none | Cancels a live transfer (F4: no await, with the lost-cancel guard of F11), clears the row and forgets the record. It does **not** touch `stoppedForStrict`: only `releaseStrictStop()` clears it. It deletes no file: the sweeps do that, as today (P5, P6, P8). | No transfer is in flight, the record is empty, and `rowSaved` says whether the clear landed |
| `record(modelId, status)`, where `status` is `'failed'`, `'smoke-testing'` or `'smoke-failed'` | No live transfer (else it rejects with `TransferInFlightError`: a programming error, which T-C11 tests) | Writes that status. `failed` keeps the held pause state, and the others write none, as today. A `completed` or `failed` phase becomes `none`. It does **not** clear `stoppedForStrict`: the hub's `failed` entry (H6) calls it, and it must not release the latch. | The write was awaited. `rowSaved` says whether it landed. |
| `stopForStrict()` (OQ-5) | none | **Always sets `stoppedForStrict`**, on arrival (the rest is queued). `active`: write `paused` with no pause state first (#117's kill window), then the pause procedure, then emit per the events table. A `pause()` of the record's model that is queued or running is joined (the transfer may not exist yet, for example a `start()` still on its write), the pause op decides whether the kill-window write applies, and the write is skipped when its step 1 has begun ("A strict stop and a hub pause that cross"). Held record (`paused`, `completed`, `failed`): report from the record and emit as "A strict stop that finds a held record" says. Phase `none`: `nothing-running`, and `stopped` (reason `strict`) is emitted when a model id is held. Before any successful load it is decided entirely on arrival (I3): latch set, `nothing-running`, `rowSaved: true`, no event. | **No transfer is in flight.** `nothing-running`, `kept` (pause state, possibly null), `not-keepable` (why: `no-resume-data`, `pause-failed` or `failed`), or `completed`. Every result carries `rowSaved`, which means the last row write this call asked for landed (true when it asked for none), so #117 R8 can see a failed kill-window save. After `completed`, the row is `paused` with none when the kill-window write ran, and unchanged (`downloading`) when a held `completed` record was only reported. **It never rejects**: a store failure is `rowSaved: false` and an invariant error ends as `not-keepable` (`pause-failed`) (step 4); #117's release path relies on this. **From here until `releaseStrictStop()`, `start()` and `resume()` refuse.** |
| `releaseStrictStop()` | none | **Acts on arrival, synchronously**, like the latch set of `stopForStrict()` (both are I3 exceptions); only its result resolves through the queue. Clears `stoppedForStrict`. **Writes nothing**, loads nothing, and never rejects. Idempotent. #117 calls it (How #117 shrinks). | `{ kind: 'released', wasSet }`, where `wasSet` is the latch as it was at arrival. The latch is clear (unless a `stopForStrict()` arrived since) |

**Types.** Results are discriminated unions on a `kind` field, each
carrying `rowSaved` where a write was made. `start` and `resume` return
`started`, `resumed` or `attached` (each carrying the snapshot, so the
hub can seed progress), `completed`, `refused` (carrying the gate's
reason) or `failed` (carrying `{ code, message }`). `attach` returns
`attached`, `completed`, `failed` or `not-live`, each with the snapshot.
The `refused` reason is `stopped-for-strict` (the latch) or the gate's
own reason. The `stopped` event carries `modelId`, `pauseState` and
`reason: 'strict' | 'unrequested'`. `pause` returns `{ kind: 'paused',
pauseState, strict, rowSaved }`, `{ kind: 'completed' }`, `{ kind:
'failed', code, message }` or `{ kind: 'pause-failed', pauseState,
strict, rowSaved }`, where `strict` is the latch at the moment the result
is computed. `releaseStrictStop` returns `{ kind: 'released', wasSet }`.
Errors are `TransferInFlightError` and `WrongModelError`, both exported
classes. `record(modelId, …)` for a `modelId` that differs from the held
record, with no live transfer, replaces the record (like `start`).

**What `start` and `resume` report.** When the phase is `completed` for
the model, they report `completed` even if a later verify failed. The
hub handles that as today (a verify error, not a re-download), and it
acknowledges with `record(modelId, 'failed')` or `abandon()`, which
clear the phase (T-C10).

**Construction.** The module exports
`createModelDownloadController({ driver, store? | openStore?, timers, gate? })` and
the singleton getter `getModelDownloadController()`, which builds one
with the real driver, an `openStore` over the real store and real timers, and no gate. Exactly one of `store` or `openStore` is given, and a ready
`store` is never reopened. Tests
build their own. `driver` supplies
`start(modelId, { onProgress })` and
`resume(modelId, pauseState, { onProgress })`, each returning
`{ task, promise, kind }`. The service's start and resume hand back the
`DownloadTask` and its promise, and `kind` is `'started'` or
`'resumed'`, so the controller can tell a resume from the fresh start
that the P7 guard falls back to (`resumed` is reported only when a
resume really ran). Progress reaches the controller through that
`onProgress` option, and the controller fans it out to subscribers.
`driver` also supplies `onAppState(listener)`, which delivers the
current state on subscribe (The pause procedure), and `platform`
(`'ios'` or `'android'`), which picks
the lost-cancel guard (F11). On web (a configured target, where the hub is the first screen because no model can load), the real driver maps `platform: transferPlatform(Platform.OS)`, where `transferPlatform(os: typeof Platform.OS): 'ios' | 'android'` is an exported pure helper that returns `'ios'` for `'ios'` and `'android'` for everything else; every non-iOS platform uses the Android guard. The web `FileSystemDownloadTask` is a stub whose `start()` resolves `null` (`expo-file-system/build/ExpoFileSystem.web.js:41-45`), so a web start ends as an unrequested `null` (`stopped`, `unrequested`). The web stop's coverage is T-C16's unasked-null case. This changes web behaviour: see D8. No other web-specific behaviour is promised.

**The `gate` input (#117's hook).** An optional
`gate(modelId, op: 'start' | 'resume')` returning
`{ allowed: true }` or `{ allowed: false, reason }` (it may be async).
`start()` and `resume()` call it **after the latch check and before any
write or state change**: before the held pause state is dropped and
before the `downloading` row is written. A refusal, from the latch or
from the gate, returns `refused` and leaves the record, the latch and
the row exactly as they were. The default is allow. This spec ships the input and tests it (T-C21), and nothing
supplies one until #117 does (a strict-mode gate, Rule 11). `attach()`,
`park()`, `pause()`, `releaseStrictStop()` and the other operations are
not gated and never refuse on the latch, because none of them starts a
transfer (`pause()` reads the latch only for the `strict` field of its
result). `timers` supplies `setTimeout` and `clearTimeout`, so tests need no
global patching. The singleton has no reset: tests do not use it.

`cancel` is not public. Every caller that stops a transfer needs a
defined end state: paused, abandoned or stopped for strict. A bare
cancel would leave the record's state for the caller to guess. The
pause procedure and `abandon()` cancel internally.

### Invariants

- **I1 — One transfer.** At most one `DownloadTask` is active in the
  process, and only the controller creates or holds it.
- **I2 — At rest, nothing is in flight.** A transfer can be in flight
  only while the hub is in `downloading` or `pausing`, or while no hub
  is mounted (P13), or in `failed` after a `start`/`resume` rejected with `TransferInFlightError` (unreachable: `SELECT_MODEL` of a different model abandons first, H8). Every other hub state has none: `selecting`,
  `checkingExisting`, `retiringCurrent`, `confirmingNetwork`,
  `awaitingWifi`, `cellularConfirm`, `paused`, `failed` (except the unreachable carve-out above), `verifying`,
  `smokeTest`, `smokeFailed`, `customImport` and `complete`. The hub
  leaves `downloading` only on a controller event that reports the
  transfer ended (`completed`, `failed` or `stopped`, the last through
  the machine-lifetime subscription of H1), on a `start` or `resume`
  result that says no transfer exists (`completed`, `failed`), on an
  `attach()` result of `not-live`, `completed` or `failed` (H9), into
  `pausing` (a user or background pause, or a `refused` result, H1), and
  it leaves `pausing` only on the result of `pause()`, which guarantees
  no transfer. The converse, that no transfer appears behind a hub at
  rest, rests on I7 and on the latch: a strict stop is followed by
  refusals, not by tasks (T-H9b).
- **I3 — Operations run one at a time,** in FIFO order. Three things
  happen on arrival instead: `stopForStrict()` sets the latch,
  `releaseStrictStop()` clears it, and a `stopForStrict()` before any
  successful load is decided entirely on arrival (latch set,
  `nothing-running`, `rowSaved: true`, no event), because no task can
  exist before the first load and a `start()` queued behind it is refused
  by the latch. A joined strict stop takes the pause's earlier queue
  slot, so operations queued between the pause and the stop run after
  it.
- **I4 — One writer.** Only the controller writes the download row.
- **I5 — `savable()` only on `paused`.**
- **I6 — Writes are idempotent and awaited,** and a failed one is
  retried (the failed-save rule).
- **I7 — Only `start()` and `resume()` start a transfer,** and they
  are called by the hub's `downloading` state, with one exception:
  #117's R10g Cancel from Settings may call `start`, `resume` and
  `park` with the hub closed. `park` starts no transfer. `attach` and
  `releaseStrictStop` start none either.
- **I8 — A cancel is immediate,** a late settlement of an older
  generation is dropped, and a cancel that the native side lost (F11) is
  repeated through `release()` (at once on iOS, on the first progress
  event of the retired generation on Android), except in F11's few-instruction iOS race.
- **I9 — A strict stop is final until released.** After `stopForStrict()`
  returns, no task is created in this process until `releaseStrictStop()`.

## The hub machine becomes a thin caller

Every change to `src/machines/modelHubMachine.ts` and its provider. The
plan may rename events and flags, but it may not change a row's source
states, target or effects.

| Row | Event or state | Source | Target | Effects |
|---|---|---|---|---|
| H1 | `downloading` | — | — | Entry no longer writes the row (`start` and `resume` do, before the task exists, which is today's queue order). `runDownload` subscribes for its model, then calls `resume(modelId)` when the context holds a pause state with resume data, and `start(modelId)` otherwise. Its results and events map to the same machine events as before: `completed` → `DOWNLOAD_COMPLETE`, `failed` → `FAIL`, and `attached` seeds progress from the snapshot. `runDownload` subscribes to **`progress`, `completed` and `failed` only**: it never forwards `stopped` (no double delivery, see below). When a `start` or `resume` result of `completed` or `failed` and the matching event could both arrive, the **result is authoritative** (the controller emits the event only for a settlement, never for a result it returns). A `start` or `resume` that rejects (only `TransferInFlightError`: `start` and `resume` define no `WrongModelError`, which only `pause` can raise) maps to `FAIL`. **A `refused` result (reason `stopped-for-strict`, or the gate's) maps to `REFUSED`, which goes `downloading` → `pausing` with `pausedReason: 'strict'`** and runs the same `pause(modelId)` as any pause: a no-op on a held `paused` record, and a `paused` row write on phase `none` (never a `downloading` row). A refusal therefore never leaves a `downloading` row and is never a failure of its own (#117 R10a). The one exception is a held `failed` phase: `pause()` then reports `failed` and H3 maps it to `failed`, as `FAIL` does today. Under strict, #117's M8 makes that unreachable. The only refusal sources are the latch and #117's gate, which exists for Rule 11, so the reason is always `strict`. `SELECT_MODEL` of a different model abandons first (H8), so the record is for this model or for none when this is called. Cleanup only unsubscribes. It never pauses or cancels. **`stopped` events are delivered by a root-level `invoke`** of a `controllerEvents` `fromCallback`, which subscribes once when the machine starts and unsubscribes when it stops. It forwards each `stopped` event as `TRANSFER_STOPPED { reason, modelId, pauseState }`, and every handler guards `event.modelId === context.modelId`. `runDownload` exists only in `downloading`, so without the root subscription a `stopped` that lands in `pausing`, `paused` or a network state would reach nobody (H3, H5, H13, H15). |
| H2 | `PAUSE`, `APP_BACKGROUND` | `downloading` | `pausing` | `pausedReason` becomes `user` or `background`. `resumeOnSettle: false`. Every entry to `pausing` resets `resumeOnSettle` (see H4). |
| H3 | `pausing` (new) | — | — | Invokes `pause(modelId)`. `onDone` by result: `paused` → the context's pause state takes the result's, then `confirmingNetwork` (with `continuation`) if the reason is `background` and `resumeOnSettle` is set, otherwise `paused`. A result with `strict: true` sets `pausedReason: 'strict'` and goes to `paused` (never to the network check, H13). `completed` → `verifying`, pause state null. `failed` → `failed`, as `FAIL` does today (P12). `pause-failed` → `failed` with "Could not pause the download. Try again.", pause state kept. `onError` (an invariant error) → `failed`, with the same message. The controller has already cancelled the transfer in every one of these cases (the pause procedure, step 4), so `failed` never holds a live transfer. With reason `background`, `APP_FOREGROUND` sets `resumeOnSettle` and `APP_BACKGROUND` clears it. `TRANSFER_STOPPED` with reason `strict` (delivered by the root subscription of H1, model-matched) sets `pausedReason: 'strict'` and clears `resumeOnSettle`, and the state keeps waiting for `onDone`. The event can arrive before or after the `onDone`, depending on microtask order (a strict stop that **joined** this pause emits it before the `pause()` promise resolves, and a strict stop after the pause returned usually arrives after the `onDone`, but nothing here relies on that: see "A strict stop and a hub pause that cross"). The latch, set on arrival, can also send the hub to `pausing` through `REFUSED` before the stop emits. In every order a `paused` result ends the state `paused` with reason `strict` (a `completed` result goes to `verifying`, and `failed` or `pause-failed` to `failed`, as above). The `onDone` also reads the result's `strict: true`, so either signal alone ends `paused`, never in the network check. A `paused` result goes to `paused` when `pausedReason` is `strict`, whatever `resumeOnSettle` says. Every other event is ignored, so `RESUME` cannot arrive (S1, S2). |
| H4 | Idle pauses | `confirmingNetwork` + `APP_BACKGROUND`; `cellularConfirm` + `APP_BACKGROUND`; `cellularConfirm` + `CELLULAR_CANCEL` (continuations only, as today) | `pausing` | Reason `background`, `background` or `restored`. `resumeOnSettle` is reset on **every** entry to `pausing`, these included. With no transfer, `pause()` writes the row `paused` and sets the phase `paused` (the pause-on-`none` case). This replaces `idlePause` (P2, P3). |
| H5 | `paused` | — | — | No invoke: `paused` is entered only once the pause has settled. `RESUME` and `APP_FOREGROUND` (reason `background`) → `confirmingNetwork`, as today. `idlePause` is removed. `TRANSFER_STOPPED` with reason `strict` relabels it: `pausedReason: 'strict'`, with the pause state from the event (H13). |
| H6 | `failed` entry | — | — | `record(modelId, 'failed')` replaces the unawaited write, with a `.catch` so a rejection (a programming error such as `TransferInFlightError`) is logged and never unhandled. It is queued, so a quick `RETRY` that starts a download is ordered after it (S6). |
| H7 | `smokeFailed` | — | — | Entry calls `record(modelId, 'smoke-failed')`. `CHOOSE_ANOTHER` calls `abandon()` in place of `clearDownloadState`. |
| H8 | `SELECT_MODEL` (different model), `IMPORT_SMOKE_OK` | as today | as today | `abandon()` replaces `clearDownloadState`. It is queued ahead of any later `start` or `readRow`, so the `checkingExisting` sweep sees the cleared row. |
| H9 | `RESTORE_DOWNLOAD` with `live: true` (new, guarded first) | `selecting` | `downloading` | The model comes from the event, with `continuation: true` and an `attachOnly` flag. `runDownload` calls **`attach(modelId)`** and never `start()`. `attached` seeds progress from the snapshot (no network check: the transfer never stopped, OQ-1). `completed` → `DOWNLOAD_COMPLETE`, `failed` → `FAIL`. `not-live` (the transfer settled or was stopped between the layout's `load()` and this call) → `NOT_LIVE`, which goes to `confirmingNetwork` with `continuation` and the pause state from the result's snapshot, so a restore never creates a task without the check (P1). |
| H9b | `RESTORE_DOWNLOAD` with `finished: true` (new, guarded before H9) | `selecting` | `checkingExisting` | The layout's snapshot has phase `completed`: the file finished while no hub was open, so the restore goes straight to the verify path with no network check and no new transfer (D7). Its actions are today's third `RESTORE_DOWNLOAD` branch: `modelId` from the event, `pauseState` from the event, **`continuation: true`** and `error: null`, so that a verify that fails falls back to `confirmingNetwork` as a continuation, as it does today. The row stays `downloading` until the hub's own `record(…)` or `abandon()`. |
| H10 | `RESTORE_DOWNLOAD` of a `paused` row | `selecting` | `paused` | As today. The controller already holds the pause state from `load()`. |
| H11 | `runSmokeTestAndCommit` | — | — | Its writes become `record(…)` calls and its clear becomes `abandon()`. A `smoke-testing` marker that did not land (`rowSaved: false`) throws before the load, as a rejected write does today (P10). |
| H12 | Context | — | — | `idlePause` is removed and `resumeOnSettle` is added. `pausedReason` gains `'strict'` (from `TRANSFER_STOPPED` with reason `strict`, OQ-5). A `TRANSFER_STOPPED` with reason `unrequested` sets `pausedReason: 'user'`. `TRANSFER_STOPPED` carries `modelId` and `pauseState`, and the machine copies the event's pause state into `pauseState`. `pauseState` stays as a read-only copy, taken from controller results. It is used only to choose `resume` over `start` and for P12's guard. The controller never reads it. |
| H13 | `TRANSFER_STOPPED` (OQ-5) | `downloading` | `paused` | Reason `strict`: `pausedReason: 'strict'`. Reason `unrequested`: `pausedReason: 'user'`. The pause state comes from the event in both. `APP_FOREGROUND` never continues a `strict` pause, because its guard requires `background` (#117 R10d). A hub pause that crossed a strict stop ends the same way: through H3 when `pause()` reports `strict: true` (or the join's `stopped` event in `pausing`), through the `stopped` event accepted in `paused` (H5), or in the network states (H15). The event reaches this row only through the root subscription of H1. |
| H14 | `ModelHubApi` | — | — | Drop `startDownload`, `resumeDownload`, `pauseDownload`, `persistDownloadState`, `clearDownloadState` and `readDownloadModelId`. Add `downloads`, the controller's public API (including `subscribe`, used by both `runDownload` and the root `controllerEvents`), injected so tests can pass a controller built with `createModelDownloadController` on a fake transfer driver. `ModelHubRestoreState` and the `RESTORE_DOWNLOAD` event gain `live: true` (H9) and `finished: true` (H9b). `deleteOrphanedModelFiles` reads `downloads.readRow()`. |
| H15 | `TRANSFER_STOPPED` (new) | `confirmingNetwork`, `cellularConfirm`, `awaitingWifi` | `paused` | Reason `strict` only, model-matched: `pausedReason: 'strict'`, `continuation` cleared, the pause state from the event. **No controller call**: the transfer is already stopped and the latch stays set. The network check actor and the cellular prompt are stopped by leaving the state, so a strict stop never shows the prompt. Reason `unrequested` is ignored in these states (there is no transfer to stop). |

### Screens, provider, layout

- **`_layout.tsx`.** It no longer opens SQLite or creates a store. It
  awaits `smokeTestSettled()` as today, then
  `getModelDownloadController().load()`. **It catches a rejection** of
  either (a failed first read, a hung store call) and shows an error with
  a Retry button, in place of the spinner. Today's layout has no `catch`
  and would spin forever. Retry runs the same sequence again (the
  controller is still unloaded after a failed read). A phase of `active`
  restores `{ status: 'downloading', live: true }`. A phase of `completed`
  restores `{ finished: true }` (H9b): the row still says `downloading`,
  and sending that through the network check would prompt for cellular or
  wait for Wi-Fi over a complete file. Anything else goes through
  `toRestoreState({ modelId, status, pauseState })`, composed from the
  snapshot's `row` and `pauseState` (the row omits the pause state), as
  today. `ModelHubRestoreState` and `RESTORE_DOWNLOAD` gain `live: true`
  and `finished: true` for the first two cases. The layout's `load()` can wait up to the bounds in
  "Row writes" (about 80 s worst case); it shows its spinner meanwhile. Its "unrestorable
  row" clear becomes `abandon()`, and it never runs while the phase is
  `active`.
- **`useModelHub.tsx`.** `createModelHubApi` takes the controller. The
  context value's `clearDownloadState` and `readDownloadModelId` become
  `abandonDownload()`, which resolves `{ rowSaved }`, and
  `readDownloadRow()`.
- **`import.tsx`.** The row's model comes from `readDownloadRow()`, and
  `rowCleared` comes from `abandonDownload()`'s `rowSaved`. The order
  is unchanged (P6).
- **`download.tsx`.** `pausing` counts as a download phase. It shows
  "Pausing…" and no buttons (OQ-6). `index.tsx`'s `INSTALL_STATES`
  gains `pausing`, so the list's focus effect pushes the download
  screen.

## Deliberate changes to the #125 baseline

- **D1 — A failed row write never moves the hub** (OQ-4). Today a
  declined continuation whose `paused` write fails goes to `failed`
  ("Could not pause the download"). Under the failed-save rule, it
  stays `paused`, and the row is written again later. #125's test "RETRY
  from failed with a pause state re-checks the network; declining
  pauses it" is rewritten to reach `failed` through a `pause-failed`
  result, which keeps that RETRY route covered.
- **D2 — A completion during a pause goes to `verifying`** (S4, OQ-2),
  not to `failed`.
- **D3 — A failed pause cancels the transfer** (#132, S3). The copy is
  unchanged.
- **D4 — Pausing is a state of its own** (#127, S1, S2). `paused`,
  with its Resume button, appears only once the pause has settled. Two tests change their assertions, in
  `modelHubMachine.test.ts` at
  `8f5f484`: "a pause that returns null resumes with a fresh start"
  (lines 700–720) and "pauseTask rejection lands in failed" (lines
  757–775). They now assert `pausing` and then `paused` (or `failed`)
  once the controller's `pause()` settles. The other tests in the B1,
  B2 and B6 block (lines 667–793) are mock changes only. The
  `pauseDownload` tests in `modelDownloadService.test.ts` (lines 64–75)
  go with the function (the coverage moves to T-C3, T-C5 and T-C13). Every
  other #125 test is a mock change only.
- **D5 — Reopening the hub with a live transfer attaches to it** (S5,
  OQ-1). Today the restore runs the check and starts a second transfer.
- **D6 — The import's commit-failure corner** (#125's accepted
  limitation). If `setModelPath` or `setModelId` throws after the row
  clear, a re-pick of the old model in the same session now starts
  over, instead of resuming from the hub context's copy. The
  controller forgot the pause state when the row cleared, and keeping
  a second copy alive is the drift this spec removes (OQ-7). This is
  data-safe: the partial is an orphan for the next sweep, and P7 covers
  any resume.

- **D7 — Accepted edges.** After a closed hub, a transfer that fails
  with disk-full leaves its partial on disk, because the controller
  deletes no file (P12 deletes it today only through the hub). The next
  sweep removes it (P6, P8). A `completed` phase left by a closed hub restores straight
  to `checkingExisting` (H9b), and a later `start()` for it still
  reports `completed`; if the hub's verification then fails, the user
  sees the verify error and not a silent re-download (T-C10).
  Pre-existing, not introduced here and tracked in #135: the store's row
  writes share the wiki's SQLite connection, so a write that lands inside
  the engine's `withTransactionAsync` joins that transaction and can be
  rolled back after it reported `rowSaved: true`. On a first install, a
  `CREATE TABLE IF NOT EXISTS` can likewise join a wiki transaction that
  later rolls back, and the store's cached `ready` then stays resolved
  with no table. Today the next hub open re-runs the schema. Under the
  singleton, writes report `rowSaved: false` until the app restarts,
  which is honest and safe against stale rows.

- **D8 — Web ends a start as Paused.** At baseline, `runDownload`
  sends nothing on a null result (`src/machines/modelHubMachine.ts:204`
  at 8f5f484: `if (!cancelled && completed)`), so web sits in
  `downloading` at zero. After this PR, the null is an unrequested stop
  and web shows Paused (reason `user`); Resume cycles start, null,
  paused.

## How #117 shrinks

With this controller merged, #117's Step 2 calls the controller and
stops re-specifying transfer ownership:

- **R10a (one pause owner)** becomes: strict calls
  `controller.stopForStrict()` from Settings or from the hub. The
  handle, `stoppedForStrict`, the stopped `PrivacyGateError`, "a cancel
  on request" and the owner's save order are all inside that call. The
  latch (`stoppedForStrict`) refuses every `start()` and `resume()` from
  the moment the call returns, so #117's mode gate is not the only line
  against a late start (see "A strict stop and a hub pause that cross").
  **#117 must call `releaseStrictStop()` (idempotent, writes nothing,
  never rejects) on every path where a strict session ends or never
  starts**, because nothing else clears the latch. R8 enters strict and
  R9 steps out of it. (1) **A `finally` around R8 steps 1 to 3, on every
  exit**: success, a not-keepable result, a rejected step 1, a dismissed
  warning, a failed mode save. On success and on a failed mode save the in-memory mode is strict
  (#117 R8 step 3 keeps it on for the session), so its gate takes over and
  the latch has done its job. On every other exit the mode is Standard, and a latch left set would
  refuse every download in Standard (the hub shows Paused with a Resume
  that does nothing). The one exception to the `finally` is R10g's
  Cancel (the user chose Standard): it releases **before** its `start()`,
  `resume()` or `park()`, which would otherwise be refused, and then also
  passes through the `finally`. (2) **After R9's successful apply** (the
  step out), as a backstop. A Turn on and remove path calls `abandon()`,
  which does not touch the latch: the `finally` releases it after step 3.
  **Required #117 test:** strict on with nothing running, step out, then
  `start()` in the same process creates a task.
- **R10b (one transfer at a time; a restore stops a live transfer
  first)** is covered by I1, and by H9's attach (OQ-1, owner-ruled). #117's
  pause-then-continue is replaced by that attach.
- **R8 step 1** reads `stopForStrict()`'s result: `kept`,
  `not-keepable` with its reason, `completed` or `nothing-running`.
  The kill-window save is inside it.
- **Machine rows that go away:** M0 (done here, #132); M2, M4b and M12
  (the one `TRANSFER_STOPPED` row, H13); M5 (`failed` never holds a
  transfer, I2); M9 and the settle gating in M6, M13 and the R7 control
  (`paused` is always settled, H5). The "Why the strict paths converge"
  note goes too. The `stoppedForStrict` latch and the strict mapping from
  a crossed hub pause (H3, H15) replace #117's own flag.
- **Rows that stay, as thin calls:** M1 (relabel a settled `paused`);
  M3 (Turn on and remove: `abandon()`, then #117 deletes the partial);
  M4a (a refusal: #117 supplies the controller's `gate` input, which runs
  before any write in `start` and `resume` and returns `refused`; the
  hub's `REFUSED` event goes to `pausing` with reason `strict`, which
  calls `pause(modelId)` and ends `paused`, H1. It is **not** `park()`:
  `park()` writes `downloading`, and R10a says a refusal never leaves a
  `downloading` row); M7 and M8 (M8's row rewrite is
  `pause(modelId)`, which writes `paused`; it is not a `park()`. M4a and M8
  target `pausing` with reason `strict`, as `REFUSED` and H4 do, because
  `paused` is entered only from a settled `pause()` (H5), and `idlePause`
  disappears from their context effects, H12); M10; M11; R10g's Cancel from Settings, with
  the hub closed: `start()` or `resume()` after #117's network decision,
  and `park(modelId)` for the row #117 wants saved `downloading` with no
  pause state while a continuation waits on cellular or offline (after
  `releaseStrictStop()`, above). I7 allows exactly these calls.
- **Known gaps closed:** #127 and #132 leave #117's known-gaps list.
  #126 stays.

## Out of scope

- **#126**: the silent fall-back to cellular when Wi-Fi drops after the
  check, and wired Ethernet counting as offline. The controller does
  not watch the network. A later fix for #126 belongs in the
  controller (for example, a network listener that calls the pause
  procedure), but it is not specified here.
- **#128**: hash verification. "Complete" still means the size matches.
- **iOS `sessionType: 'foreground'`** (#117 OQ-7, owner-ruled there).
  The controller's guarantees hold within one process. An iOS
  background-session transfer that outlives a system kill cannot be
  reached from the relaunched process (F7). That is the same as today,
  and it stays #117's (OQ-8).
- **#115**: model files the user picks.
- Changes to verify, the smoke test, retire, or the custom-import UI.

## Acceptance tests

Each test names the mutation it catches. A test that cannot fail under
its mutation is not acceptance. Controller tests do not hand-write
the task. They run the **real `NetworkTasks.js` `DownloadTask`** over a
fake native `FileSystemDownloadTask`, so `pause()` throws unless the task
is `active`, `pauseAsync()` can resolve with the task `completed`,
`savable()` throws unless it is `paused`, `cancel()` sets `cancelled`
at once, and the `_state = 'paused'` timing (F9) are the installed
behavior and not our copy of it. The fake native task can: never settle
a cancelled promise (F4); drop a pause issued before the first progress
event (**drop mode**, F8); erase a `cancel()` issued before its start
took effect, after which the transfer runs and emits progress, and stop
only on `release()` (**drop-cancel mode**, F11; it can also be set to
erase just the next `cancel()`, whatever the timing, for a test whose
cancel comes long after the start); on iOS ordering, process a `release()`
after the queued start, as the native main queue does (F11); deliver its results
late (a simulated suspension, F9); and end a transfer in `completed` or
`error`. It implements `addListener`, `release` and `cancel` as the
native shared object does, so the real `NetworkTasks.js` runs unchanged
over it. The tests
drive the order in which native promises settle. The seam
is the two modules `NetworkTasks.js` imports: `./ExpoFileSystem` (it
runs `new ExpoFileSystem.FileSystemDownloadTask()`, so the fake native
task is supplied by mocking `expo-file-system/build/ExpoFileSystem`) and
`./File` (it runs `new File(result)` on completion, so `File` is stubbed
with a `size` by mocking `expo-file-system/build/File`). Hub tests run the real machine against a real
controller built on that fake and an in-memory store, except where a
row says otherwise.

**Controller** (`__tests__/modelDownloadController.test.ts`):

- **T-C1 — The queue.** A `pause()` issued while `start()`'s
  `downloading` write is still pending waits: the writes land in the
  order `downloading` then `paused`, and `pauseAsync` runs on the
  created task. *Catches:* removing the queue (the pause finds no task,
  or `paused` lands before `downloading`).
- **T-C2 — The join.** Two `pause()` calls during one pause: one
  `pauseAsync`, one `paused` write, and the two returned promises are
  **the same object** (`expect(p2).toBe(p1)`). Identity is asserted
  only for pause-to-pause: a `pause()` that joins `stopForStrict()` is
  tested in T-C14b and is a separate promise. *Catches:* no join. With
  a FIFO queue and a `paused` no-op, the second call would also return
  an equal result, so only promise identity fails without the join.
- **T-C3 — Completion inside the pause** (S4). `pauseAsync` resolves
  with the task `completed`: the result is `completed`, `savable` is
  never called, and there is no `paused` write. *Catches:* today's
  `savable()` after `pauseAsync()`, and branching on the throw instead
  of on `task.state`.
- **T-C4 — Completion queued before the pause.** The transfer settles
  first, then `pause()` runs: `completed`, with no `pauseAsync`.
  *Catches:* a `pause()` that ignores the `completed` phase and parks.
- **T-C5 — A failed pause cancels** (#132). `pauseAsync` rejects while
  the task stays `active`: `cancel()` is called, the result is
  `pause-failed`, the phase is not `active`, the held pause state is
  kept, and a later settlement of that task emits nothing. *Catches:*
  dropping the cancel, and dropping the generation check.
- **T-C6 — A cancel that never settles** (F4). After `abandon()`, the
  cancelled task's promise never settles: `abandon()` still resolves,
  and a following `start()` creates a new task. *Catches:* awaiting the
  cancelled promise (the test times out).
- **T-C7 — One transfer.** `start(A)` twice: one task constructed, and
  the second call returns `attached`. `start(B)` while A is live:
  rejects with `TransferInFlightError`, and no task for B. *Catches:*
  constructing a task on attach, and silently replacing a live
  transfer.
- **T-C8 — The failed-save rule.** The store rejects the `paused`
  write: the result is `paused` with `rowSaved: false`. The next
  operation writes `paused` again before its own write. A newer write
  that lands drops the pending one. *Catches:* no retry; retrying a
  superseded row; throwing on a failed write.
- **T-C9 — Unobserved settlement.** With no subscriber, a completion and
  a failure write nothing (the row stays `downloading`), and the phase
  becomes `completed` or `failed`. *Catches:* writing `failed` from the
  controller, which would break P1's continuation on the next open.
- **T-C10 — A completed phase is reported, not refetched.**
  `resume(A)` in phase `completed` for A returns `completed` with no
  new task. After `record(A, 'failed')`, a `start(A)` creates one.
  *Catches:* re-downloading a finished file; never acknowledging (a
  verify-fail loop).
- **T-C11 — `record()` refuses a live transfer.** It rejects with
  `TransferInFlightError` and writes nothing. *Catches:* dropping the
  guard.
- **T-C12 — `load()`.** The row is read once per process. A second
  `load()` returns the in-memory record with no read. A pending write
  is retried. `load()` creates no task. A rejected first read leaves the controller unloaded: the operation
  rejects with the store's error, and the next operation reads again
  and succeeds. A `failed` row loads with its pause state held.
  **A failed open or schema step is not cached.** The real
  `createModelDownloadStateStore` runs over a fake DB whose first
  `execAsync` rejects and whose second succeeds, behind an `openStore`
  that returns a store over that DB: the first `load()` rejects, and the
  second `load()` succeeds. A first `openStore()` that never settles
  times out at 10 s the same way, and the next `load()` calls
  `openStore()` again. **Late settle (fake timers):** the first
  `openStore()` resolves at 15 s with store A; the second resolves at
  once with store B and the second `load()` succeeds. Advance past 15 s:
  a later `record()` writes through B, and A's `set` is never called. A
  variant where the first open rejects late asserts no unhandled
  rejection. *Catches:* a cached schema or open failure
  (a Retry that can never recover); a late settlement of a dropped open
  overwriting the new store; re-reading over a newer in-memory truth; starting anything
  at load (rule 11); caching a failed read; dropping a failed row's
  pause state.
- **T-C13 — The pause watchdog** (OQ-3, fake timers). `pauseAsync`
  never settles and the task stays `active`: after the bound, `cancel()`
  runs and the result is `pause-failed`. *Catches:* an unbounded wait
  that blocks the queue.
- **T-C13b — The watchdog counts foreground time only** (F1, F9). This
  is a **unit test with a stub task** and a fake `onAppState`, because
  the real `NetworkTasks.js` cannot show it: its `_state = 'paused'`
  (line 391) is set a few microtasks before `pauseAsync()` resolves, so
  no timer can fire between them. Case 1: a pause starts while
  foreground. The app is backgrounded for longer than the bound, then
  returns to the foreground. The timers re-arm with their full window at
  that point (asserted: no cancel before it elapses again), and
  `pauseAsync` then settles with the task `paused`: the result is
  `paused` with the pause state, and `cancel()` was never called. Case
  2: the same, but `pauseAsync` never settles after the return: the
  watchdog cancels after the full window of foreground time. Case 3: a
  pause that starts on `APP_BACKGROUND` begins suspended, and counts only
  after the foreground. Case 4: the stub task's state is `paused` and
  `pauseAsync` never settles: the watchdog takes the `paused` branch
  with the pause state, and `cancel()` is never called. Case 5: the
  driver delivers `AppState.currentState` on subscribe (a controller
  built while backgrounded starts its timers suspended), and `inactive`
  counts as foreground. *Catches:* a wall-clock timer that cancels a
  pause that succeeded (#127 again), a cancel of a paused task, and a
  wrong clock at subscribe.
- **T-C14 — `stopForStrict()`** (OQ-5). The `paused` write with no
  pause state lands before `pauseAsync`. The outcomes `kept`,
  `not-keepable` (no resume data, failed pause, failed), `completed` (the
  row stays `paused` with none when the kill-window write ran, and `downloading`
  when a held `completed` record is only reported) and `nothing-running`
  are each reached,
  each result carries `rowSaved` (a failing kill-window write gives
  `false`), and the events of the per-outcome table are emitted. The
  latch is set after **every** outcome, `nothing-running` included, and
  also after a call made before the first `load()` (a later `load()` does
  not clear it). **Held records.** A held `paused` record with a **null**
  pause state (a foreground-killed download with a declined continuation,
  and a `pause()` on phase `none`, which sets the phase `paused`) gives
  `kept` with null, never `not-keepable`, and emits `stopped`; a
  procedure that found no resume data gives `not-keepable`
  (`no-resume-data`). A held `completed` or `failed` record emits nothing.
  A stop on phase `none` with a model id held emits `stopped` (reason
  `strict`); with none held (before any load, or after `abandon()`), it
  emits nothing. The call never rejects (a failing store, an invariant
  error). *Catches:* pausing before the first save; a missing outcome; a
  missing event; a latch that a phase-`none` stop leaves clear (a
  `start()` in the window before #117's mode is strict); a `pause()` on
  `none` that leaves the phase `none` (the next strict stop says
  `nothing-running` and the hub is not relabelled); a held null pause state
  reported as not keepable (a warning on a paused row, #117 R10g); a
  rejecting strict stop.
- **T-C14b — Strict stop crossing a pause, and the latch.** Eight cases.
  (1) **Join while queued.** `stopForStrict()` arrives while a `pause()`
  is queued behind another operation: the kill-window write lands first,
  one `pauseAsync` runs, the `pause()` result is `paused` with
  `strict: true`, `stopForStrict()` returns `kept` from the same outcome,
  and `stopped` (reason `strict`) is emitted once, before the `pause()`
  promise resolves. (2) **Join while running.** The same, but the
  `pause()` has already asked `pauseAsync`: no kill-window write, one
  `pauseAsync`, `strict: true`, one `stopped`. (3) **After return.** A
  `stopForStrict()` after a `pause()` that already returned `paused`
  gives `kept` from the held record, not `nothing-running`; the earlier
  `pause()` result said `strict: false`; one `stopped` (reason `strict`)
  is emitted with the held pause state. (4) **The latch refuses.** With
  the latch set, `start()` and `resume()` return `refused` (reason
  `stopped-for-strict`) with no write, no task and the record unchanged,
  and `park()`, `record(…, 'failed')`, `pause()` and `abandon()` do not
  clear it (after `abandon()`, `start()` is still refused);
  `releaseStrictStop()` clears it, writes nothing, never loads, and
  returns `{ wasSet }`. (5) **The promise
  shape.** A `pause()` that joins a running `stopForStrict()` returns its
  own promise with the pause-shaped result, never `kept`. (6) **Release
  then stop.** With `releaseStrictStop()` queued behind a long operation,
  a `stopForStrict()` arrives: the latch ends **set** (the release acted
  on arrival, so the later stop wins), and a `start()` is refused. A
  `releaseStrictStop()` alone clears the latch at once, before the queue
  drains. (7) **Start queued ahead.** A `start()` queued behind another
  operation and not yet begun, then a `stopForStrict()` arrives: the
  `start()` returns `refused` and creates no task. (8) **Start held on its write.** A `start()` held on its
  `downloading` write, then `stopForStrict()`: one task is created, the
  strict stop pauses it (`kept`), and the latch is set.
  The outcome of case 8 is pinned to `kept`. Two more joins are pinned
  by the round-4 tests in `__tests__/modelDownloadControllerHeld.test.ts`:
  a join to a pause on phase `none` (`kept` with that write's
  `rowSaved`, E2), and a join to a pause that rejects (the strict stop
  runs in the pause's turn, before a `releaseStrictStop()` and a
  `start()` queued after it, E3b).
  *Catches:* a latch re-check after the gate or write that refuses
  after writing `downloading`, or after creating a task; a join
  that returns `kept` (a stuck `pausing`); a kill-window write after
  `pauseAsync` has begun; a double `stopped`; a lost latch; a `park()`,
  `record()` or `abandon()` that releases it; a `start()` that clears it;
  a queued release that clears a newer latch; a queued `start()` that
  slips past a later strict stop.
- **T-C15 — The lost pause** (F8). The fake's drop mode ignores a
  `pause()` issued before the first progress event. After `start()`,
  `pause()` is re-issued about 1 s later (progress kept arriving), and
  `pauseAsync` settles `paused` before the watchdog. A second fake mode,
  **slow but effective first pause**, delivers its pause late with no
  progress meanwhile, and a second `pause()` on it would return null
  resume data: the controller does **not** re-issue, the pause settles
  `paused`, and the pause state survives with its resume data. *Catches:*
  no re-issue (the wait runs to the watchdog and the download is
  cancelled), and a blind re-issue that wipes the resume data (M1).
- **T-C16 — Settlement bookkeeping.** After each terminal branch, a
  second settle of the same promise (a `null`, a file, a rejection)
  emits nothing and writes nothing. An unasked `null` emits `stopped`
  (`unrequested`) and sets phase `paused`. A `completed` clears the held
  pause state, so a following `record(id, 'failed')` writes no stale
  resume data. A cancelled promise that rejects is never unhandled.
  *Catches:* an unretired generation; a stale pause state after a
  completion.
- **T-C17 — A queued `abandon()` during a pause.** `abandon()` issued
  while the pause procedure runs waits for it, then clears the row and
  the record, with no transfer live. *Catches:* a re-entrant abandon.
- **T-C18 — Never loaded.** `start()`, `resume()` and `readRow()` before
  any `load()` await the lazy load first; `snapshot()` before it
  returns phase `none`. `stopForStrict()` before any successful load is decided on arrival, even with a hung load: it sets the latch, returns `nothing-running` with `rowSaved: true`, reads no row and emits no event, and a `start()` queued behind it is refused. A load that fails and then succeeds is covered in T-C12. *Catches:* a start that overwrites a saved
  `paused` row before it was read; a strict stop that waits on, or fails with, a hung load.
- **T-C19 — Store bounds.** A store call that never settles resolves as
  `rowSaved: false` after 10 s and the queue proceeds; a first `load()`
  read that never settles rejects after 10 s. *Catches:* a hung SQLite
  blocking the queue (F2).
- **T-C20 — `park()`.** It writes `downloading` with no pause state and
  creates no task. It rejects with `TransferInFlightError` while a
  transfer is live. It does **not** clear `stoppedForStrict`: after a
  strict stop, `park()` then a `pause()` on phase `none` returns
  `strict: true`, and a `start()` is still refused. After
  `releaseStrictStop()` the same `pause()` returns `strict: false`.
  `pause()` on phase `none` writes `paused`, not `downloading`. (After a
  release, the "same `pause()`" is a no-op on the held `paused` record
  that the first `pause()` on `none` created, so the test calls `park()`
  again first to get phase `none`.) *Catches:*
  a park that starts a transfer; a park that releases the latch (M4).
- **T-C21 — The `gate`.** With a gate that refuses, `start()` and
  `resume()` return `refused` and change nothing: no write, no task, the
  held pause state and `stoppedForStrict` untouched, and the row as it
  was. The latch is checked **before** the gate: with the latch set the
  gate is not called. With a gate that allows, they run as before. `attach()`, `park()`
  and `pause()` do not call it. *Catches:* a gate that runs after the
  pause state was dropped or the `downloading` row was written (the
  refusal would destroy a kept download); a gate called before the
  latch.
- **T-C21b — Refusal, release, resume.** From a kept pause state P, a
  strict stop sets the latch; `resume()` returns `refused`; the row is
  still `paused` with P; `releaseStrictStop()`; `resume()` then resumes
  from P (the fake sees `fromSavable(P)`). *Catches:* a refusal that
  drops P; a release that does not release.
- **T-C22 — `attach()`.** A live transfer: `attached` with the snapshot,
  one task ever constructed, no write. Phase `completed` or `failed`
  for the model: reported. A transfer that settled or was stopped after
  `load()`: `not-live`, with no task created and no write, and a
  following `resume()` is the caller's choice. *Catches:* an attach that
  starts a transfer (it would skip the network check, P1).
- **T-C23 — A lost cancel** (F11, drop-cancel mode, the real
  `NetworkTasks.js`), run for each `driver.platform`. **iOS.** `start()`
  then `abandon()` at once: the fake erases the cancel, and processes the
  `release()` after the queued start as the native main queue does.
  `task.release()` is called exactly once, straight after `cancel()`, with
  no progress event needed; no listener is added; the fake's transfer
  stops; `task.cancel()` is **not** called a second time (it is a no-op,
  asserted on the fake's native `cancel` count: one call). **Android.** The
  same start and abandon: the guard listener, added through
  `task.addListener('progress')`, calls `task.release()` exactly once on
  the first event, and the fake stops; the listener is removed; native
  `cancel` was called once. A cancel that takes effect (the fake's normal
  mode) leaves no progress, and the listener is removed in the retired
  promise's `.then` handler, so nothing stays behind. The normal mode allows **one**
  progress event that was emitted before the cancel and delivered after it
  (a false positive): the test asserts only that `release()` is called at
  most once and that nothing else changes. **Both platforms.** A
  `pause-failed` cancel (T-C5's setup): the cancel comes long after the
  start, so the fake is set to erase the next `cancel()` (the mode in the
  fake's description), and the same guard behavior is asserted. A progress
  event from the retired generation never reaches subscribers, never
  writes and never changes the phase. *Catches:* no guard (a hidden
  transfer, F11); a guard that calls `cancel()` again (a silent no-op); on
  Android, a guard that calls `release()` with no event; on iOS, one that
  waits for an event that may never come; a listener that leaks after a
  settle; one that survives `cancel()` only because the test stubs the
  task.
  **Platform mapping.** The exported pure helper `transferPlatform(os)`
  returns `'ios'` for `'ios'` and `'android'` for `'android'` and
  `'web'`. The test calls the helper. *Catches:* a mapping that sends
  web (or any non-iOS platform) to the iOS guard, which waits for an
  event a stub task never emits.

**Hub machine** (`__tests__/modelHubMachine.test.ts`, a new
`describe('download controller')` block):

- **T-H1 — #127, foreground.** `APP_BACKGROUND`, then `APP_FOREGROUND`
  before the pause settles, then the pause settles with P: the machine
  goes `pausing` → `confirmingNetwork`, and on Wi-Fi the controller
  resumes from P (the fake sees `fromSavable(P)`). *Catches:* leaving
  `pausing` on `APP_FOREGROUND` (today's drop).
- **T-H2 — #127, Resume** (S2). While `pausing`, the screen shows no
  Resume, and a `RESUME` sent anyway is ignored. Once `paused`, Resume
  resumes from P. *Catches:* accepting `RESUME` in `pausing`.
- **T-H3 — #132.** `PAUSE`, then the pause fails: the machine is
  `failed`, the snapshot's phase is not `active`, and `cancel()` ran.
  `RETRY` with the kept pause state goes to the check. *Catches:* a
  `failed` reached with the transfer still active.
- **T-H4 — Completion during a pause** (S4, both orders: T-C3's and
  T-C4's). `PAUSE` → `pausing` → `verifying` → `smokeTest` →
  `complete`. No `paused` write and no "Could not pause". *Catches:*
  mapping `completed` to `failed` or to `paused`.
- **T-H5 — The hub closes mid-pause.** `actor.stop()` while `pausing`:
  the pause still completes in the controller, and the row is `paused`
  with P. A new actor restored from `load()` is `paused`, and Resume
  resumes from P. *Catches:* tying the pause to the hub actor.
- **T-H6 — Reopen with a live transfer** (S5, OQ-1). Close the hub
  mid-download, then build the layout's restore from `load()`: the
  machine is `downloading`, one task was ever constructed, progress is
  seeded, there is no `checkNetwork` call, and Pause works. Two more cases,
  both with the transfer ending between the layout's `load()` and the
  hub's first call. A transfer that **fails** leaves phase `failed`, so
  `attach()` reports `failed` and the hub goes to `failed` through `FAIL`,
  with no check and no new task. A transfer that is **stopped** (an
  unrequested null) leaves phase `paused`, and its settle step was queued
  before the attach, so `attach()` reports `not-live`: the hub goes to
  `confirmingNetwork` with the continuation, creates no task before the
  check passes, and (cellular) shows the prompt. (A stop that lands after
  the attach reaches a hub already in `downloading` as `TRANSFER_STOPPED`
  with reason `unrequested`, which T-H9 covers.) A snapshot of
  phase `completed` restores to `checkingExisting` and runs verify, with
  no check and no task (H9b). *Catches:* restoring through
  `checkingExisting` (a second task, or a check); a `start()` in the live
  restore (a task with no check); sending a finished file through the
  network check.
- **T-H7 — The at-rest invariant, by graph.** Over every state node of
  the machine (`xstate/graph`, exported by the installed `xstate`
  5.33.3), excluding the root's `SET_DISPLAY_NAME`:
  - **Invokes.** Only `downloading` invokes `runDownload`. The machine's
    **only root-level invoke** is `controllerEvents`, and no state node
    invokes it. `pausing` invokes `pause` and nothing else.
  - **Edges into `downloading`** (a closed list, asserted by source
    state and event): `confirmingNetwork` (the network check's `onDone`
    with `wifi`); `cellularConfirm` (`CELLULAR_CONFIRM`); and `selecting`
    (`RESTORE_DOWNLOAD` with `live: true`, H9). These are today's two
    edges (`modelHubMachine.ts:441` and `:464` at `8f5f484`) and the one
    new one.
  - **Edges out of `downloading`** (a closed list): `PAUSE` and
    `APP_BACKGROUND` → `pausing`; `REFUSED` → `pausing` (H1);
    `DOWNLOAD_COMPLETE` → `verifying`; `FAIL` → `failed`;
    `TRANSFER_STOPPED` → `paused` (H13); `NOT_LIVE` →
    `confirmingNetwork` (H9); and `DOWNLOAD_PROGRESS` (self).
  - **`pausing`** has no transitions except its `onDone`, its `onError`,
    the `resumeOnSettle` self-updates and the `TRANSFER_STOPPED`
    self-update (reason `strict`, H3).
  - **`paused`** has the `TRANSFER_STOPPED` relabel (H5) in addition to
    today's.
  - **`TRANSFER_STOPPED` is handled in exactly** `downloading` (H13),
    `pausing` (H3), `paused` (H5), `confirmingNetwork`, `cellularConfirm`
    and `awaitingWifi` (H15), and in no other state.

  *Catches:* any new edge from `downloading` or `pausing` to a state at
  rest, such as restoring today's `PAUSE` → `paused`; a second root
  invoke; a `stopped` handler that no subscriber can reach (a
  `runDownload`-only subscription, MAJOR-1's class).
- **T-H8 — A failed save does not move the hub** (D1). A declined
  restore with a failing `paused` write: the machine is `paused`, not
  `failed`. After the store recovers, the next operation writes `paused`
  first. *Catches:* routing `rowSaved: false` to `failed`.
- **T-H9 — `TRANSFER_STOPPED`** (OQ-5). With a **live hub**,
  `stopForStrict()` under a running machine: `paused`, reason `strict`,
  the stop's pause state, no second `pauseAsync`, and a later
  `APP_FOREGROUND` stays `paused`. The event reaches the hub through the
  root `controllerEvents` subscription, not through `runDownload`
  (asserted: `controllerEvents` subscribed once, and the same
  subscription delivers the event whether the hub is in `downloading`,
  `pausing` or `paused`). A `stopped`
  with reason `unrequested` under a running machine goes to `paused`
  with reason `user`. A `stopped` for another model id is ignored.
  *Catches:* auto-continuing a strict pause; a double pause; mapping
  every stop to `strict`; a subscription that dies with `runDownload`;
  a missing model guard.
- **T-H9b — Strict stop interleaved with the hub's pause.** Four cases,
  each with a live hub and the real controller.
  1. **Join.** `stopForStrict()` while the machine is `pausing` from
     `PAUSE`, and again from `APP_BACKGROUND` (the controller's `pause()`
     is queued or running): the `stopped` event reaches the hub in
     `pausing`, and the machine ends `paused` with reason `strict` (not
     `user` or `background`), one `pauseAsync` ran, and a later
     `APP_FOREGROUND` stays `paused`.
  2. **After return, with `resumeOnSettle` set, and the strict stop
     reaches a network state.** The hub's pause returned `paused`, and
     because an `APP_FOREGROUND` set `resumeOnSettle` the hub is in
     `confirmingNetwork`. Then `stopForStrict()`: the hub ends `paused`
     with reason `strict`, no cellular prompt is shown and no task is
     created. Repeat with the machine in `cellularConfirm` and in
     `awaitingWifi`.
  3. **After return, with `resumeOnSettle` set, and the network check
     wins.** The check resolves first, the hub is in `downloading`, and
     its `resume()` is queued behind `stopForStrict()`. The strict stop
     runs, the `resume()` returns `refused`: **one task is ever
     constructed**, the hub ends `paused` with reason `strict`, the row
     is `paused` with P, and the latch is set. Repeat with the `resume()`
     queued **ahead** of the `stopForStrict()` and not yet begun: the
     latch was set on arrival, so it also returns `refused`, with the
     same end state.
  4. **After return, without `resumeOnSettle`.** The hub is `paused`
     (reason `user` or `background`) when the `stopped` event arrives: it
     is relabelled `strict`, and a later `APP_FOREGROUND` stays `paused`.
  (The relative order of the `stopped` event and the `onDone` in
  `pausing`, after `pause()` returned, depends on microtask counts: the
  Promise wrapper in XState's `fromPromise`
  (`xstate/dist/xstate-actors.cjs.js`) against the queue's internal
  `load()` await. The spec does not specify it, so no case asserts it:
  cases 1 and 4 assert the end state, `paused` with reason `strict`, which
  H3 guarantees in either order.) *Catches:* a join that
  hands the hub a shape it cannot map (a stuck `pausing`); a strict pause
  that the foreground then continues; a network state that ignores the
  stop; a queued `resume()` that creates a task behind a strict stop.
- **T-H10 — #125's suites stay green** (P1–P13): the `describe('continued
  downloads ask before using cellular data (#124)')` block,
  `modelHubLayoutRestoreCellular.test.tsx`,
  `modelHubDownloadNetworkStates.test.tsx`,
  `cellularConfirmClose.test.tsx`,
  `modelHubDownloadSmokeFailed.test.tsx`, `modelHubImport.test.tsx`, the
  `resumeDownload partial guard` block in `modelDownloadService.test.ts`,
  `useModelHub.test.ts` and `modelFiles.test.ts`. Their mocks move to
  the controller's API. Tests that render the real layout
  (`modelHubLayoutRestoreCellular.test.tsx`) override the controller with
  `jest.mock('@/services/modelDownloadController')` and a getter that
  returns a controller built on the fake driver. Their assertions change only as D1, D4 and D6
  say (D4 lists the rewritten tests).

- **T-H11 — A refusal.** With the latch set (or with a refusing gate),
  the hub in `downloading` gets `refused` from `start()` and from
  `resume()`: it goes `pausing` with reason `strict`, calls `pause()`,
  and ends `paused` with reason `strict`. The row is never written
  `downloading` by the refusal (on phase `none` it is written `paused`),
  there is no `failed` and no "Check your connection". After
  `releaseStrictStop()` and a `RESUME` through the network check, the
  download starts. *Catches:* mapping `refused` to `failed`; a `park()`
  in place of the pause (a `downloading` row under strict, #117 R10a).

**Ownership and screens:**

- **T-own** (`__tests__/downloadOwnership.test.ts`). It scans `src/`:
  only `src/services/modelDownloadService.ts` imports `DownloadTask`;
  only `src/services/modelDownloadController.ts` imports the service's
  start and resume functions or `createModelDownloadStateStore`; and
  `src/machines/modelHubMachine.ts` imports neither. The scan
  matches `import … from`, `import * as`, side-effect imports, dynamic
  `import()`, `require(...)` and re-exports (`export … from`), so a
  namespace import or a re-export cannot bypass it. *Catches:* a second
  actor that starts transfers or writes the row (the Survey's class of
  bug).
- **T-S1** (`download.tsx`, testID-based). `pausing` shows "Pausing…"
  with no Pause and no Resume. `paused` shows Resume. *Catches:* Resume
  visible before the pause settles.
- **T-S2** (`index.tsx`). `pausing` is in `INSTALL_STATES`: focusing the
  list while `pausing` pushes the download screen. *Catches:* a
  missing entry, which would strand the list without the download
  screen.
- **T-S3** (`_layout.tsx`). A `load()` that rejects shows the error and
  a Retry button (no endless spinner). Retry runs again, and after a
  successful read the hub restores (the controller reopens the database,
  see T-C12). The layout never retries on its own: with a rejecting
  `load()`, no second call happens until Retry is tapped. *Catches:* a layout with no `catch`
  (a spinner forever, M7).

## Verification

Automated, required for `Implemented`:

- [x] `npx tsc --noEmit` clean.
- [x] `npm run lint` shows no new errors (warnings as on `main`).
- [x] `npx jest --maxWorkers=2`: every suite passes, including T-C1 to
  T-C23, T-H1 to T-H11, T-own, T-S1, T-S2 and T-S3.
- [x] RED first, as a requirement of the implementation plan: the
  plan writes the reproductions **against #125's service and machine**
  (`fix/download-cellular-continuation`, head `8f5f484`; the controller
  does not exist yet), driving the old API through `pauseDownload` and
  the old `ModelHubApi` mocks. They cover S1 to S4 (T-H1, T-H2, T-H3 and
  T-H4's scenarios), and T-H6 (S5) against the old restore. They must
  fail on #125, and the PR records the failing output. T-C3 and T-C5
  are controller tests with no #125 equivalent: they are covered by the
  S4 and S3 reproductions, and each controller test is also run against
  its named mutation (the Catches line) to show it can fail.

On-device, the user's to run when they choose. They never block:

- [ ] Android: start a download on Wi-Fi, background the app, and
  bring it back within a second. It resumes from where it was (the
  progress bar does not drop to zero) (#127).
- [ ] Android and iOS: tap Pause, then tap Resume as soon as it shows.
  The download continues from where it was.
- [ ] Android: close the hub mid-download, then reopen it. It shows the
  same download running, with progress, and no second download (S5).
- [ ] Android and iOS: Pause in the last seconds of a download. It goes
  on to "Checking the model runs on this device…", not to "Could not
  pause".
- [ ] iOS: Pause during a download on the background session. Progress
  is kept: trailing progress after `cancelByProducingResumeData` does not
  trigger the F8 re-issue.
- [ ] iOS: background during a download, return, and check that the
  download continues behind the network check (P1), on Wi-Fi and on
  cellular.

## Version cost

MINOR, 9.2.0 → 9.3.0, in `package.json`, `app.json` and the
`package-lock.json` root. JS-only: no native module, no config plugin,
no permission change. The PR touches `modelDownloadState.ts` not at all:
the open-failure fix lives in the controller (Row writes and the failed-save rule). The runtime version derives from the MAJOR, so it
stays on the installed island. MINOR, not PATCH, because user-visible
download behavior changes (D4 adds a Pausing state, and D5 attaches on
reopen) and a new module takes over ownership. That is the lead's
classification, and VERSIONING.md would also allow PATCH for the
bug-fix part. This lands after #125 and the other 9.2.1 PRs (#114,
#120). If another MINOR merges first, the number is bumped again. #131
(engine 9.5.3) also targets 9.3.0: whichever of #131 and this PR merges
second re-bumps to 9.4.0 (or the next free MINOR). Check `origin/main`'s
version when un-drafting.

## Open questions

None. All eight were answered by the owner on 2026-11-21.

## Resolved: owner rulings

Each ruling below is binding on the design and the tests above.

- **OQ-1 — Reopening the hub while a transfer is running.** Ruled
  (owner, 2026-11-21): reopening attaches to the running transfer (H9),
  with no network check. It does not pause and continue (#117 R10b).
- **OQ-2 — A download that completes during a background pause.** Ruled
  (owner, 2026-11-21): verify and the smoke test run at once.
- **OQ-3 — A watchdog on the pause.** Ruled (owner, 2026-11-21): the
  watchdog is 30 s, after which the pause counts as failed (cancel, then
  "Could not pause the download").
- **OQ-4 — A failed row write.** Ruled (owner, 2026-11-21): accepted.
  The hub stays `paused` and the write is retried (D1).
- **OQ-5 — `stopForStrict()` and `TRANSFER_STOPPED`.** Ruled (owner,
  2026-11-21): built in #133. Nothing calls it until #117.
- **OQ-6 — The Pausing state's copy.** Ruled (owner, 2026-11-21): the
  `pausing` screen shows "Pausing…" with no buttons.
- **OQ-7 — The import's commit-failure corner** (D6). Ruled (owner,
  2026-11-21): accepted. If an import commit fails, the same-session
  re-pick starts over.
- **OQ-8 — iOS foreground sessions.** Ruled (owner, 2026-11-21): the
  iOS foreground session (`sessionType: 'foreground'`) stays in #117.
