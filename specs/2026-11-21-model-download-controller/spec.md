# Spec: one model download controller owns every transfer

**Status: Draft** — 2026-11-21. Spec only. The owner answered all eight
open questions on 2026-11-21 (see Resolved: owner rulings); review is
next. The plan and the implementation wait for the owner's approval
(AGENTS.md lifecycle).
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
chose (2026-11-21) to stop patching the privacy spec (relayed by the lead,
2026-11-21) and give model downloads **one owner**: a model download controller that runs one
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
  transfer can keep running unseen behind a Paused screen (S4, S5).
- **Rule 11 (strict privacy: no model downloads, no exceptions; nothing
  may act before the mode is honored).** The controller does not build
  strict privacy. It makes it buildable: it is the only code that may
  create a `DownloadTask` (I1, T-own), so #117 has one place to gate.
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
  `createModelDownloadStateStore` instance, opening the database lazily
  on first use, and every row write in the app goes through it (I4).

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
};
```

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
  are complete before the next operation starts (I3).
- **Joins.** A `pause()` for a transfer while a pause of that same
  transfer is queued or running returns the same promise. A `start()`
  or `resume()` for the model whose transfer is live attaches to it
  and never creates a second task.
- **No re-entry.** An operation never awaits another queued operation.
  Listeners are called inside the operation that emits, after its
  state change. Anything a listener queues runs after that operation.
- **Native settlement is queued too.** When a transfer's promise
  settles on its own, the controller queues a `settle` step for that
  generation. A step whose generation is not the live one is dropped.
  So a completion, a failure and a user pause can arrive in any order,
  and each is handled whole. The step for a resolved file sets the
  phase to `completed` and emits `completed`. The step for a rejection
  sets `failed`, drops the pause state and emits `failed`. A `null`
  result the controller did not ask for (no pause in progress) is
  handled as the `paused` branch of the pause procedure.
- **Progress is not queued.** It is passed to subscribers straight away,
  only for the live generation while the phase is `active`.

### The pause procedure

`pause()` and `stopForStrict()` share this procedure when a transfer is
`active`:

1. Ask for the pause (`task.pauseAsync()`) and wait for it to settle,
   fulfilled or rejected. A watchdog bounds the wait (OQ-3: 30
   seconds).
2. Branch on `task.state`, never on whether the call threw (F2):
   - `paused`: the pause state is `normalizePauseState(task.savable())`.
     Write the row `paused` with it, and set the phase to `paused`.
     Result: `paused`.
   - `completed`: the download finished during the pause. The phase
     becomes `completed`, and nothing is written (the row stays
     `downloading`, as it does today after a completion). Result:
     `completed`.
   - `error`: the transfer failed during the pause. The phase becomes
     `failed`, and the pause state is dropped (P12). Result: `failed`,
     with the classified code and message.
   - `active` (the pause failed, and the transfer is still running), or
     the watchdog fired: `task.cancel()`. The transfer is treated as
     ended at once, and its promise is not awaited (F4). The phase
     becomes `failed`. The pause state the transfer started from is
     kept, as `failed` keeps it today. Result: `pause-failed` (#132).
3. `savable()` is called only when `task.state === 'paused'` (I5).

### Row writes and the failed-save rule

- Every write sets the whole row (the store's upsert). Writing the same
  row twice is harmless, so a write can always be retried.
- Every write is awaited inside the operation that makes it. The store
  keeps its own write queue as a second guard.
- **When a write fails**, the operation does not fail. Its result
  carries `rowSaved: false`. The controller keeps the row it asked for,
  and writes it again before the next operation's own write and on the
  next `load()`. A newer row that lands replaces it. The in-memory
  record stays the truth for the rest of the process. Hub transitions
  never depend on `rowSaved`. Only a caller that needs to know, such as
  the import's `rowCleared`, reads it (D1, OQ-4).
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
| `load(): Promise<ControllerSnapshot>` | none | The first call in a process reads the row: `downloading` becomes phase `none` with its pause state (null, P9); `paused` becomes `paused`; any other status becomes `none` with that row. Later calls reuse the in-memory record. Each call writes any pending row again. | The snapshot is the truth for this process. No transfer was started. It rejects only when the first read fails, as `store.get()` does today. |
| `snapshot(): ControllerSnapshot` | none | sync read | — |
| `subscribe(listener) → unsubscribe` | none | Events: `progress`, `completed`, `failed`, `stopped` (strict). Each carries the model id. | — |
| `readRow(): Promise<Row \| null>` | none | Queued read of the row as last asked for. It replaces `readDownloadModelId` and the sweep's `store.get()`. | It reflects every earlier operation. It rejects only when the row was never loaded and the read fails. |
| `start(modelId)` | No live transfer for another model (else it rejects with `TransferInFlightError`). A record for another model with no live transfer is replaced. | Live for this model: attach. Phase `completed` for this model: report it. Otherwise: drop any held pause state, write `downloading` (pause state null), and create a fresh task. | `started` (a task exists and is `active`), `attached`, `completed` or `failed` (the start threw). `rowSaved` says whether the write landed. |
| `resume(modelId)` | as `start` | Like `start`, but it resumes from the held pause state when that has resume data (the P7 guard stays in the service), and otherwise starts fresh. | `resumed`, `started`, `attached`, `completed` or `failed` |
| `pause(modelId)` | The record is for this model or for none (else it rejects with `TransferInFlightError` or `WrongModelError`). | `active`: the pause procedure. `paused`: no-op. `completed` or `failed`: reports it. `none`: **park**, writing the row `paused` with the held pause state (P2, P3). | **No transfer is in flight.** `paused` (pause state, `rowSaved`), `completed`, `failed` or `pause-failed` |
| `abandon()` | none | Cancels a live transfer (F4: no await), clears the row, and forgets the record. It deletes no file: the sweeps do that, as today (P5, P6, P8). | No transfer is in flight, the record is empty, and `rowSaved` says whether the clear landed |
| `record(modelId, status)`, where `status` is `'failed'`, `'smoke-testing'` or `'smoke-failed'` | No live transfer (else it rejects with `TransferInFlightError`: a programming error, which T-C11 tests) | Writes that status. `failed` keeps the held pause state, and the others write none, as today. A `completed` or `failed` phase becomes `none`. | The write was awaited. `rowSaved` says whether it landed. |
| `stopForStrict()` (OQ-5) | none | `active`: write `paused` with no pause state first (#117's kill window), then the pause procedure, then emit `stopped` (or `completed` or `failed`) to subscribers. Otherwise: nothing. | **No transfer is in flight.** `nothing-running`, `kept` (pause state), `not-keepable` (why: `no-resume-data`, `pause-failed` or `failed`), or `completed` (the row stays `paused` with none). |

`cancel` is not public. Every caller that stops a transfer needs a
defined end state: paused, abandoned or stopped for strict. A bare
cancel would leave the record's state for the caller to guess. The
pause procedure and `abandon()` cancel internally.

### Invariants

- **I1 — One transfer.** At most one `DownloadTask` is active in the
  process, and only the controller creates or holds it.
- **I2 — At rest, nothing is in flight.** A transfer can be in flight
  only while the hub is in `downloading` or `pausing`, or while no hub
  is mounted (P13). Every other hub state has none: `selecting`,
  `checkingExisting`, `retiringCurrent`, `confirmingNetwork`,
  `awaitingWifi`, `cellularConfirm`, `paused`, `failed`, `verifying`,
  `smokeTest`, `smokeFailed`, `customImport` and `complete`. This holds
  by construction: the hub leaves `downloading` only on a controller
  event that reports the transfer ended (`completed`, `failed` or
  `stopped`), or into `pausing`, and it leaves `pausing` only on the
  result of `pause()`, which guarantees no transfer.
- **I3 — Operations run one at a time,** in FIFO order.
- **I4 — One writer.** Only the controller writes the download row.
- **I5 — `savable()` only on `paused`.**
- **I6 — Writes are idempotent and awaited,** and a failed one is
  retried (the failed-save rule).
- **I7 — Only `start()` and `resume()` start a transfer,** and only the
  hub's `downloading` state calls them.
- **I8 — A cancel is immediate,** and a late settlement of an older
  generation is dropped.

## The hub machine becomes a thin caller

Every change to `src/machines/modelHubMachine.ts` and its provider. The
plan may rename events and flags, but it may not change a row's source
states, target or effects.

| Row | Event or state | Source | Target | Effects |
|---|---|---|---|---|
| H1 | `downloading` | — | — | Entry no longer writes the row (`start` and `resume` do, before the task exists, which is today's queue order). `runDownload` subscribes for its model, then calls `resume(modelId)` when the context holds a pause state with resume data, and `start(modelId)` otherwise. Its results and events map to the same machine events as before: `completed` → `DOWNLOAD_COMPLETE`, `failed` → `FAIL`, and `attached` seeds progress from the snapshot. A new event, `TRANSFER_STOPPED`, comes from `stopped`. Cleanup only unsubscribes. It never pauses or cancels. |
| H2 | `PAUSE`, `APP_BACKGROUND` | `downloading` | `pausing` | `pausedReason` becomes `user` or `background`. `resumeOnSettle: false`. |
| H3 | `pausing` (new) | — | — | Invokes `pause(modelId)`. `onDone` by result: `paused` → the context's pause state takes the result's, then `confirmingNetwork` (with `continuation`) if the reason is `background` and `resumeOnSettle` is set, otherwise `paused`. `completed` → `verifying`, pause state null. `failed` → `failed`, as `FAIL` does today (P12). `pause-failed` → `failed` with "Could not pause the download. Try again.", pause state kept. `onError` (an invariant error) → `failed`, with the same message. With reason `background`, `APP_FOREGROUND` sets `resumeOnSettle` and `APP_BACKGROUND` clears it. Every other event is ignored, so `RESUME` cannot arrive (S1, S2). |
| H4 | Idle pauses | `confirmingNetwork` + `APP_BACKGROUND`; `cellularConfirm` + `APP_BACKGROUND`; `cellularConfirm` + `CELLULAR_CANCEL` (continuations only, as today) | `pausing` | Reason `background`, `background` or `restored`. With no transfer, `pause()` parks. This replaces `idlePause` (P2, P3). |
| H5 | `paused` | — | — | No invoke: `paused` is entered only once the pause has settled. `RESUME` and `APP_FOREGROUND` (reason `background`) → `confirmingNetwork`, as today. `idlePause` is removed. |
| H6 | `failed` entry | — | — | `record(modelId, 'failed')` replaces the unawaited write. It is queued, so a quick `RETRY` that starts a download is ordered after it (S6). |
| H7 | `smokeFailed` | — | — | Entry calls `record(modelId, 'smoke-failed')`. `CHOOSE_ANOTHER` calls `abandon()` in place of `clearDownloadState`. |
| H8 | `SELECT_MODEL` (different model), `IMPORT_SMOKE_OK` | as today | as today | `abandon()` replaces `clearDownloadState`. It is queued ahead of any later `start` or `readRow`, so the `checkingExisting` sweep sees the cleared row. |
| H9 | `RESTORE_DOWNLOAD` with `live: true` (new, guarded first) | `selecting` | `downloading` | The model comes from the event, with pause state null, `continuation: true` and progress from the snapshot. `start()` attaches. No network check: the transfer never stopped (OQ-1). |
| H10 | `RESTORE_DOWNLOAD` of a `paused` row | `selecting` | `paused` | As today. The controller already holds the pause state from `load()`. |
| H11 | `runSmokeTestAndCommit` | — | — | Its writes become `record(…)` calls and its clear becomes `abandon()`. A `smoke-testing` marker that did not land (`rowSaved: false`) throws before the load, as a rejected write does today (P10). |
| H12 | Context | — | — | `idlePause` is removed and `resumeOnSettle` is added. `pausedReason` gains `'strict'` (from `TRANSFER_STOPPED`, OQ-5). `pauseState` stays as a read-only copy, taken from controller results. It is used only to choose `resume` over `start` and for P12's guard. The controller never reads it. |
| H13 | `TRANSFER_STOPPED` (OQ-5) | `downloading` | `paused` | `pausedReason: 'strict'`, with the pause state from the event. `APP_FOREGROUND` never continues it, because its guard requires `background` (#117 R10d). |
| H14 | `ModelHubApi` | — | — | Drop `startDownload`, `resumeDownload`, `pauseDownload`, `persistDownloadState`, `clearDownloadState` and `readDownloadModelId`. Add `downloads`, the controller's public API, injected so tests can pass a controller built on a fake transfer driver. `deleteOrphanedModelFiles` reads `downloads.readRow()`. |

### Screens, provider, layout

- **`_layout.tsx`.** It no longer opens SQLite or creates a store. It
  awaits `smokeTestSettled()` as today, then
  `getModelDownloadController().load()`. A phase of `active` restores
  `{ status: 'downloading', live: true }`. Anything else goes through
  `toRestoreState` on the snapshot's row, as today. Its "unrestorable
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
  with its Resume button, appears only once the pause has settled.
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

## How #117 shrinks

With this controller merged, #117's Step 2 calls the controller and
stops re-specifying transfer ownership:

- **R10a (one pause owner)** becomes: strict calls
  `controller.stopForStrict()` from Settings or from the hub. The
  handle, `stoppedForStrict`, the stopped `PrivacyGateError`, "a cancel
  on request" and the owner's save order are all inside that call.
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
  note goes too.
- **Rows that stay, as thin calls:** M1 (relabel a settled `paused`);
  M3 (Turn on and remove: `abandon()`, then #117 deletes the partial);
  M4a (a refusal: #117 adds a gate to `start` and `resume` that returns
  `refused` and parks); M7 and M8 (M8's row rewrite is
  `pause(modelId)`, a park); M10; M11; R10g's Cancel (`start()` after
  #117's network decision).
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
its mutation is not acceptance. Controller tests use a fake
`DownloadTask` that reproduces installed `NetworkTasks.js` semantics:
`pause()` throws unless the task is `active`; `pauseAsync()` can resolve
with the task `completed`; `savable()` throws unless it is `paused`;
`cancel()` sets `cancelled` at once, and its promise can be made to
never settle (F1–F5). The tests drive the order in which native
promises settle. Hub tests run the real machine against a real
controller built on that fake and an in-memory store, except where a
row says otherwise.

**Controller** (`__tests__/modelDownloadController.test.ts`):

- **T-C1 — The queue.** A `pause()` issued while `start()`'s
  `downloading` write is still pending waits: the writes land in the
  order `downloading` then `paused`, and `pauseAsync` runs on the
  created task. *Catches:* removing the queue (the pause finds no task,
  or `paused` lands before `downloading`).
- **T-C2 — The join.** Two `pause()` calls during one pause: one
  `pauseAsync`, one `paused` write, and both promises resolve to the
  same result. *Catches:* no join (the second call's `pause()` throws
  under F1 and reports `pause-failed`).
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
  is retried. `load()` creates no task. *Catches:* re-reading over a
  newer in-memory truth; starting anything at load (rule 11).
- **T-C13 — The pause watchdog** (OQ-3, fake timers). `pauseAsync`
  never settles: after the bound, `cancel()` runs and the result is
  `pause-failed`. *Catches:* an unbounded wait that blocks the queue.
- **T-C14 — `stopForStrict()`** (OQ-5). The `paused` write with no
  pause state lands before `pauseAsync`. The outcomes `kept`,
  `not-keepable` (no resume data, failed pause), `completed` (the row
  stays `paused` with none) and `nothing-running` are each reached, and
  `stopped` is emitted to a subscriber. *Catches:* pausing before the
  first save; a missing outcome.

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
  seeded, there is no `checkNetwork` call, and Pause works. *Catches:*
  restoring through `checkingExisting` (a second task, or a check).
- **T-H7 — The at-rest invariant, by graph.** Over every state node of
  the machine (`xstate/graph`, exported by the installed `xstate`
  5.33.3): only `downloading` invokes `runDownload`, and its only
  transitions are `PAUSE` and `APP_BACKGROUND` → `pausing`,
  `DOWNLOAD_COMPLETE` → `verifying`, `FAIL` → `failed`,
  `TRANSFER_STOPPED` → `paused`, and `DOWNLOAD_PROGRESS` (self).
  `pausing` has no transitions except its `onDone`, `onError` and the
  `resumeOnSettle` self-updates. *Catches:* any new edge from
  `downloading` or `pausing` to a state at rest, such as restoring
  today's `PAUSE` → `paused`.
- **T-H8 — A failed save does not move the hub** (D1). A declined
  restore with a failing `paused` write: the machine is `paused`, not
  `failed`. After the store recovers, the next operation writes `paused`
  first. *Catches:* routing `rowSaved: false` to `failed`.
- **T-H9 — `TRANSFER_STOPPED`** (OQ-5). `stopForStrict()` under a
  running machine: `paused`, reason `strict`, the stop's pause state, no
  second `pauseAsync`, and a later `APP_FOREGROUND` stays `paused`.
  *Catches:* auto-continuing a strict pause; a double pause.
- **T-H10 — #125's suites stay green** (P1–P13): the `describe('continued
  downloads ask before using cellular data (#124)')` block,
  `modelHubLayoutRestoreCellular.test.tsx`,
  `modelHubDownloadNetworkStates.test.tsx`,
  `cellularConfirmClose.test.tsx`,
  `modelHubDownloadSmokeFailed.test.tsx`, `modelHubImport.test.tsx`, the
  `resumeDownload partial guard` block in `modelDownloadService.test.ts`,
  `useModelHub.test.ts` and `modelFiles.test.ts`. Their mocks move to
  the controller's API. Their assertions change only as D1 and D6 say.

**Ownership and screens:**

- **T-own** (`__tests__/downloadOwnership.test.ts`). It scans `src/`:
  only `src/services/modelDownloadService.ts` imports `DownloadTask`;
  only `src/services/modelDownloadController.ts` imports the service's
  start and resume functions or `createModelDownloadStateStore`; and
  `src/machines/modelHubMachine.ts` imports neither. *Catches:* a
  second actor that starts transfers or writes the row (the Survey's
  class of bug).
- **T-S1** (`download.tsx`, testID-based). `pausing` shows "Pausing…"
  with no Pause and no Resume. `paused` shows Resume. *Catches:* Resume
  visible before the pause settles.
- **T-S2** (`index.tsx`). `pausing` is in `INSTALL_STATES`: focusing the
  list while `pausing` pushes the download screen. *Catches:* a
  missing entry, which would strand the list without the download
  screen.

## Verification

Automated, required for `Implemented`:

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` shows no new errors (warnings as on `main`).
- [ ] `npx jest --maxWorkers=2`: every suite passes, including T-C1 to
  T-C14, T-H1 to T-H10, T-own, T-S1 and T-S2.
- [ ] RED first: T-C3, T-C5, T-H1, T-H2 and T-H6 each fail against the
  #125 code paths before the controller lands, and the PR records it.

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
- [ ] iOS: background during a download, return, and check that the
  download continues behind the network check (P1), on Wi-Fi and on
  cellular.

## Version cost

MINOR, 9.2.0 → 9.3.0, in `package.json`, `app.json` and the
`package-lock.json` root. JS-only: no native module, no config plugin,
no permission change. The runtime version derives from the MAJOR, so it
stays on the installed island. MINOR, not PATCH, because user-visible
download behavior changes (D4 adds a Pausing state, and D5 attaches on
reopen) and a new module takes over ownership. That is the lead's
classification, and VERSIONING.md would also allow PATCH for the
bug-fix part. This lands after #125 and the other 9.2.1 PRs (#114,
#120). If another MINOR merges first, the number is bumped again.

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
