# Night Shift UX Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record how a Night Shift run ended, let a re-opened screen reattach to a still-running shift, keep progress moving during non-LLM work, and drop the stash's heal→step-2 heuristic.

**Architecture:** All run semantics live in the xstate machine (`nightShiftOutcome` context field, targetless `START_NIGHT_SHIFT` reattach inside `nightShift`). Copy and progress stay pure functions in `src/lib/` with unit tests; the hook exposes the new field and the screen only reads it.

**Tech Stack:** Expo SDK 57, React 19.2, xstate v5 + `@xstate/react`, `@equationalapplications/expo-llm-wiki` / `core-llm-wiki` 7.7.4, jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-24-night-shift-ux-rescue-design.md`

## Global Constraints

- Branch: `feature/night-shift-ux-rescue` (already created from `feature/curated-journal-demo` @ `65aad5b`; the spec commit is on it).
- Port the stash **by hand** from this plan. Never `git stash apply`/`pop` `stash@{0}` onto this branch.
- `nightShiftOutcome` type is exactly `'none' | 'completed' | 'aborted'`, exported as `NightShiftOutcome` from `src/machines/journalWikiMachine.ts`.
- Reattach: `START_NIGHT_SHIFT` inside `nightShift` is **targetless**; it never restarts `runStep`.
- Step counter and title follow the machine queue only. `status.heal` may change phase text only.
- Do not port: `resolveNightShiftOperation`, `effectiveQueueIndex`, the provider's `STATUS` dispatch, the `status` parameter on progress functions.
- Gates (baseline at `65aad5b` after `npm ci`): `npx jest` all green (baseline 25 suites / 109 tests); `npx tsc --noEmit` shows only the pre-existing `src/components/app-tabs.web.tsx(27,38)` error; `npm run lint` shows 0 errors and no more than 23 warnings.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 0: Environment check

**Files:** none

- [ ] **Step 1: Confirm branch and clean tree**

Run: `git status --short --branch`
Expected: `## feature/night-shift-ux-rescue` and no modified files.

- [ ] **Step 2: Confirm dependencies match the lockfile**

Run: `grep -m1 '"version"' node_modules/@equationalapplications/core-llm-wiki/package.json node_modules/expo/package.json`
Expected: `7.7.4` and `57.0.25`. If you see `4.17.0` / `56.x`, run `npm ci` and re-check. (Jest passes against the stale install; `tsc` does not.)

- [ ] **Step 3: Record baseline**

Run: `npx jest 2>&1 | tail -4; npx tsc --noEmit; npm run lint 2>&1 | tail -3`
Expected: `Tests: 109 passed`; one tsc error in `app-tabs.web.tsx(27,38)`; `✖ 23 problems (0 errors, 23 warnings)`.

---

### Task 1: Machine records the run outcome

**Files:**
- Modify: `src/machines/journalWikiMachine.ts` (types block at top, `Context`, `resetNightShift`, context factory, `nightShift.states.advance`)
- Test: `__tests__/journalWikiMachine.test.ts`

**Interfaces:**
- Produces: `export type NightShiftOutcome = 'none' | 'completed' | 'aborted';` and `Context.nightShiftOutcome: NightShiftOutcome`. Set to `'none'` by the context factory and by `resetNightShift`; set to `'aborted'` or `'completed'` when `advance` exits to `idle`. Left untouched by the `nightShift.on.IMPORT` interrupt.

- [ ] **Step 1: Write the failing assertions and test**

In `__tests__/journalWikiMachine.test.ts`:

In `it('runs night shift queue sequentially', …)`, after `expect(order).toEqual(['librarian', 'heal']);` add:

```ts
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');
```

In `it('aborts night shift after current step', …)`, after `expect(healStarted).toBe(false);` add:

```ts
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('aborted');
```

In `it('stops the heal loop between batches when ABORT_NIGHT_SHIFT is sent mid-heal', …)`, after `expect(maintenance.runHeal).toHaveBeenCalledTimes(1);` add:

```ts
    expect(actorRef.getSnapshot().context.nightShiftOutcome).toBe('aborted');
```

In `it('stops the heal loop and clears night-shift state when an IMPORT interrupts mid-heal', …)`, after `expect(snapshot.context.pendingImport).toBeNull();` add:

```ts
    // An import-interrupted run is neither completed nor user-aborted.
    expect(snapshot.context.nightShiftOutcome).toBe('none');
```

Add a new test after `'stores the heal summary in context and resets it on the next START_NIGHT_SHIFT'`:

