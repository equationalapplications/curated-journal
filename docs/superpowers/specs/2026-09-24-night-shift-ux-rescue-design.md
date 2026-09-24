# Night Shift UX Rescue — Completion Outcome, Re-entry, Progress Creep

Date: 2026-09-24
Status: Draft (awaiting approval)
Parent spec: [SDK 57 / wiki 7.7.4 / OKF 0.2 upgrade](./2026-09-24-sdk57-llmwiki7-okf02-upgrade.md)
Base: `feature/curated-journal-demo` @ `65aad5b` (PR #9 merged)
Source material: `stash@{0}` "night-shift-ux-pre-sdk57" (uncommitted work written against the pre-SDK-57 tree, `e5ea5a6`)

---

## 1. Problem Statement

Night Shift UX work was left uncommitted on the pre-SDK-57 tree. PR #9 then reworked
`journalWikiMachine.ts` (named `resetNightShift` / `abortNightShift` actions, a shared
`nightShiftSignal` read by the batched heal loop). Re-applying the stash conflicts in the
machine, and review of the stash found defects that must not be carried forward:

1. **Aborted runs report "complete".** The stash sets `nightShiftCompleted: true` in the
   `advance` exit, whose guard is `aborted || lastStep`. Pressing Stop marks the run finished.
2. **Immediate restart can fault the machine.** The stash's `START_NIGHT_SHIFT` handler inside
   `nightShift` re-enters `.step`. An in-flight `runLibrarian` cannot be cancelled and holds the
   library's per-entity librarian lock (`core-llm-wiki` `JobManager.isBlocked`), so the new step
   throws `WikiBusyError`; `runStep.onError` routes that to `error`. The stash's test passes only
   because its mocks take no lock.
3. **Heal status is misread as step 2.** The library runs its own `runLibrarianThenMaybeHeal`
   after ingest, so `status.heal === true` does not imply the machine's heal step.
   `effectiveQueueIndex` (duplicated in `nightShiftCopy.ts` and `nightShiftProgress.ts`) bumps the
   step counter anyway, while `resolveNightShiftOperation` keeps the title on "Librarian pass" —
   the screen contradicts itself.
4. **Dead `STATUS` dispatch.** The stash makes `JournalWikiProvider` send `STATUS` on every
   entity-status change; nothing reads `context.status` (the screen calls `useEntityStatus`
   directly).

The upstream tree also has a real gap the stash was reaching for: Stop sends `ABORT_NIGHT_SHIFT`
and calls `router.back()`, but the machine stays in `nightShift` until the in-flight step
drains (up to one heal batch, or a whole librarian pass). Reopening Night Shift in that window
sends `START_NIGHT_SHIFT`, which `nightShift` does not handle — the event is dropped and the
screen watches a run that is about to end as aborted.

## 2. Goals

| ID | Goal |
|----|------|
| G1 | The machine records how a run ended — completed or aborted — and the screen shows "complete" only for a completed run. |
| G2 | `START_NIGHT_SHIFT` during a running shift **reattaches**: the abort is undone and the current run continues. No step restarts, no duplicate LLM work, no `WikiBusyError`. |
| G3 | Step counter and operation title follow the machine queue only. Library heal activity during the librarian step appears in the phase text only. |
| G4 | Progress keeps moving during long non-LLM work within a step (the stash's time-based creep). |
| G5 | `npx jest`, `npx tsc --noEmit` and `npm run lint` pass; `stash@{0}` is dropped once the PR branch is committed. |

## 3. Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Restarting a run from step 1 on re-entry | Reattach chosen instead; restart needs lock-aware sequencing for little user value. |
| NG2 | Handling `WikiBusyError` in `runStep` | Reattach removes the path that produced it; other sources are out of scope. |
| NG3 | Showing library-initiated heal as its own step | The library's background heal is not part of the Night Shift queue. |
| NG4 | Multi-entity Night Shift | The app has one journal entity (`JournalContext.entityId`); reattach assumes the re-sent queue targets it. |

## 4. Design

### 4.1 Machine — `src/machines/journalWikiMachine.ts`

Start from the upstream file (`65aad5b`); take nothing from the stash's inline `assign`s.

**Context.** Add:

```ts
nightShiftOutcome: 'none' | 'completed' | 'aborted';
```

Initialised to `'none'` in the context factory.

**Actions.**

- `resetNightShift` (existing): additionally returns `nightShiftOutcome: 'none'`.
- `abortNightShift` (existing): unchanged.
- `reattachNightShift` (new): clears the abort on both paths the heal loop checks.

  ```ts
  reattachNightShift: assign(({ context }) => {
    // Same deliberate mutation as abortNightShift: the in-flight step reads
    // this object by reference between batches.
    context.nightShiftSignal.aborted = false;
    return { aborted: false, nightShiftSignal: context.nightShiftSignal };
  }),
  ```

**Transitions.**

- `nightShift.on.START_NIGHT_SHIFT: { actions: 'reattachNightShift' }` — targetless, so the
  invoked `runStep` actor is not stopped and the queue and `queueIndex` are kept. The event's
  `queue` payload is ignored (see NG4).
- `nightShift.states.advance`, exit branch: replace
  `assign({ queue: [], queueIndex: 0, aborted: false })` with an assign that also sets
  `nightShiftOutcome: ({ context }) => (context.aborted ? 'aborted' : 'completed')`.
  The outcome is computed from `aborted` before `aborted` is cleared — same assign object,
  property callbacks read the pre-transition context.
- `idle` and `error` `START_NIGHT_SHIFT`: unchanged (`resetNightShift`), so they reset the outcome.
- `nightShift.on.IMPORT` (existing, aborts the run into `busyRetry`): leave `nightShiftOutcome`
  as `'none'`. An import-interrupted run is neither completed nor user-aborted.

**Race with the drain.** If the step has already seen `aborted` and settled, `advance` has
already moved the machine to `idle` (outcome `'aborted'`); the re-entry `START_NIGHT_SHIFT`
then hits `idle` and starts a fresh run as today. No extra handling is needed.

**Not ported:** the stash's `STATUS` dispatch from the provider (problem 4). The existing
`STATUS` handlers in the machine stay as they are.

### 4.2 Hook — `src/hooks/useJournalWiki.tsx`

- Expose `nightShiftOutcome` via `useSelector(actor, (s) => s.context.nightShiftOutcome)`,
  added to the context value type and the `useMemo` deps.
- No `useEntityStatus` call and no `STATUS` effect (drop those stash hunks). `entityId` stays
  unused in the provider (`entityId: _entityId`, as upstream).

### 4.3 Screen — `src/components/night-shift/NightShiftScreen.tsx`

- Rename `hasBeenNightShift` → `hasStartedNightShift`, set to `true` inside the START effect,
  and remove the effect that watched `isNightShift` (stash change, kept).
- `finished = hasStartedNightShift && nightShiftOutcome === 'completed' && !isNightShift`.
- Title, phase and detail use `currentOperation` directly (no `resolveNightShiftOperation`).
- `useNightShiftProgress(queueIndex, queueLength, isStepRunning, isNightShift)` — no `status`
  argument.
- `nightShiftStepLabel` receives `nightShiftFinished: nightShiftOutcome === 'completed'`
  (no `status`).

### 4.4 Copy — `src/lib/nightShiftCopy.ts`

- Remove `resolveNightShiftOperation` and `effectiveQueueIndex`.
- `nightShiftStepLabel`: add optional `nightShiftFinished = false`; "Night Shift complete"
  requires it (`hasStarted && nightShiftFinished && !isNightShift && queueLength === 0`).
  Step numbers use `queueIndex` only.
- `nightShiftPhaseLabel`: in the `operation === 'librarian'` branch, when `status.heal` is true
  return the heal wording for the current LLM state (`Running on-device AI — healing broken
  links and duplicates…` / `Applying heal results — updating your graph…` /
  `Preparing heal pass — reviewing the graph…`). The title and step counter are unchanged.
  Implement by sharing the heal wording with the `heal` branch, not duplicating the strings.

### 4.5 Progress — `src/lib/nightShiftProgress.ts`, `src/hooks/useNightShiftProgress.ts`

Port the stash's creep, without the status heuristic:

- `inStepProgress(llm, elapsedSeconds = 0)`:
  - generating: unchanged (`STEP_PREP + STEP_LLM * tokenFraction`);
  - post-LLM: `STEP_PREP + STEP_LLM + STEP_POST * (0.7 + 0.3 * (1 - e^(-t/30)))`, capped at 1;
  - pre-LLM: `STEP_PREP + STEP_LLM * 0.2 * (1 - e^(-t/15))`, capped at `STEP_PREP + STEP_LLM * 0.25`.
- `computeNightShiftProgress(queueIndex, queueLength, isStepRunning, llm, elapsedSecondsWhileStepRunning = 0)`.
- `useNightShiftProgress` keeps its current signature and adds an `elapsedSeconds` state driven
  by a 1 s interval while `isStepRunning && !llm.isGenerating`, reset on `queueIndex` change
  and when generation starts.

Remove `effectiveQueueIndex` and the `EntityStatus` import from both files.

## 5. Testing

`__tests__/journalWikiMachine.test.ts`
- Existing librarian→heal order test also asserts `nightShiftOutcome === 'completed'`.
- **Abort:** heal mock reports a strictly decreasing `remaining > 0` for several batches (a
  non-shrinking `remaining` ends the loop via `noProgress` on its own); send `ABORT_NIGHT_SHIFT`
  during the heal step → reaches `idle` with `nightShiftOutcome === 'aborted'`.
- **Reattach:** librarian mock blocks on a deferred promise; send `START_NIGHT_SHIFT`,
  `ABORT_NIGHT_SHIFT`, `START_NIGHT_SHIFT`; resolve the deferred → `runLibrarian` called
  exactly once, heal runs, outcome `'completed'`.
- **Restart after drain:** complete a run, send `START_NIGHT_SHIFT` again → outcome goes
  `'completed'` → `'none'` → `'completed'`.
- Replace the stash's "restarts when START is sent while running" test (asserted
  `librarianCalls >= 2`; contradicts G2).

`__tests__/nightShiftCopy.test.ts`
- "Night Shift complete" only when `nightShiftFinished` is true; with `hasStarted` but not
  finished, shows the step label.
- Librarian step + `status.heal` → heal phase wording; title stays "Librarian pass".
- Drop the stash's `resolveNightShiftOperation` tests and the heal→"Step 2 / 2" test.

`__tests__/nightShiftProgress.test.ts`
- Keep: creep increases with elapsed time (pre-LLM and post-LLM); pre-LLM creep never exceeds
  `STEP_PREP + STEP_LLM * 0.25` of the step.
- Drop the heal-status-as-step-2 test.

Gate: `npx jest`, `npx tsc --noEmit`, `npm run lint`.

## 6. Delivery

1. Branch `feature/night-shift-ux-rescue` from `feature/curated-journal-demo` @ `65aad5b`.
2. Port the stash per §4 by hand; do not `stash apply` onto the branch (the machine hunk
   conflicts and the rest carries the removed heuristic).
3. Tests per §5, then gates.
4. PR into `feature/curated-journal-demo`.
5. After the PR branch is committed and pushed: `git stash drop stash@{0}`.
