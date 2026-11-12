# Spec: iOS model memory and download restore

**Status: Reviewed** — 2026-11-12 (user-approved). One PR carries spec + plan + implementation
+ version bump; `plan.md`/`LEDGER.md` are transient and deleted in the
same-PR cleanup commit (AGENTS.md SDD workflow).

## Why this cycle exists

User report 2026-11-12 (iPad Air 3rd gen, 3 GB RAM, iPadOS 26.7.2,
TestFlight 8.0.1 build 5): the app closed the moment Fast & Light
finished downloading. On reopening, tapping Resume showed
`Cannot restore task: DownloadPauseState has no resumeData`.

Two separate problems sit behind that report.

**1. The device ran out of memory.** The Jetsam report for the kill
(`JetsamEvent-2026-11-12-132710.ips`, binary UUID matched to the 8.0.1
build 5 archive) shows:

| Measure | Value |
| --- | --- |
| Kill reason | `vm-pageshortage` (whole device out of pages) |
| Usable RAM | about 2.83 GiB |
| Wired (pinned, cannot be evicted or compressed) | 2.18 GiB |
| Free | 21 MiB |
| App footprint | 1.23 GiB, of which 1.11 GiB already compressed |
| Processes killed | 116, the app last |

The reason is not `per-process-limit`, so the app was under its own
limit and the `increased-memory-limit` entitlement would not have
helped. That proposal is dropped.

The smoke test loads the model the moment the download verifies, with
`use_mlock: true` (pins the 2.21 GiB weights) and all layers on Metal
(maps the same weights for the GPU). Pinned weights are the likely
source of the 2.18 GiB wired. This is a reading of the report, not a
proven cause: the report cannot separate `mlock` from Metal.

The weights (2.21 GiB) plus the app's other memory (1.23 GiB) come to
about 3.45 GiB against 2.83 GiB of RAM. Fast & Light cannot be fully
resident on a 3 GB device under any configuration.

**2. Restore after an interrupted download is broken.** Read from the
code on `main` at `d8cd194`:

- A pause that produced no resume data is saved anyway
  (`modelDownloadService.ts` `pauseDownload`), and resuming from it
  throws. Retry then resumes from the same record and throws again.
- Restoring a paused download re-enters the `paused` state, which
  invokes `pauseTask` with no active download. That throws, and the
  state has no error path.
- `verifying` and `smokeTest` are never persisted, so a launch after a
  crash in the smoke test restores as `downloading` with no pause state
  and downloads 2.4 GB again over a complete file (confirmed for the
  iOS download task; Android not checked).
- A smoke test whose model load throws deletes the downloaded file
  (`modelSmokeTest.ts`), while one whose completion fails keeps it and
  returns to the list with no way to remove it. Picking a different
  model then leaves the 2.4 GB file orphaned, because retiring only
  deletes the stored current model.
- `inactive` (Control Center, notification shade, iPad multitasking)
  pauses the download the same as `background`.
- `pauseTask`, `verifyTask`, `smokeTestTask` and `checkNetworkActor`
  have no `onError`.
- The smoke-failure message recommends Fast & Light even when Fast &
  Light is the model that failed.

## INTENT check

No conflict.

- Rule 2 (inference is bring-your-own; model choice is explicit and
  user-controlled): the memory check warns and lets the user continue.
  It never hard-blocks a model.
- Rule 5's reasoning (RAM on a phone is finite) is the same constraint
  this cycle acts on.
- Rule 10: the change is JS/TS only, so it stays OTA-safe.

## Goals

- A device that cannot hold a model fails with a message, not an app
  kill, and does not fail again on every launch.
- The user is told before a multi-gigabyte download that the model is
  larger than their device comfortably runs.
- iOS stops pinning model weights, and low-memory iOS devices load the
  model with a smaller working set.
- An interrupted download always ends in one of: resumed, restarted, or
  a failure the user can act on. A complete file is never downloaded
  twice.

## Non-goals

- Making Fast & Light usable on 3 GB devices. This cycle makes it safe;
  whether it is usable there is a measurement taken during verification.
