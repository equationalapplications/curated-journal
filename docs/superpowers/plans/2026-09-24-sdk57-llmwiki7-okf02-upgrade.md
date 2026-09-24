# SDK 57 + expo-llm-wiki 7.7.4 + OKF 0.2 Implementation Plan

> **Note to implementer:** Implement task-by-task on branch `chore/sdk57-llm-wiki-7`, committing after each task. Spec: `docs/superpowers/specs/2026-09-24-sdk57-llmwiki7-okf02-upgrade.md` (§5.1 heal design revised after Opus review — see spec §9).

**Goal:** Upgrade Curated Journal to Expo SDK 57, exact-pin `@equationalapplications/expo-llm-wiki` and `@equationalapplications/core-llm-wiki` at 7.7.4, emit OKF 0.2, fix the two behavioral breaks (heal batching with abort-safe loop, ingest failure surfacing), and finish PR #9 with all gates green.

**Architecture:** Dependency bump first (gates re-established), then the heal loop implemented **inside the machine's heal step** (Opus MAJOR 1/2: an adapter-level loop would disable abort for the whole loop and discard the summary), driven by a mutable abort signal stored on machine context. Ingest failures surfaced via a helper typed against the library's `IngestResult`. Docs last.

**Tech Stack:** Expo SDK 57, RN 0.86.3, xstate 5, jest-expo 57, TypeScript ~6.0.3.

---

## Current context / assumptions

- Branch `chore/sdk57-llm-wiki-7` exists with spec + this plan; PR #9 open, base `feature/curated-journal-demo`.
- `node_modules` not yet installed — Task 1 installs fresh.
- Verified facts (spec §4/§5, research briefs): SDK 57 matrix; wiki API diff = heal batch semantics + `IngestResult` widening only; `formatOkfBundle(dump, { profile: 'llm-wiki/2' })`; `parseOkfBundle` unchanged; `expo-crypto >= 12` satisfied.
- `HealResult` (7.7.4) = `{ remaining: number, skipped: Array<{id, reason}>, degraded: [...] }` — verify exact shape from `node_modules/@equationalapplications/expo-llm-wiki/dist/*.d.ts` (and the core package) in Task 3 step 0 before coding; adjust the structural type if it differs.
- Device dev-build gate stays with Kurt (PR checkbox).

---

### Task 1: Dependency matrix to SDK 57

**Objective:** All deps at spec §4 targets; install succeeds; expo-doctor clean.

**Files:** Modify: `package.json` (via tools; lockfile follows)

**Steps:**
1. Two-step upgrade: `npx expo install expo@~57.0.24` then `npx expo install --fix` (auto-maps expo-* family, RN, gesture-handler, screens, jest-expo, eslint-config-expo).
2. Hand-set in `package.json`:
   - `"@equationalapplications/expo-llm-wiki": "7.7.4"` (exact)
   - `"@equationalapplications/core-llm-wiki": "7.7.4"` (exact, **newly declared** — imported directly by `src/` in 9 places but previously only transitive)
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

**Objective:** Night Shift heal drains all batches; abort takes effect **between batches**; summary (`exhausted`, skipped/degraded counts) is stored on context and logged, never discarded.

