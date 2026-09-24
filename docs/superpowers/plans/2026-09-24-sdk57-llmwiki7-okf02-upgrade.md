# SDK 57 + expo-llm-wiki 7.7.4 + OKF 0.2 Implementation Plan

> **For Hermes:** Implement task-by-task on branch `chore/sdk57-llm-wiki-7`, committing after each task. Spec: `docs/superpowers/specs/2026-09-24-sdk57-llmwiki7-okf02-upgrade.md`.

**Goal:** Upgrade Curated Journal to Expo SDK 57, exact-pin `@equationalapplications/expo-llm-wiki` at 7.7.4, emit OKF 0.2, fix the two behavioral breaks (heal batching, ingest failure surfacing), and finish PR #9 with all gates green.

**Architecture:** Dependency bump first (gates re-established), then two small TDD'd library helpers (`healLoop`, `ingestReport`) wired into existing call sites, then docs touch-ups. No machine/state-chart changes — the heal loop lives in the provider adapter so `MaintenanceApi` stays `Promise<void>`.

**Tech Stack:** Expo SDK 57, RN 0.86.3, xstate 5, jest-expo 57, TypeScript ~6.0.3.

---

## Current context / assumptions

- Branch `chore/sdk57-llm-wiki-7` exists with the spec committed (PR #9 open, base `feature/curated-journal-demo`).
- Repo clean-clone state: `node_modules` NOT installed yet — Task 1 installs everything fresh.
- Verified facts (from research briefs, cited in spec): SDK 57 target matrix (spec §4); wiki API diff (only `runHeal` batch semantics + `IngestResult` widening matter); `formatOkfBundle(dump, { profile: 'llm-wiki/2' })` valid; `parseOkfBundle` unchanged; `expo-crypto >= 12` satisfied by ~57.0.3.
- `HealResult` = `{ remaining: number, skipped: Array<{id, reason}>, degraded: Array<{id, ...}> }`. If the facade does not export the `HealResult` type name, define the structural type locally in `healLoop.ts` (verified at implementation time from `node_modules/.d.ts`).
- Gates that cannot run in CI here: on-device dev build (stays with Kurt, tracked as PR checkbox).

---

### Task 1: Dependency matrix to SDK 57

**Objective:** All deps at spec §4 targets; install succeeds; expo-doctor has no SDK-version complaints.

**Files:**
- Modify: `package.json`

**Steps:**
1. Run: `npx expo install expo@~57.0.24 --fix` — auto-maps the expo-* family, RN, gesture-handler, screens, jest-expo, eslint-config-expo.
2. Hand-set in `package.json` (exact/tilde per spec §4):
   - `"@equationalapplications/expo-llm-wiki": "7.7.4"` (exact, no caret)
   - `"react-native-reanimated": "4.5.1"`, `"react-native-worklets": "0.10.1"` (exact, peer-pinned pair)
   - Verify `react`, `react-dom`, `typescript`, `@types/react`, `react-native-safe-area-context`, `react-native-web`, `@shopify/react-native-skia`, `llama.rn`, `react-native-nitro-unzip`, `react-native-zip-archive`, `@testing-library/react-native`, `jest` are UNCHANGED.
3. Run: `npm install`
4. Run: `npx expo-doctor@latest` — expected: no errors (warn-only output acceptable; record anything non-obvious in the PR).
5. Sanity: `node -e "console.log(require('@equationalapplications/expo-llm-wiki/package.json').version)"` → `7.7.4`; `npm ls expo-sqlite react-native-worklets` → no peer conflicts.
6. Commit: `chore: upgrade to Expo SDK 57 and pin expo-llm-wiki 7.7.4`

### Task 2: Existing suite green on SDK 57

**Objective:** No regressions before any code change.

**Steps:**
1. Run: `npx tsc --noEmit` → clean (fix trivial type fallout only if any; the API diff predicts none).
2. Run: `npm test` → all 22 existing test files pass. `journalWikiMachine.test.ts` mocks `runHeal` as `async () => undefined` — the machine still accepts that until Task 3 changes the provider adapter, so it must pass as-is.
3. Run: `npm run lint` → clean.
4. Commit only if files changed: `chore: accommodate SDK 57 type/test fallout` (expected: no-op).

### Task 3: Heal loop helper (TDD)

**Objective:** Night Shift heal drains all bounded batches instead of one.

**Files:**
- Create: `src/lib/healLoop.ts`
- Test: `__tests__/healLoop.test.ts`
- Modify: `src/hooks/useJournalWiki.tsx:51-60` (maintenance adapter only)

**Step 1: failing test** (`__tests__/healLoop.test.ts`):

```ts
import { runHealToCompletion } from '@/lib/healLoop';

describe('runHealToCompletion', () => {
  it('loops until remaining is 0, accumulating skipped/degraded', async () => {
    const results = [
      { remaining: 2, skipped: [{ id: 'a', reason: 'non_convergent' }], degraded: [] },
      { remaining: 1, skipped: [], degraded: [{ id: 'b' }] },
      { remaining: 0, skipped: [], degraded: [] },
    ];
    let calls = 0;
    const runHeal = jest.fn(async () => results[calls++]!);
    const summary = await runHealToCompletion(runHeal, 'e1');
    expect(calls).toBe(3);
    expect(summary).toEqual({ batches: 3, skipped: 1, degraded: 1, remaining: 0, exhausted: false });
  });

  it('stops at the safety cap and reports exhausted', async () => {
    const runHeal = jest.fn(async () => ({ remaining: 5, skipped: [], degraded: [] }));
    const summary = await runHealToCompletion(runHeal, 'e1', 3);
    expect(runHeal).toHaveBeenCalledTimes(3);
    expect(summary.exhausted).toBe(true);
    expect(summary.batches).toBe(3);
  });
});
```

**Step 2:** Run `npx jest __tests__/healLoop.test.ts` → FAIL (module missing).

**Step 3: implementation** (`src/lib/healLoop.ts`):

```ts
type HealResultLike = {
  remaining: number;
  skipped: { id: string }[];
  degraded: unknown[];
};

export type HealLoopSummary = {
  batches: number;
  skipped: number;
  degraded: number;
  remaining: number;
  exhausted: boolean;
};

export const HEAL_MAX_BATCHES = 200;

export async function runHealToCompletion(
  runHeal: (entityId: string) => Promise<HealResultLike>,
  entityId: string,
  maxBatches: number = HEAL_MAX_BATCHES,
): Promise<HealLoopSummary> {
  let batches = 0;
  let skipped = 0;
  let degraded = 0;
  let remaining = Number.POSITIVE_INFINITY;
  while (remaining > 0) {
    if (batches >= maxBatches) {
      return { batches, skipped, degraded, remaining, exhausted: true };
    }
    const result = await runHeal(entityId);
    batches += 1;
    remaining = result.remaining;
    skipped += result.skipped.length;
    degraded += result.degraded.length;
  }
  return { batches, skipped, degraded, remaining: 0, exhausted: false };
}
```

(Structural typing: the real `HealResult` satisfies `HealResultLike`; no lib type import needed.)

**Step 4:** `npx jest __tests__/healLoop.test.ts` → PASS. Full suite still green.

**Step 5: wire into `src/hooks/useJournalWiki.tsx`** — replace the adapter line:

```ts
runHeal: (entityId: string) => maintenanceRef.current.runHeal(entityId),
```

with:

```ts
runHeal: async (entityId: string) => {
  await runHealToCompletion(
    (id) => maintenanceRef.current.runHeal(id),
    entityId,
  );
},
```

plus `import { runHealToCompletion } from '@/lib/healLoop';`. `MaintenanceApi.runHeal` stays `Promise<void>`; machine untouched.

**Step 6:** `npx tsc --noEmit && npm test` → clean.
**Step 7:** Commit: `fix: drain all heal batches in Night Shift (wiki 5.0 batched runHeal)`

### Task 4: Surface ingest partial failures (TDD)

**Objective:** Failed chunks are reported to the user instead of silently dropped.

**Files:**
- Create: `src/lib/ingestReport.ts`
- Test: `__tests__/ingestReport.test.ts`
- Modify: `src/app/(tabs)/journal.tsx:37-49` (`handleSave`)

**Step 1: failing test** (`__tests__/ingestReport.test.ts`):

```ts
import { countIngestFailures } from '@/lib/ingestReport';

describe('countIngestFailures', () => {
  it('sums failedChunks and parseFailures', () => {
    expect(countIngestFailures({ failedChunks: 2, parseFailures: [{}, {}] })).toBe(4);
  });
  it('treats absent fields and null as zero', () => {
    expect(countIngestFailures({ chunks: 3 })).toBe(0);
    expect(countIngestFailures(null)).toBe(0);
    expect(countIngestFailures(undefined)).toBe(0);
  });
});
```

**Step 2:** Run → FAIL.

**Step 3: implementation** (`src/lib/ingestReport.ts`):

```ts
type IngestResultLike = { failedChunks?: number; parseFailures?: unknown[] };

export function countIngestFailures(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as IngestResultLike;
  return (r.failedChunks ?? 0) + (r.parseFailures?.length ?? 0);
}
```

**Step 4:** Run → PASS.

**Step 5: wire into `journal.tsx`** — in `handleSave`, capture and report:

```ts
const result = await ingest(entityId, {
  sourceRef: `journal://${Date.now()}`,
  sourceHash: `${Date.now()}`,
  documentChunk: markdown,
});
const failures = countIngestFailures(result);
if (failures > 0) {
  Alert.alert('Saved with warnings', `${failures} chunk${failures === 1 ? '' : 's'} failed to ingest and were skipped.`);
}
setComposing(false);
refetch();
```

Add `Alert` to the `react-native` import and `countIngestFailures` import. Save flow (close editor, refetch) unchanged on both paths.

**Step 6:** `npx tsc --noEmit && npm test` → clean.
**Step 7:** Commit: `feat: surface partial ingest failures on journal save`

### Task 5: OKF 0.2 explicit profile + docs

**Objective:** Export declares `llm-wiki/2` explicitly; docs match reality.

**Files:**
- Modify: `src/lib/okfExport.ts:20`, `README.md` (OKF + SDK mentions), `AGENTS.md` (docs URL), `docs/superpowers/specs/2026-09-24-sdk57-llmwiki7-okf02-upgrade.md` (Status: Draft → Approved)

**Steps:**
1. `okfExport.ts:20`: `const { files } = formatOkfBundle(dump, { profile: 'llm-wiki/2' });` — confirm the exact option key against `node_modules/@equationalapplications/expo-llm-wiki/dist/*.d.ts` first (expected `profile`; adjust if named differently).
2. `README.md`: grep `SDK 56|v0\.1` — update badge and prose: SDK 57, "OKF v0.2 (imports legacy v0.1 bundles)".
3. `AGENTS.md`: docs URL `versions/v56.0.0/` → `versions/v57.0.0/`.
4. Spec status line → `Approved`.
5. `npx tsc --noEmit && npm test && npm run lint` → clean.
6. Commit: `docs: OKF 0.2 export profile and SDK 57 docs pointers`

### Task 6: Final gates + PR finish

**Objective:** Everything CI-runnable green; PR body updated.

**Steps:**
1. `npx expo-doctor@latest` → clean. `npx tsc --noEmit`, `npm test`, `npm run lint` → clean.
2. `git push origin chore/sdk57-llm-wiki-7`.
3. Update PR #9: check spec-approval + implementation boxes; leave "dev build verified on device" UNCHECKED for Kurt (requires his hardware); post a summary comment of what changed and what he needs to test (new dev build → journal save, Night Shift full pass, export shows `okf_version: "0.2"`, re-import + legacy 0.1 import).
4. Merge policy: regular merge commit (house rule) — after Kurt's device verification.

---

## Risks / tradeoffs

- Heal-loop cap of 200 batches is a run-away guard; on real journals one Night Shift pass is a handful of batches (HEAL_BATCH_SIZE defaults apply).
- `Alert.alert` is the simplest RN-native surfacing; a themed banner can replace it later without touching the helper.
- If `formatOkfBundle`'s option key differs from `profile`, Task 5 step 1 catches it from the local `.d.ts` before commit.
