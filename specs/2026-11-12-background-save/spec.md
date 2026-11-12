# Spec: background note save

**Status: Implemented** — 2026-11-12. One PR carries spec + plan + implementation
+ version bump (MINOR → 8.1.0, JS-only, OTA-safe); `plan.md`/`LEDGER.md`
are transient and deleted in the same-PR cleanup commit (AGENTS.md SDD
workflow).

## Why this cycle exists

User report 2026-11-12 (Pixel 6): adding a note takes many seconds, and the
app is unusable meanwhile. Investigation:

- Save calls `wiki.ingestDocument`, which runs on-device LLM fact
  extraction (up to `LLM_MAX_PREDICT_TOKENS` = 2048, CPU-only on Android)
  before the save resolves.
- The JS thread is **not** frozen (user confirmed: scrolling and Cancel
  work while "Saving…" shows). The editor holds the user on a disabled
  "Saving…" button until ingest finishes. The only way out is Cancel,
  which throws the save away.
- Secondary cost: `createLlamaProvider` always passes a per-token callback
  to `ctx.completion`. That switches on llama.rn's `emit_partial_completion`,
  which re-parses the whole output so far on the inference thread and
  posts it to the JS thread once per token. Outside Night Shift the
  callback does nothing.

## INTENT check

No conflict. Rule 4 limits the librarian and heal passes to Night Shift.
Save-time ingest is neither, and it still runs only while the app is in
the foreground. If the app goes to the background, the LLM context is
released (existing behavior). An in-flight save then fails and offers
Try again (R4), same as today.

## Requirements

**R1 — Save returns immediately.** Tapping Save puts the entry in a save
queue and closes the editor at once. The user can keep using the app.

**R2 — Queue, in order, one at a time.** Entries save in the order they
were added, one ingest at a time. Adding notes while a save runs never
drops an entry. (Today the machine ignores `START_SAVE` while
`ingesting`, which silently loses the second note.)

**R3 — Pending notes are visible.** The journal list shows each queued
entry above the saved notes, with its title and a status: "Saving…"
(in flight), "Waiting to save" (queued) or "Save failed". Pending rows
can't be opened (there's no fact to read yet). When a save succeeds,
the row leaves the queue and the list refetches, so the saved note shows
up in its place.

**R4 — Failures keep the text.** A failed save stays in the queue as
"Save failed" with its title and body kept. The existing themed dialog
("Save failed" + the error message) offers **Try again** (re-queue at the
back) and **Discard** (remove it). One dialog at a time, oldest failure
first. The rest of the queue keeps going while a failure waits.

**R5 — No cancel for an in-flight save** (user ruling 2026-11-12). Once
Save is tapped, the editor's Cancel no longer applies. Cancel in the
editor only closes an editor that hasn't been saved.

**R6 — The warning copy stays the same.** A save that succeeds with chunk
failures still shows "Saved with warnings" with the same copy, once per
entry. If several are waiting, they show one after another.

**R7 — The queue outlives the screen.** The queue lives in a provider
mounted with `JournalProvider` in the root layout, not inside
`JournalScreen`. Switching tabs or remounting the screen never loses a
queued save. The queue is in memory only: a queue that hasn't drained is
lost if the app process is killed. This is accepted; today's flow loses
it too.

**R8 — LLM calls run one at a time.** `createLlamaProvider` runs
`generateText` calls one after another (a promise-chain mutex), so a
background save, a chat question and Night Shift never call
`ctx.completion` at the same moment. That would make llama.rn throw
"Context is busy". A failed call releases the lock for the next caller.

**R9 — Token callback only during Night Shift.** `createLlamaProvider`
passes a token callback to `ctx.completion` only when Night Shift is
active. Night Shift's token-progress UI is unchanged.

**R10 — The timeout stays.** Each entry's ingest keeps the 120 s cap and
its existing message. The clock includes any wait behind another LLM
call (R8). This is accepted: a timeout is a recoverable R4 failure.
On timeout the save's LLM generations are cancelled (llama.rn
`stopCompletion` on the running one; queued ones, and any the ingest
starts afterwards, never run) and the entry stays "Saving…" while its
ingest settles, for up to 15 s more. A timed-out ingest therefore does not
write after the entry is retried or discarded, and does not hold later
calls in the R8 chain. Past the 15 s grace the entry fails anyway, so a
hang outside the LLM never blocks the queue. Giving up also ends the
cancellation, so the next save, chat and Night Shift run normally; a
stale ingest that later resumes may still write (accepted). A timed-out save counts as
saved only if its ingest resolved with no chunk failures. Cancellation is
not tagged by caller: a chat question or Night Shift call made while a
save is cancelled is cancelled with it (user ruling 2026-11-12, PR #106
review). Outside Night Shift, a generation waits for the foreground
before loading the model, so a queued save never reloads it in the
background.

## Out of scope

- Persisting the queue across app restarts.
- Changing llama.rn thread or core pinning.
- Editing a pending entry.

## Verification

- Unit tests: the save queue machine (order, failure → retry/discard,
  the queue continues past a failure, warnings), provider serialization
  and callback gating, and the journal screen (editor closes immediately,
  pending row renders, failure dialog → Try again / Discard).
- `npm test`, `npm run lint` and `npx tsc --noEmit` all pass.
- On-device check (user, Pixel 6): Save closes the editor at once, the
  pending row shows "Saving…", and the note appears when the save
  finishes.
