# SDK 57 + expo-llm-wiki 7.7.4 + OKF 0.2 Implementation Plan

> **Note to implementer:** Implement task-by-task on branch `chore/sdk57-llm-wiki-7`, committing after each task. Spec: `docs/superpowers/specs/2026-09-24-sdk57-llmwiki7-okf02-upgrade.md` (§5.1 is the authoritative heal design, reconciled with this plan after Opus review round 2 — see spec §9).

**Precondition (verified):** Kurt approved the spec on 2026-09-24 ("The draft spec is good") and directed the review-loop + implementation sequence on this branch. Spec `Status:` remains `Draft (awaiting approval)` on disk; flipping it to `Approved` and ticking the spec-approval PR box is **Kurt's** action, not the implementer's.

**Goal:** Upgrade Curated Journal to Expo SDK 57, exact-pin `@equationalapplications/expo-llm-wiki` and `@equationalapplications/core-llm-wiki` at 7.7.4, emit OKF 0.2, fix the two behavioral breaks (heal batching with abort-safe loop, ingest failure surfacing), and finish PR #9 with all gates green.

**Architecture:** Dependency bump first (gates re-established), then the heal loop implemented **inside the machine's heal step**. Stop paths, all honored between batches: machine abort flag (`ABORT_NIGHT_SHIFT`), xstate's built-in `fromPromise` AbortSignal (fires when an IMPORT transitions to `busyRetry` or the provider unmounts and stops the actor), no-progress guard, and a 200-batch cap. The provider adapter forwards `runHeal` **verbatim** — no extra arguments are passed into the library, no loop outside the machine. Ingest failures surfaced via a helper typed against the library's `IngestResult`. Docs last.

**Tech Stack:** Expo SDK 57, RN 0.86.3, xstate 5, jest-expo 57, TypeScript ~6.0.3.

---

## Current context / assumptions

- Branch `chore/sdk57-llm-wiki-7` exists with spec + this plan; PR #9 open, base `feature/curated-journal-demo`.
- `node_modules` not yet installed — Task 1 installs fresh.
- Verified facts (spec §4/§5, research briefs): SDK 57 matrix; wiki API diff = heal batch semantics + `IngestResult` widening only; `formatOkfBundle(dump, { profile: 'llm-wiki/2' })`; `parseOkfBundle` unchanged; `expo-crypto >= 12` satisfied.
- `HealResult` (7.7.4) ≈ `{ remaining: number, skipped: Array<{id, reason}>, degraded: [...] }` — verify exact shape from the installed `.d.ts` in Task 3 step 0 before coding; define the structural type locally if the facade doesn't export the name.
- Device dev-build gate stays with Kurt (PR checkbox).

---

### Task 1: Dependency matrix to SDK 57

**Objective:** All deps at spec §4 targets; install succeeds; expo-doctor clean.

**Files:** Modify: `package.json` (via tools; lockfile follows)

**Steps:**
1. Two-step upgrade: `npx expo install expo@~57.0.24` then `npx expo install --fix` (auto-maps expo-* family, RN, gesture-handler, screens, jest-expo, eslint-config-expo).
2. Hand-set in `package.json`:
   - `"@equationalapplications/expo-llm-wiki": "7.7.4"` (exact)
   - `"@equationalapplications/core-llm-wiki": "7.7.4"` (exact, **newly declared** — imported directly in 11 `src/` files but previously only transitive)
   - `"react-native-reanimated": "4.5.1"`, `"react-native-worklets": "0.10.1"` (exact, peer-pinned pair)
   - Verify UNCHANGED: `react`, `react-dom`, `typescript`, `@types/react`, `react-native-safe-area-context`, `react-native-web`, `@shopify/react-native-skia`, `llama.rn`, `react-native-nitro-unzip`, `react-native-zip-archive`, `@testing-library/react-native`, `jest`.
3. `npm install`
4. `npx expo-doctor@latest` → no errors (record non-obvious warnings in the PR).
5. Sanity: `node -e "console.log(require('@equationalapplications/expo-llm-wiki/package.json').version)"` → `7.7.4`; same for core-llm-wiki; `npm ls expo-sqlite react-native-worklets` → no peer conflicts.
6. Commit: `chore: upgrade to Expo SDK 57 and pin expo-llm-wiki/core-llm-wiki 7.7.4`

### Task 2: Existing suite green on SDK 57

**Objective:** No regressions before any code change.

**Steps:**
1. `npx tsc --noEmit` → clean (API diff predicts no fallout; fix trivial cases only).
2. `npm test` → all 22 existing test files pass as-is.
3. `npm run lint` → clean.
4. Commit only if files changed (expected: no-op).

### Task 3: Heal loop in the machine (TDD)

**Objective:** Night Shift heal drains all batches; all three stop paths (abort event, invoke-stop via IMPORT/unmount, no-progress/cap guards) take effect **between batches**; summary stored on context and logged, never discarded.