```ts
  it('resets the outcome when a new night shift starts after one completes', async () => {
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();
    const queue = [{ operation: 'librarian' as const, entityId: 'e1' }];
    actor.send({ type: 'START_NIGHT_SHIFT', queue });
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');

    actor.send({ type: 'START_NIGHT_SHIFT', queue });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('none');
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');
    actor.stop();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/journalWikiMachine.test.ts`
Expected: 5 failures, each `Expected: "completed"` / `"aborted"` / `"none"`, `Received: undefined`.

- [ ] **Step 3: Implement the outcome**

In `src/machines/journalWikiMachine.ts`:

After `export type QueueItem = …;` add:

```ts
/** How the last Night Shift run ended. `'none'` while running or after an IMPORT interrupt. */
export type NightShiftOutcome = 'none' | 'completed' | 'aborted';
```

In `type Context`, after `lastHealSummary: HealStepSummary | null;` add:

```ts
  nightShiftOutcome: NightShiftOutcome;
```

In the `resetNightShift` action, add `nightShiftOutcome: 'none',` to the returned object so it reads:

```ts
    resetNightShift: assign(({ context, event }) => {
      context.nightShiftSignal.aborted = false;
      return {
        queue: event.type === 'START_NIGHT_SHIFT' ? event.queue : [],
        queueIndex: 0,
        aborted: false,
        nightShiftSignal: context.nightShiftSignal,
        lastHealSummary: null,
        lastError: null,
        nightShiftOutcome: 'none',
      };
    }),
```

In the `context: ({ input }) => ({ … })` factory, after `lastHealSummary: null,` add:

```ts
    nightShiftOutcome: 'none',
```

In `nightShift.states.advance.always[0]`, replace

```ts
              actions: assign({ queue: [], queueIndex: 0, aborted: false }),
```

with

```ts
              actions: assign({
                queue: [],
                queueIndex: 0,
                aborted: false,
                // Property callbacks read the pre-transition context, so this
                // sees `aborted` before the line above clears it.
                nightShiftOutcome: ({ context }) => (context.aborted ? 'aborted' : 'completed'),
              }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/journalWikiMachine.test.ts`
Expected: all pass. Then `npx tsc --noEmit` — only the baseline error.

- [ ] **Step 5: Commit**