- Android load configuration. There is no Android evidence; `useMlock`
  and CPU-only inference stay as they are on Android.
- The `increased-memory-limit` entitlement, or any native change.
- A smaller third model for low-memory devices.

## Anti-goals

- Hard-blocking a model the user chose.
- Automatically retrying a load that killed the app.
- Deleting a complete 2.4 GB download without the user asking.

## Approaches

1. **Low-memory configuration plus a RAM warning** (chosen by the user,
   2026-11-12). Costs more work and cannot promise the 3 GB iPad ends up
   usable, but keeps 3–4 GB devices in play and warns before the
   download.
2. **Gate only**: block Fast & Light under about 4 GB. Simple, but
   leaves the iPad Air 3 with no model and contradicts the spirit of
   INTENT rule 2.
3. **Raise the per-app limit by entitlement**: ruled out by the Jetsam
   report. The device ran out, not the app's allowance.

## Requirements

### Part A — memory

**A1 — One place decides how a model loads.** A single pure function
takes the model's manifest config, the platform, and the device's total
RAM, and returns the effective load parameters. `runModelSmokeTest` and
`createLlamaProvider` both use it, so the smoke test always loads the
model exactly as real use will. Today each applies its own defaults,
and they differ: the provider falls back to a 4096 context, the smoke
test has no fallback. Custom imports go through the same function with
their existing 4096 context.

**A2 — iOS never pins weights.** On iOS the effective `use_mlock` is
`false` for every model, curated or custom, whatever the manifest says.
Android is unchanged.

**A3 — Each curated model declares the RAM it is comfortable on.** The
manifest gains one field per model for this. The comparison uses
`Device.totalMemory` from `expo-device` (already a dependency) and must
allow for devices reporting less than their nominal size.

| Model | Comfortable on | Treated as below when reported RAM is under |
| --- | --- | --- |
| Fast & Light | 6 GB devices | 5 GiB |
| Smarter & Slower | 8 GB devices | 7 GiB |

When `Device.totalMemory` is `null` (web, or unknown), behavior is
exactly what it is today.

**A4 — Warning before download.** When the device is below the model's
comfortable RAM, selecting the model shows a warning with Cancel and
Continue, using the existing warning card. The warning names the
consequence in plain words (may be slow, may fail to load). When RAM is
known and sufficient, no warning shows, including for Smarter & Slower,
whose warning is unconditional today.

**A5 — Low-memory profile on iOS.** When the device is below the
model's comfortable RAM on iOS, the model loads with a smaller working
set. Two levers, applied in this order, each only if it clears its
check:

1. Quantized KV cache (`cache_type_k` / `cache_type_v` = `q8_0`, with
   `flash_attn_type: 'on'`). Check: llama.rn 0.12.9 accepts the values on
   Metal and the smoke test passes on the simulator or a device.
2. Context reduced from 8192 to 4096 tokens. Check: the largest prompt
   the app sends (chat answer with retrieved notes, librarian, heal)
   plus `LLM_MAX_PREDICT_TOKENS` (2048) fits in 4096. The wiki engine
   sizes batches by output tokens only and does not know the context
   size, so this must be bounded, not assumed. The bound is worst
   case, not user data: for each of the three prompt types, the maximum
   size derivable from the app and the wiki engine's source (chat sends
   at most 8 retrieved notes), converted at 3 characters per token,
   plus 10% margin. If any of the three cannot be bounded or does not
   fit, this lever is not applied and the LEDGER records why.

A5 applies to curated models only. Custom imports have no declared RAM
figure and get A1 and A2 only. The fit arithmetic above holds with or without pinning, so A5 does not
depend on A2 turning out to be the whole cause.

**A6 — Smoke-failure copy is truthful.** The message for a failed smoke
test never recommends the model that just failed. When the failure was
an app kill during the test (B5), or the device is below the model's
comfortable RAM, it says the device most likely ran out of memory.

### Part B — download restore

**B1 — Resume without resume data restarts.** A pause state with no
`resumeData` is treated as no pause state at every boundary: when
saving, when reading a saved record (so records written by 8.0.1 are
repaired on read), and when resuming. Resume then restarts the download
from the beginning instead of throwing.