**Design (per spec §5.1, post-review):**
- `src/lib/healLoop.ts` (pure, unit-tested): `runHealToCompletion(runBatch, entityId, opts)` where `runBatch: (entityId: string, shouldContinue?: () => boolean) => Promise<HealBatchResult>`, `opts = { shouldContinue?: () => boolean; maxBatches?: number }`. Returns `HealStepSummary = { batches, skipped, degraded, exhausted, noProgress, remaining }`. Guards: stop when `shouldContinue()` returns false; stop when `remaining` stops shrinking (`noProgress: true`); cap at `maxBatches` (default 200, clamped to ≥ 1; `exhausted: true` on cap). Warn via `console.warn` on exhausted/noProgress.
- `journalWikiMachine.ts`:
  - `MaintenanceApi.runHeal: (entityId: string, shouldContinue?: () => boolean) => Promise<HealBatchResult>` (single batch, returns raw result — librarian/reembed/prune stay `Promise<void>`).
  - New context field `nightShiftSignal: { aborted: boolean }` (object created from machine `input`, kept by reference — invoked actors can read it live without stale-context bugs) and `lastHealSummary: HealStepSummary | null`.
  - `START_NIGHT_SHIFT` action resets both `aborted: false` and `nightShiftSignal.aborted = false`; `ABORT_NIGHT_SHIFT` action additionally sets `nightShiftSignal.aborted = true` (deliberate mutation of the shared signal object so the in-flight loop sees it immediately).
  - `runStep` actor input gains `signal: context.nightShiftSignal`; the heal case of `runQueueStep` becomes `return runHealToCompletion(maintenance.runHeal, item.entityId, { shouldContinue: () => !input.signal.aborted })`; the actor returns the summary as its output.
  - `onDone` of `step`: `assign({ lastHealSummary: ({ event }) => (event.output && 'batches' in event.output ? event.output : context.lastHealSummary) })`.
  - `useJournalWiki.tsx` adapter: pass the `shouldContinue` argument through unchanged (`(entityId, shouldContinue) => maintenanceRef.current.runHeal(entityId, shouldContinue)`).
  - Night Shift summary UI: if it already renders per-step results, extend it minimally to show skipped/degraded counts when `lastHealSummary` is set; otherwise context storage + log is enough for this PR — no new UI surface.

**Files:** Create: `src/lib/healLoop.ts`, `__tests__/healLoop.test.ts`. Modify: `src/machines/journalWikiMachine.ts`, `src/hooks/useJournalWiki.tsx`, `__tests__/journalWikiMachine.test.ts`.

**Steps:**
0. From the installed 7.7.4 `.d.ts`: confirm the exact `HealResult` shape and that `useWikiMaintenance().runHeal` accepts/forwards a second argument. If it does **not** forward extra args, use variant B: the provider adapter calls the library `runHeal` once per batch itself — i.e. invoke `runHealToCompletion` inside the provider's `runHeal` implementation, but keep `shouldContinue` plumbed through `MaintenanceApi` exactly as designed (abort semantics unchanged; summary still returned to the machine). Record which variant was needed in the PR.
1. **Failing tests** (`__tests__/healLoop.test.ts`): loop drains `remaining` to 0 (2→1→0, accumulate skipped/degraded, `batches: 3`); `shouldContinue() === false` stops after the current batch (`exhausted: false`, partial summary); no-progress stop (two consecutive equal `remaining` > 0 → `noProgress: true`, stops); cap (`maxBatches: 3`, always `remaining: 5` → `exhausted: true`, exactly 3 calls); `maxBatches: 0` clamps to 1 call.
2. **Failing machine tests** (extend `__tests__/journalWikiMachine.test.ts`): heal queue item drains multiple batches (mock `runHeal` returning decreasing `remaining`; assert call count and `idle` reached); `ABORT_NIGHT_SHIFT` mid-heal stops between batches (mock a batch that flips the signal then resolves; assert subsequent `runHeal` calls stop and machine reaches `idle`); `lastHealSummary` lands in context after heal completes (read via `actor.getSnapshot()`). Update existing mocks: `runHeal: jest.fn(async () => ({ remaining: 0, skipped: [], degraded: [] }))` etc.
3. Run `npx jest __tests__/healLoop.test.ts __tests__/journalWikiMachine.test.ts` → RED.
4. Implement `healLoop.ts` + machine changes per Design.
5. Same command → GREEN; `npx tsc --noEmit && npm test` (now **25** test files) → clean.
6. Commit: `fix: drain all heal batches in Night Shift with abort-safe loop (wiki 5.0 batched runHeal)`

### Task 4: Surface ingest partial failures (TDD)

**Objective:** Failed chunks are reported to the user instead of silently dropped; helper typed against the real library type.

**Files:** Create: `src/lib/ingestReport.ts`, `__tests__/ingestReport.test.ts`, `__tests__/journalSaveWarning.test.tsx`. Modify: `src/app/(tabs)/journal.tsx` (`handleSave`).