**Design (authoritative — spec §5.1 matches this):**
- `src/lib/healLoop.ts` (pure, unit-tested):
  `runHealToCompletion(runBatch, entityId, opts?)` with `runBatch: (entityId: string) => Promise<HealBatchResult>` (NOTE: no `shouldContinue` parameter — the loop checks its own guards between calls, never passing functions into the library), `opts = { shouldContinue?: () => boolean; maxBatches?: number }`.
  Returns `HealStepSummary = { batches, skipped, degraded, exhausted, noProgress, remaining }`.
  Guards, in order per iteration: `shouldContinue()` false → stop (`exhausted: false`); `remaining` not shrinking vs previous iteration → stop (`noProgress: true`); `batches >= maxBatches` (default 200, clamped to ≥ 1) → stop (`exhausted: true`). `console.warn` on exhausted/noProgress.
- `journalWikiMachine.ts`:
  - `MaintenanceApi.runHeal: (entityId: string) => Promise<HealBatchResult>`; librarian/reembed/prune stay `Promise<void>`.
  - New context field `nightShiftSignal: { aborted: boolean }` — object created from machine `input`, kept by reference; plus `lastHealSummary: HealStepSummary | null`.
  - One named action `resetNightShift()` assigned to BOTH `START_NIGHT_SHIFT` handlers (`idle` and the `error` retry path): resets `aborted: false`, `nightShiftSignal.aborted = false`, `lastHealSummary: null`, queue fields, `lastError: null`.
  - `ABORT_NIGHT_SHIFT` action sets both `aborted: true` and `nightShiftSignal.aborted = true` (deliberate mutation of the shared object so the in-flight loop sees it immediately; documented in machine comments).
  - `runStep` actor: xstate 5 `fromPromise` receives `{ input, signal }`; heal case returns `runHealToCompletion(maintenance.runHeal, item.entityId, { shouldContinue: () => !input.signal.aborted && !signal.aborted })` where the second `signal` is xstate's built-in AbortSignal (fires on IMPORT→`busyRetry` or provider unmount stopping the actor). Non-heal operations ignore the signal (unchanged behavior).
  - `step.onDone`: `actions: assign({ lastHealSummary: ({ context, event }) => (event.output && typeof event.output === 'object' && 'batches' in event.output ? event.output : context.lastHealSummary) })`.
  - `useJournalWiki.tsx`: adapter line becomes `(entityId: string) => maintenanceRef.current.runHeal(entityId)` (verbatim forward — no arg invention).
- Night Shift summary UI: if it already renders per-step results, extend minimally to show skipped/degraded counts; otherwise context storage + log is enough for this PR.

**Files:** Create: `src/lib/healLoop.ts`, `__tests__/healLoop.test.ts`. Modify: `src/machines/journalWikiMachine.ts`, `src/hooks/useJournalWiki.tsx`, `__tests__/journalWikiMachine.test.ts`.

**Steps:**
0. From the installed 7.7.4 `.d.ts`: confirm the exact `HealResult` shape and that the library's `runHeal` takes exactly `(entityId)` (so verbatim forwarding is correct). Record findings in the PR.
1. **Failing tests** (`__tests__/healLoop.test.ts`): drain 2→1→0 (accumulate skipped/degraded, `batches: 3`); `shouldContinue() === false` stops after current batch; no-progress stop (`noProgress: true`); cap (`maxBatches: 3` → `exhausted: true`, exactly 3 calls); `maxBatches: 0` clamps to 1 call.
2. **Failing machine tests** (extend `__tests__/journalWikiMachine.test.ts`):
   - heal item drains multiple batches (mock returns decreasing `remaining`; assert call count + `idle` reached);
   - abort: mock's batch body calls `actor.send({ type: 'ABORT_NIGHT_SHIFT' })` (drives the REAL event path, not manual flag mutation), then resolves; assert subsequent `runHeal` calls stop and machine reaches `idle`;
   - IMPORT during multi-batch heal: assert the loop stops (call count stops growing) and the import eventually completes through `busyRetry` — guards MAJOR 1's orphaned-loop scenario;
   - `lastHealSummary` lands in context after heal (via `actor.getSnapshot()`) and is reset by a new `START_NIGHT_SHIFT`.
   - Update ALL existing `runHeal` mocks to return `{ remaining: 0, skipped: [], degraded: [] }`-shaped values (including the 'runs night shift queue sequentially' test — mocks returning `undefined` would throw on `.remaining`).
3. `npx jest __tests__/healLoop.test.ts __tests__/journalWikiMachine.test.ts` → RED.
4. Implement `healLoop.ts` + machine changes per Design.
5. Same command → GREEN; `npx tsc --noEmit && npm test` (now **23** test files) → clean.
6. Commit: `fix: drain all heal batches in Night Shift with abort-safe loop (wiki 5.0 batched runHeal)`