```bash
git add src/machines/journalWikiMachine.ts __tests__/journalWikiMachine.test.ts
git commit -m "feat(night-shift): record run outcome (completed/aborted) in wiki machine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Machine reattaches on START during a running shift

**Files:**
- Modify: `src/machines/journalWikiMachine.ts` (`setup({ actions })`, `nightShift.on`)
- Test: `__tests__/journalWikiMachine.test.ts`

**Interfaces:**
- Consumes: `nightShiftOutcome` from Task 1.
- Produces: new action `reattachNightShift`; `nightShift.on.START_NIGHT_SHIFT: { actions: 'reattachNightShift' }` (no `target`). The event's `queue` payload is ignored in `nightShift`.

- [ ] **Step 1: Write the failing test**

Add after the `'aborts night shift after current step'` test:

```ts
  it('reattaches to the running shift when START_NIGHT_SHIFT follows an abort', async () => {
    let finishLibrarian: () => void = () => {};
    const librarianDone = new Promise<void>((resolve) => {
      finishLibrarian = resolve;
    });
    maintenance.runLibrarian.mockImplementation(() => librarianDone);
    const queue = [
      { operation: 'librarian' as const, entityId: 'e1' },
      { operation: 'heal' as const, entityId: 'e1' },
    ];
    const actor = createActor(journalWikiMachine, {
      input: { wiki: makeWiki() as never, maintenance },
    }).start();

    actor.send({ type: 'START_NIGHT_SHIFT', queue });
    actor.send({ type: 'ABORT_NIGHT_SHIFT' });
    // User re-opens Night Shift while the librarian step is still in flight.
    actor.send({ type: 'START_NIGHT_SHIFT', queue });

    const reattached = actor.getSnapshot();
    expect(reattached.matches({ nightShift: 'step' })).toBe(true);
    expect(reattached.context.aborted).toBe(false);
    expect(reattached.context.nightShiftSignal.aborted).toBe(false);

    finishLibrarian();
    await waitFor(actor, (s) => s.matches('idle'), { timeout: 5000 });
    // The in-flight step was not restarted (a restart would hit the library's
    // per-entity librarian lock and throw WikiBusyError).
    expect(maintenance.runLibrarian).toHaveBeenCalledTimes(1);
    expect(maintenance.runHeal).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.nightShiftOutcome).toBe('completed');
    actor.stop();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/journalWikiMachine.test.ts -t reattaches`
Expected: FAIL at `expect(reattached.context.aborted).toBe(false)` — `Received: true` (the second START is dropped today).

- [ ] **Step 3: Implement reattach**

In `setup({ actions: { … } })`, after `abortNightShift`, add:

```ts
    reattachNightShift: assign(({ context }) => {
      // Same deliberate mutation as abortNightShift: the in-flight step reads
      // this object by reference between batches, so clearing it here lets
      // the current run continue instead of draining out as aborted.
      context.nightShiftSignal.aborted = false;
      return { aborted: false, nightShiftSignal: context.nightShiftSignal };
    }),
```

In `nightShift.on`, add above `ABORT_NIGHT_SHIFT`:

```ts
        // Re-opening Night Shift mid-run reattaches rather than restarting:
        // targetless, so the invoked runStep keeps running.
        START_NIGHT_SHIFT: { actions: 'reattachNightShift' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/journalWikiMachine.test.ts`
Expected: all pass. Then `npx tsc --noEmit` — only the baseline error.

- [ ] **Step 5: Commit**

```bash
git add src/machines/journalWikiMachine.ts __tests__/journalWikiMachine.test.ts
git commit -m "feat(night-shift): reattach to a running shift instead of dropping START

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Copy — completion gating and heal wording during the librarian step

**Files:**
- Modify: `src/lib/nightShiftCopy.ts` (`nightShiftPhaseLabel`, `nightShiftStepLabel`)
- Test: `__tests__/nightShiftCopy.test.ts`

**Interfaces:**
- Produces: `nightShiftStepLabel({ queueIndex, queueLength, isNightShift, isAdvancing, hasStarted, nightShiftFinished? })` — `nightShiftFinished?: boolean`, default `false`; "Night Shift complete" requires it. `nightShiftPhaseLabel(operation, status, llm)` signature unchanged.

- [ ] **Step 1: Write the failing tests**

In `__tests__/nightShiftCopy.test.ts`, inside `describe('nightShiftPhaseLabel', …)` add:

```ts
  it('uses heal wording during the librarian step while the library is healing', () => {
    const healing = { ingesting: false, librarian: false, heal: true };
    expect(
      nightShiftPhaseLabel('librarian', healing, {
        tokensGenerated: 0,
        maxTokens: 512,
        isGenerating: false,
      }),
    ).toBe('Preparing heal pass — reviewing the graph…');
    expect(
      nightShiftPhaseLabel('librarian', healing, {
        tokensGenerated: 12,
        maxTokens: 512,
        isGenerating: true,
      }),
    ).toBe('Running on-device AI — healing broken links and duplicates…');
  });
```

Replace the test `'shows complete only after the queue is cleared'` with:

```ts
  it('shows complete only after a run finishes', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 0,
        queueLength: 0,
        isNightShift: false,
        isAdvancing: false,
        hasStarted: true,
        nightShiftFinished: true,
      }),
    ).toBe('Night Shift complete');
  });

  it('does not show complete when the run ended without finishing', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 0,
        queueLength: 0,
        isNightShift: false,
        isAdvancing: false,
        hasStarted: true,
      }),
    ).toBe('Step 1 / 2');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/nightShiftCopy.test.ts`
Expected: 2 failures — the heal-wording test receives `'Preparing librarian pass — loading your notes…'`; the "without finishing" test receives `'Night Shift complete'`.

- [ ] **Step 3: Implement**

In `src/lib/nightShiftCopy.ts`, add above `nightShiftPhaseLabel`:

```ts
function healPhaseLabel(llm: NightShiftLlmProgress): string {
  if (llm.isGenerating) {
    return 'Running on-device AI — healing broken links and duplicates…';
  }
  if (llm.tokensGenerated > 0) {
    return 'Applying heal results — updating your graph…';
  }
  return 'Preparing heal pass — reviewing the graph…';
}
```

In `nightShiftPhaseLabel`, make the librarian branch start with the heal check, and make the heal branch delegate:

```ts
  if (operation === 'librarian') {
    // The library can run its own heal during the librarian step; say so in
    // the phase text only — title and step counter follow the machine queue.
    if (status.heal) return healPhaseLabel(llm);
    if (llm.isGenerating) {
      return 'Running on-device AI — synthesizing insights and new connections…';
    }
    if (llm.tokensGenerated > 0) {
      return 'Applying librarian results — updating your graph…';
    }
    return 'Preparing librarian pass — loading your notes…';
  }

  if (operation === 'heal') return healPhaseLabel(llm);
```

Replace `nightShiftStepLabel` with:

```ts
export function nightShiftStepLabel({
  queueIndex,
  queueLength,
  isNightShift,
  isAdvancing,
  hasStarted,
  nightShiftFinished = false,
}: {
  queueIndex: number;
  queueLength: number;
  isNightShift: boolean;
  isAdvancing: boolean;
  hasStarted: boolean;
  nightShiftFinished?: boolean;
}): string {
  const total = queueLength > 0 ? queueLength : NIGHT_SHIFT_STEP_COUNT;

  if (hasStarted && nightShiftFinished && !isNightShift && queueLength === 0) {
    return 'Night Shift complete';
  }

  if (isAdvancing && queueIndex + 1 < total) {
    return `Step ${queueIndex + 2} / ${total} — starting…`;
  }

  return `Step ${Math.min(queueIndex + 1, total)} / ${total}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/nightShiftCopy.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nightShiftCopy.ts __tests__/nightShiftCopy.test.ts
git commit -m "feat(night-shift): gate completion copy on a finished run; heal wording in librarian step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Progress creeps during non-LLM work

**Files:**
- Modify: `src/lib/nightShiftProgress.ts`
- Modify: `src/hooks/useNightShiftProgress.ts`
- Test: `__tests__/nightShiftProgress.test.ts`

**Interfaces:**
- Produces: `computeNightShiftProgress(queueIndex: number, queueLength: number, isStepRunning: boolean, llm: NightShiftLlmProgress, elapsedSecondsWhileStepRunning = 0): number`. `useNightShiftProgress(queueIndex, queueLength, isStepRunning, isNightShift)` signature unchanged.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('computeNightShiftProgress', …)` in `__tests__/nightShiftProgress.test.ts`:

```ts
  it('creeps forward during long pre-LLM work on a step', () => {
    const early = computeNightShiftProgress(0, 2, true, idleLlm, 0);
    const later = computeNightShiftProgress(0, 2, true, idleLlm, 30);
    expect(later).toBeGreaterThan(early);
  });

  it('keeps pre-LLM creep below a quarter of the step', () => {
    expect(computeNightShiftProgress(0, 1, true, idleLlm, 10_000)).toBeLessThan(0.25);
  });

  it('creeps forward while results are applied without reaching the next step', () => {
    const early = computeNightShiftProgress(0, 2, true, postLlm, 0);
    const later = computeNightShiftProgress(0, 2, true, postLlm, 60);
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(0.5);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/nightShiftProgress.test.ts`
Expected: 2 failures (both "creeps forward" tests: `later` equals `early`). The quarter-of-step bound already holds and passes; it guards the new curve.

- [ ] **Step 3: Implement the curve**

Replace `inStepProgress` and `computeNightShiftProgress` in `src/lib/nightShiftProgress.ts` (keep the `STEP_*` constants and the import):

```ts
/** Time constants (seconds) for creep while a step runs without token progress. */
const PREP_CREEP_SECONDS = 15;
const POST_CREEP_SECONDS = 30;

/** 0 at t=0, approaching (never reaching) 1 as t grows. */
function easeOut(seconds: number, timeConstant: number): number {
  return 1 - Math.exp(-seconds / timeConstant);
}

function inStepProgress(llm: NightShiftLlmProgress, elapsedSeconds: number): number {
  if (llm.isGenerating) {
    const llmFraction = Math.min(1, llm.tokensGenerated / llm.maxTokens);
    return STEP_PREP + STEP_LLM * llmFraction;
  }

  if (llm.tokensGenerated > 0) {
    // Applying results: ease from 70% toward 100% of the post-LLM share.
    return (
      STEP_PREP + STEP_LLM + STEP_POST * (0.7 + 0.3 * easeOut(elapsedSeconds, POST_CREEP_SECONDS))
    );
  }

  // Preparing (loading notes, building the prompt): ease toward 20% of the LLM share.
  return STEP_PREP + STEP_LLM * 0.2 * easeOut(elapsedSeconds, PREP_CREEP_SECONDS);
}

/** Estimated overall Night Shift completion in the range [0, 1]. */
export function computeNightShiftProgress(
  queueIndex: number,
  queueLength: number,
  isStepRunning: boolean,
  llm: NightShiftLlmProgress,
  elapsedSecondsWhileStepRunning = 0,
): number {
  if (queueLength <= 0) return 0;

  const stepWeight = 1 / queueLength;

  if (!isStepRunning) {
    const completedSteps = Math.min(queueIndex + 1, queueLength);
    return completedSteps * stepWeight;
  }

  return (queueIndex + inStepProgress(llm, elapsedSecondsWhileStepRunning)) * stepWeight;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/nightShiftProgress.test.ts`
Expected: all pass (including the existing five).

- [ ] **Step 5: Drive elapsed time from the hook**

Replace the body of `src/hooks/useNightShiftProgress.ts` with:

```ts
import { useEffect, useMemo, useState } from 'react';
import {
  getNightShiftLlmProgress,
  subscribeNightShiftLlmProgress,
  type NightShiftLlmProgress,
} from '@/lib/llamaProvider';
import { computeNightShiftProgress } from '@/lib/nightShiftProgress';

export function useNightShiftProgress(
  queueIndex: number,
  queueLength: number,
  isStepRunning: boolean,
  isNightShift: boolean,
): { progress: number; llm: NightShiftLlmProgress } {
  const [llm, setLlm] = useState<NightShiftLlmProgress>(getNightShiftLlmProgress);
  const [creep, setCreep] = useState<{ key: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!isNightShift) return;
    return subscribeNightShiftLlmProgress(setLlm);
  }, [isNightShift]);

  // Creep only while a step runs without streaming tokens. The key changes per
  // step and per phase (preparing vs applying), so a stale count reads as 0
  // without a synchronous setState in the effect body.
  const creepKey =
    isStepRunning && !llm.isGenerating
      ? `${queueIndex}:${llm.tokensGenerated > 0 ? 'apply' : 'prep'}`
      : null;

  useEffect(() => {
    if (creepKey === null) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setCreep({ key: creepKey, seconds: Math.floor((Date.now() - startedAt) / 1000) });
    }, 1000);
    return () => clearInterval(timer);
  }, [creepKey]);

  const elapsedSeconds = creep !== null && creep.key === creepKey ? creep.seconds : 0;

  const progress = useMemo(
    () => computeNightShiftProgress(queueIndex, queueLength, isStepRunning, llm, elapsedSeconds),
    [elapsedSeconds, isStepRunning, llm, queueIndex, queueLength],
  );

  return { progress, llm };
}
```

- [ ] **Step 6: Verify gates for this task**

Run: `npx jest; npx tsc --noEmit; npx eslint src/hooks/useNightShiftProgress.ts src/lib/nightShiftProgress.ts`
Expected: jest all green; tsc only the baseline error; eslint prints nothing for these two files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nightShiftProgress.ts src/hooks/useNightShiftProgress.ts __tests__/nightShiftProgress.test.ts
git commit -m "feat(night-shift): ease progress forward during non-LLM work within a step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the outcome through the hook and screen

**Files:**
- Modify: `src/hooks/useJournalWiki.tsx`
- Modify: `src/components/night-shift/NightShiftScreen.tsx`

**Interfaces:**
- Consumes: `NightShiftOutcome` (Task 1), `nightShiftStepLabel({ …, nightShiftFinished })` (Task 3).
- Produces: `useJournalWiki()` returns `nightShiftOutcome: NightShiftOutcome` in addition to its current fields.

No new unit tests: the hook is a selector passthrough and there is no screen test harness; behavior is covered by Tasks 1–3 and checked by `tsc` here.

- [ ] **Step 1: Expose the outcome from the hook**

In `src/hooks/useJournalWiki.tsx`:

Change the machine import to:

```ts
import {
  journalWikiMachine,
  type JournalWikiMachineEvents,
  type NightShiftOperation,
  type NightShiftOutcome,
} from '@/machines/journalWikiMachine';
```

In `type JournalWikiContextValue`, after `isNightShift: boolean;` add:

```ts
  nightShiftOutcome: NightShiftOutcome;
```

After `const isNightShift = useSelector(actor, (s) => s.matches('nightShift'));` add:

```ts
  const nightShiftOutcome = useSelector(actor, (s) => s.context.nightShiftOutcome);
```

Replace the `value` memo with:

```ts
  const value = useMemo(
    () => ({
      send,
      queueIndex,
      queueLength,
      currentOperation,
      isStepRunning,
      isAdvancing,
      lastError,
      isNightShift,
      nightShiftOutcome,
    }),
    [
      currentOperation,
      isAdvancing,
      isNightShift,
      isStepRunning,
      lastError,
      nightShiftOutcome,
      queueIndex,
      queueLength,
      send,
    ],
  );
```

Leave `entityId: _entityId` as it is; do not add `useEntityStatus` or a `STATUS` effect here.

- [ ] **Step 2: Read the outcome in the screen**

In `src/components/night-shift/NightShiftScreen.tsx`:

Replace

```ts
  const { send, queueIndex, queueLength, currentOperation, isStepRunning, isAdvancing, isNightShift } =
    useJournalWiki();
```

with

```ts
  const {
    send,
    queueIndex,
    queueLength,
    currentOperation,
    isStepRunning,
    isAdvancing,
    isNightShift,
    nightShiftOutcome,
  } = useJournalWiki();
```

Replace

```ts
  const [hasBeenNightShift, setHasBeenNightShift] = useState(false);
```

with

```ts
  const [hasStartedNightShift, setHasStartedNightShift] = useState(false);
```

Replace

```ts
  const finished = hasBeenNightShift && !isNightShift && queueLength === 0;
  const stepLabel = nightShiftStepLabel({
    queueIndex,
    queueLength,
    isNightShift,
    isAdvancing,
    hasStarted: hasBeenNightShift,
  });
```

with

```ts
  // hasStartedNightShift guards the first render, before START resets a
  // 'completed' outcome left over from a previous visit.
  const nightShiftFinished = nightShiftOutcome === 'completed';
  const finished = hasStartedNightShift && nightShiftFinished && !isNightShift;
  const stepLabel = nightShiftStepLabel({
    queueIndex,
    queueLength,
    isNightShift,
    isAdvancing,
    hasStarted: hasStartedNightShift,
    nightShiftFinished,
  });
```

In the START effect, add `setHasStartedNightShift(true);` right after `setNightShiftActive(true);`.

Delete this effect entirely:

```ts
  useEffect(() => {
    if (isNightShift) {
      setHasBeenNightShift(true);
    }
  }, [isNightShift]);

```

Title, phase and detail lines keep passing `currentOperation` unchanged.

- [ ] **Step 3: Verify full gates**

Run: `npx jest 2>&1 | tail -4; npx tsc --noEmit; npm run lint 2>&1 | tail -3`
Expected: jest all green (109 baseline + 7 new = 116 tests); tsc only the baseline `app-tabs.web.tsx(27,38)` error; lint `0 errors`, at most 23 warnings. (The screen trades its old `set-state-in-effect` warning in the deleted effect for one in the START effect — net zero.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useJournalWiki.tsx src/components/night-shift/NightShiftScreen.tsx
git commit -m "feat(night-shift): show Complete only for a completed run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Device check, PR, stash cleanup

**Files:** none

- [ ] **Step 1: Manual check on a dev-client build** (needs the human; skip and say so if no device is available)

Run the app (`npx expo start --dev-client`), then:
1. Open Night Shift, let it finish → label reads "Complete" / "Night Shift complete".
2. Open Night Shift, tap Stop during the librarian pass, immediately reopen → the screen resumes the same run (no error screen), and ends "Complete".
3. Tap Stop and stay away until it drains → next open starts a fresh run from Step 1 / 2.
4. During a long pass with no token streaming, the percentage keeps rising slowly.

- [ ] **Step 2: Push and open the PR** (outward-facing — confirm with the user first)

```bash
git push -u origin feature/night-shift-ux-rescue
gh pr create --base feature/curated-journal-demo --title "Night Shift UX: run outcome, reattach, progress creep" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-09-24-night-shift-ux-rescue-design.md.

- Machine records `nightShiftOutcome` (`completed` / `aborted`); the screen shows Complete only for completed runs (previously Stop also read as complete in the stashed work).
- `START_NIGHT_SHIFT` during a running shift reattaches instead of being dropped; no step restart, so no librarian-lock `WikiBusyError`.
- Progress eases forward during non-LLM work within a step.
- Heal activity during the librarian step changes phase text only; step counter and title follow the machine queue.

Gates: jest green; tsc only the pre-existing `app-tabs.web.tsx` `/explore` error; lint 0 errors, no new warnings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Drop the stash** (only after Step 2's push succeeded; confirm with the user)

Run: `git stash list` — confirm `stash@{0}: On feature/curated-journal-demo: night-shift-ux-pre-sdk57`, then `git stash drop stash@{0}`.