**B2 — Restoring a paused download does not pause again.** A restored
paused download waits for Resume without invoking the pause task.

**B3 — Only `background` pauses.** `inactive` no longer sends
`APP_BACKGROUND`.

**B4 — A complete file is never downloaded again.** On restore, and
before starting any download for a model, a file on disk that passes
`verifyDownload` goes straight to the smoke test.

**B5 — Every smoke failure ends in the same place, and a load that
killed the app is not retried automatically.** A curated model's smoke
test can fail three ways: the load rejects, the completion fails, or
the app is killed. All three end in one smoke-failed state with the A6
message and two actions:

- **Try again** — runs verify and the smoke test on the file already on
  disk. No download.
- **Choose another model** — deletes that file and returns to the list.

The smoke test itself no longer deletes the file. To detect the kill,
the hub persists a `smoke-testing` status before the test starts; a
launch that finds it treats the test as failed. The smoke-failed state
is persisted too (`smoke-failed`) and restored on every later launch
until the user takes one of the two actions, so the app never returns
to a plain list with a hidden 2.4 GB file.

`status` is a `TEXT` column, so no schema change is needed. A bundle
that predates this cycle ignores the new values.

Custom imports run their smoke test outside the hub machine and are not
covered by B5; A2 removes pinning for them.

**B6 — Every invoked task has an error path.** `pauseTask`,
`verifyTask`, `smokeTestTask` and `checkNetworkActor` each end in a
state the user can act on, with a message, when they reject: the failed
or smoke-failed state for tasks that run on the download screen, and
the list with its error banner for the network check, which runs before
the download screen is shown. The hub actor never stops
on an unhandled error.

**B7 — No orphaned model files.** When the user starts installing a
model (curated download or custom import), any curated model file on
disk that is neither the current model nor the one being installed is
deleted.

## Version

JS/TS only, with a user-visible addition (the RAM warning), so MINOR
under docs/VERSIONING.md. The number is the next MINOR above `main` at
merge time: 8.1.0 today, 8.2.0 if #106 merges first, 9.1.0 if #107 has
merged. It ships over the air to installed binaries.

## Verification

Automated (TDD, each written failing first):

- A1–A3, A5: unit tests on the load-parameter function across platform,
  RAM and model.
- A4: hub screen test for warning shown / not shown by RAM, and the
  `null` fallback.
- B1–B7: machine tests for each restore path, including a saved 8.0.1
  record with no `resumeData`, a complete file on disk, and a
  `smoke-testing` or `smoke-failed` status at launch, and each of the
  three smoke-failure modes; service tests for `pauseDownload`
  and `resumeDownload`.
- `npm test`, type-check and lint clean.

On device (user, iPad Air 3). Delivery of any build or update needs the
user's go-ahead each time.

1. **Full change.** Fast & Light downloads, and the smoke test either
   passes or fails with the A6 message. The app is not killed twice in
   a row: a second launch after a kill shows the B5 failed state.
2. **Restore.** Pause, kill the app, relaunch, Resume: the download
   resumes or restarts, with no error. Open Control Center mid-download:
   the download keeps going.
3. **Usability measurement.** If the smoke test passes on the 3 GB
   iPad, record time-to-first-token and tokens per second for one chat
   answer, so the warning copy can say something true.

## Decisions (user, 2026-11-12)

- A3: warning 4 GB iPhones is accepted. Fast & Light warns and loads
  the low-memory profile on 3 GB and 4 GB devices.
- B5: the file is kept after a smoke failure and "Try again" is
  offered.
- No separate pinning-only device round. The full change is the first
  delivery. If the app is still killed, the new Jetsam report decides
  the next step: high wired memory again points at Metal, and fewer GPU
  layers on low-memory devices becomes a new requirement that comes
  back to the user before it is built. A success does not show whether
  A2 or A5 made the difference; that is accepted.

## Left to the builder

- Names, file placement, and the exact shape of the manifest field.
- Warning and failure copy, within A4 and A6.
- Whether B5's two actions reuse the existing failed screen or extend
  it.