### Task 4: Surface ingest partial failures (TDD)

**Objective:** Failed chunks are reported to the user instead of silently dropped; helper typed against the real library type.

**Files:** Create: `src/lib/ingestReport.ts`, `__tests__/ingestReport.test.ts`, `__tests__/journalSaveWarning.test.tsx`. Modify: `src/app/(tabs)/journal.tsx` (`handleSave`).

**Steps:**
0. From the installed `.d.ts`: confirm `IngestResult`'s exact field types (`failedChunks: number` vs array; whether `parseFailures` overlaps `failedChunks`) and what `useWikiIngest().execute` **returns** (result vs `void`-with-hook-state). If `execute` returns void, read the result from the hook's returned state instead of the call's return value. Record findings in the PR.
1. **Failing test** (`__tests__/ingestReport.test.ts`): typed against the confirmed library type — sums failures correctly; zero for clean result; zero for `null`/`undefined`.
2. **Failing render test** (`__tests__/journalSaveWarning.test.tsx`): mock `useWikiIngest` (and the other journal hooks) so `execute` resolves with a failing `IngestResult`; render `JournalScreen`; trigger save; assert `Alert.alert` called with the failure count. Clean result → `Alert.alert` not called.
3. Run both → RED.
4. Implement `src/lib/ingestReport.ts`: `countIngestFailures(result: IngestResult | null | undefined): number` importing the library type — once the shape is confirmed in step 0, use it directly (no `Number()` coercion, no `Array.isArray` defensive branch — defensive typing defeats the shape-drift protection this change exists for).
5. Wire into `journal.tsx` `handleSave`: capture result → `countIngestFailures` → if > 0, `Alert.alert('Saved with warnings', ...)`. Save flow (close editor, refetch) unchanged on both paths. Add `Alert` to the `react-native` import.
6. `npx tsc --noEmit && npm test` (now **25** test files) → clean.
7. Commit: `feat: surface partial ingest failures on journal save`

### Task 5: OKF 0.2 explicit profile + docs

**Objective:** Export declares `llm-wiki/2` deliberately; docs match reality.

**Files:** Modify: `src/lib/okfExport.ts`, `README.md`, `AGENTS.md`.

**Steps:**
1. Confirm the option key against the installed `.d.ts` (expected `profile`), then `okfExport.ts`: `formatOkfBundle(dump, { profile: 'llm-wiki/2' })` — deliberate pin (spec §5.3: a future default flip must not silently change our export format).
2. `README.md`: refresh every stale mention — grep `v0\.1` (`:13, :26, :157, :171`) and SDK 56 / RN 0.85 (`:4, :9, :84, :120, :158, :204`). Line-by-line judgement: badges/prose about THIS app → SDK 57 / RN 0.86; OKF claims → "OKF v0.2 (imports legacy v0.1 bundles)"; the `:171` `core-okf` row describes the library primitive — with 7.7.4 emitting 0.2, update it to reflect 0.2-first with 0.1 read compatibility.
3. `AGENTS.md`: docs URL `versions/v56.0.0/` → `versions/v57.0.0/`.
4. Do NOT touch the spec `Status:` line or PR approval checkboxes — those are Kurt's.
5. `npx tsc --noEmit && npm test && npm run lint` → clean.
6. Commit: `docs: OKF 0.2 export profile and SDK 57 docs pointers`

### Task 6: Final gates + PR finish

**Steps:**
1. `npx expo-doctor@latest`, `npx tsc --noEmit`, `npm test`, `npm run lint` → all clean.
2. `git push origin chore/sdk57-llm-wiki-7`.
3. Update PR #9: tick the **implementation** box; leave "spec approved" and "dev build verified on device" for Kurt; comment summarizing the dependency matrix, heal-loop stop paths, ingest warning path, OKF 0.2 profile pin, and his test checklist (new dev build → journal save incl. failure path, Night Shift full pass drains to `remaining === 0`, abort/IMPORT mid-heal stops within one batch, export frontmatter shows `okf_version: "0.2"` + `generated: {by, at}`, re-import + legacy 0.1 import).
4. Merge: regular merge commit (house rule), after Kurt's device verification and spec-approval tick.

---

## Risks / tradeoffs

- Shared-signal mutation (`nightShiftSignal.aborted = true` inside an action) is deliberately impure: it lets the in-flight invoked actor observe abort without stale-context bugs; the xstate AbortSignal covers invoke-stop paths the flag can't see.
- Verbatim adapter forwarding means we never pass a `shouldContinue` function into the library — if the library later adds a second parameter, this call site cannot accidentally forward the wrong thing.
- Heal cap 200 + no-progress guard bound worst-case runtime even when non-convergent candidates keep `remaining` positive.
- `Alert.alert` is minimal surfacing; a themed banner can replace it later without touching the helper.