**Steps:**
0. From the installed `.d.ts`: confirm `IngestResult`'s exact field types (`failedChunks: number` vs array; whether `parseFailures` overlaps `failedChunks`) and what `useWikiIngest().execute` **returns** (result vs `void`-with-hook-state). If `execute` returns void, read the result from the hook's returned state instead of the call's return value. Record findings in the PR.
1. **Failing test** (`__tests__/ingestReport.test.ts`): typed against the confirmed shape — sums failures correctly; zero for clean result; zero for `null`/`undefined`.
2. **Failing render test** (`__tests__/journalSaveWarning.test.tsx`): mock `useWikiIngest` (and the other journal hooks) so `execute` resolves with a failing `IngestResult`; render `JournalScreen`; trigger save; assert `Alert.alert` called with a message containing the failure count. Second case: clean result → `Alert.alert` not called.
3. Run both → RED.
4. Implement `src/lib/ingestReport.ts`: `countIngestFailures(result: IngestResult | null | undefined): number` importing the library type (no `unknown` — `tsc` must catch shape drift; numeric coercion on purpose: `Number(r.failedChunks ?? 0) + (Array.isArray(r.parseFailures) ? r.parseFailures.length : 0)` guarded per confirmed shape).
5. Wire into `journal.tsx` `handleSave`: capture result → `countIngestFailures` → if > 0, `Alert.alert('Saved with warnings', ...)`. Save flow (close editor, refetch) unchanged on both paths. Add `Alert` to the `react-native` import.
6. `npx tsc --noEmit && npm test` (26 files) → clean.
7. Commit: `feat: surface partial ingest failures on journal save`

### Task 5: OKF 0.2 explicit profile + docs

**Objective:** Export declares `llm-wiki/2` deliberately; docs match reality.

**Files:** Modify: `src/lib/okfExport.ts`, `README.md`, `AGENTS.md`, spec `Status:` line.

**Steps:**
1. Confirm the option key against the installed `.d.ts` (expected `profile`), then `okfExport.ts`: `formatOkfBundle(dump, { profile: 'llm-wiki/2' })` — deliberate pin (spec §5.3: a future default flip must not silently change our export format).
2. `README.md`: refresh every stale mention — grep `v0\.1` (`:13, :26, :157, :171`) and SDK 56 / RN 0.85 (`:4, :9, :84, :120, :158, :204`); line-by-line judgement: version badges/prose → SDK 57 / RN 0.86; OKF claims → "OKF v0.2 (imports legacy v0.1 bundles)"; `:157`/`:171` ecosystem-table rows updated only where they describe THIS app (leave rows describing other packages' own versions alone).
3. `AGENTS.md`: docs URL `versions/v56.0.0/` → `versions/v57.0.0/`.
4. Spec `Status: Draft (awaiting approval)` → `Status: Approved`.
5. `npx tsc --noEmit && npm test && npm run lint` → clean.
6. Commit: `docs: OKF 0.2 export profile and SDK 57 docs pointers`

### Task 6: Final gates + PR finish

**Objective:** Everything CI-runnable green; PR body updated.

**Steps:**
1. `npx expo-doctor@latest` → clean. `npx tsc --noEmit`, `npm test`, `npm run lint` → clean.
2. `git push origin chore/sdk57-llm-wiki-7`.
3. Update PR #9: check spec-approval + implementation boxes; leave "dev build verified on device" UNCHECKED for Kurt (requires his hardware); post a summary comment of what changed and what he needs to test (new dev build → journal save incl. failure path, Night Shift full pass drains to `remaining === 0` and abort stops within one batch, export frontmatter shows `okf_version: "0.2"` + `generated: {by, at}`, re-import + legacy 0.1 import).
4. Merge policy: regular merge commit (house rule) — after Kurt's device verification.

---

## Risks / tradeoffs

- Shared-signal mutation (`nightShiftSignal.aborted = true` inside an action) is deliberately impure: it is the mechanism that lets an in-flight invoked actor observe abort without stale-context bugs; documented in machine comments.
- If the library's `useWikiMaintenance().runHeal` does not forward a second argument, Task 3 step 0's variant B (loop in provider, signal plumbed through `MaintenanceApi`) keeps abort semantics identical; decision recorded in the PR.
- Heal cap 200 + no-progress guard bound worst-case runtime even when non-convergent candidates keep `remaining` positive.
- `Alert.alert` is minimal surfacing; a themed banner can replace it later without touching the helper.
