# Platform Upgrade — Expo SDK 57, expo-llm-wiki 7.7.4, OKF 0.2

Date: 2026-09-24
Status: Draft (awaiting approval)
Parent spec: [Curated Journal demo app](./2026-06-24-curated-journal-demo-app.md)
Target platform: Expo SDK 57 (React Native 0.86.3, React 19.2.3)

---

## 1. Problem Statement

Curated Journal has been frozen at SDK 56 since June 2026. Three drifts have accumulated:

1. **Hard peer conflict.** `@equationalapplications/expo-llm-wiki@^4.17.0` caps `expo-sqlite` at `^56` — it **cannot** be installed alongside Expo SDK 57's `expo-sqlite ~57.0.3`. Any SDK 57 move requires the wiki bump; there is no SDK-57-compatible version of the old wiki line.
2. **Format drift.** The app advertises OKF v0.1; the format moved to **v0.2** (upstream spec released in `GoogleCloudPlatform/knowledge-catalog`, §13 "Changes from v0.1"). Desktop Curated Thoughts already reads/writes 0.2, so desktop↔mobile bundles are diverging.
3. **Known memory regression.** SDK 56 shipped a Hermes regression that drastically increases memory in apps importing `react-native-worklets`/`react-native-reanimated` (expo/expo#46519) — both of which this app imports. Fixed in RN 0.86.3, which ships in `expo@57.0.17+`.

## 2. Goals

| ID | Goal |
|----|------|
| G1 | App builds and runs on Expo SDK 57 (`expo ~57.0.24`, RN 0.86.3, React 19.2.3 unchanged, TS ~6.0.3 unchanged). |
| G2 | `@equationalapplications/expo-llm-wiki` exact-pinned at **7.7.4** (no caret); `@equationalapplications/core-llm-wiki` (imported directly by `src/`, currently only transitive) declared and exact-pinned at **7.7.4** — all facade packages in lockstep. |
| G3 | Export produces OKF **0.2** bundles (library default profile `llm-wiki/2`); import accepts 0.1 and 0.2 (library read-side fallbacks, per upstream §13 mandate — same contract desktop Curated Thoughts implements). |
| G4 | Night Shift heal **under-heals no more**: loop on `HealResult.remaining` (bounded-batch semantics since wiki 5.0.0). |
| G5 | Ingest partial failures are surfaced, not silently dropped (`IngestResult.failedChunks` / `parseFailures`, wiki 5.5.0). |
| G6 | All tests pass (`jest`), `tsc --noEmit` clean, `expo-doctor` clean, new dev-client build verified on device. |

## 3. Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | New user-facing features | Pure platform/dependency upgrade. |
| NG2 | llama.rn 0.13 | Still RC (`0.13.0-rc.5`); stay on stable 0.12.5. |
| NG3 | Optional major bumps (react-native-zip-archive 9.x, nitro-unzip 0.6) | Not required by SDK 57; separate risk, separate PR later. |
| NG4 | Handling the 8 open Dependabot PRs | They target the old tree; housekeeping after this PR lands (likely close-as-superseded). |
| NG5 | Embedding-based retrieval | MiniSearch keyword retrieval remains; `LLMProvider.embed` stays unimplemented. |

## 4. Dependency Changes (verified against `expo@57.0.24` bundledNativeModules + SDK 57 template)

| Package | Current | Target |
|---|---|---|
| expo | ~56.0.12 | **~57.0.24** |
| @expo/ui | ~56.0.18 | ~57.0.19 |
| expo-application | ~56.0.3 | ~57.0.3 |
| expo-battery | ~56.0.4 | ~57.0.3 |
| expo-constants | ~56.0.18 | ~57.0.19 |
| expo-crypto | ~56.0.4 | ~57.0.3 |
| expo-dev-client | ~56.0.20 | ~57.0.19 |
| expo-device | ~56.0.4 | ~57.0.2 |
| expo-document-picker | ~56.0.4 | ~57.0.2 |
| expo-file-system | ~56.0.8 | ~57.0.7 |
| expo-font | ~56.0.7 | ~57.0.4 |
| expo-glass-effect | ~56.0.4 | ~57.0.3 |
| expo-haptics | ~56.0.3 | ~57.0.3 |
| expo-image | ~56.0.11 | ~57.0.5 |
| expo-keep-awake | ~56.0.3 | ~57.0.2 |
| expo-linking | ~56.0.14 | ~57.0.10 |
| expo-network | ~56.0.5 | ~57.0.2 |
| expo-router | ~56.2.11 | ~57.0.22 |
| expo-secure-store | ~56.0.4 | ~57.0.4 |
| expo-sharing | ~56.0.18 | ~57.0.21 |
| expo-splash-screen | ~56.0.10 | ~57.0.9 |
| expo-sqlite | ~56.0.5 | ~57.0.3 |
| expo-status-bar | ~56.0.4 | ~57.0.1 |
| expo-symbols | ~56.0.6 | ~57.0.3 |
| expo-system-ui | ~56.0.5 | ~57.0.4 |
| expo-web-browser | ~56.0.5 | ~57.0.3 |
| react / react-dom | 19.2.3 | unchanged |
| react-native | 0.85.3 | **0.86.3** |
| react-native-gesture-handler | ~2.31.1 | ~2.32.0 |
| react-native-reanimated | 4.3.1 | **4.5.1** (exact) |
| react-native-worklets | 0.8.3 | **0.10.1** (exact; must move with reanimated — peer-pinned pair) |
| react-native-safe-area-context | ~5.7.0 | unchanged |
| react-native-screens | 4.25.2 | ~4.26.0 |
| react-native-web | ~0.21.0 | unchanged |
| @shopify/react-native-skia | ^2.6.7 | unchanged (already satisfies bundled range; RN 0.86 peers OK) |
| @equationalapplications/expo-llm-wiki | ^4.17.0 | **7.7.4 (exact)** |
| @equationalapplications/core-llm-wiki | undeclared (transitive 4.17.0) | **7.7.4 (exact, declared)** |
| llama.rn | ^0.12.5 | unchanged |
| react-native-nitro-unzip | ^0.5.3 | unchanged |
| react-native-zip-archive | ^8.0.1 | unchanged |
| jest-expo | ^56.0.5 | ~57.0.5 |
| eslint-config-expo | ~56.0.4 | ~57.0.2 |
| typescript / @types/react | ~6.0.3 / ~19.2.2 | unchanged (do NOT jump to TS 7) |
| @testing-library/react-native / jest | ^14.0.1 / ^29.7.0 | unchanged |

Application of changes (two-step): `npx expo install expo@~57.0.24` then `npx expo install --fix`; hand-set the wiki + core-llm-wiki exact pins and the reanimated/worklets exact pair; then `npx expo-doctor@latest`.

## 5. Code Changes (the complete list)

### 5.1 Night Shift heal loop — `src/machines/journalWikiMachine.ts` (+ `src/hooks/useJournalWiki.tsx`)

Wiki 5.0.0/6.0.0 changed `runHeal`: one call processes at most `HEAL_BATCH_SIZE` candidates and returns `HealResult { remaining, skipped: Array<{id, reason}>, degraded: [...] }`. The current wrapper (`runHeal: (entityId) => Promise<void>`) discards the result, so Night Shift heals one batch and stops.

Change (loop lives in the machine's heal step; the adapter and library call signatures are unchanged):
- `MaintenanceApi.runHeal` becomes `(entityId: string) => Promise<HealBatchResult>` — a single batch's raw library result (librarian/reembed/prune stay `Promise<void>`). The provider adapter forwards verbatim: `(entityId) => maintenanceRef.current.runHeal(entityId)`.
- The machine's `runStep` actor (heal case) loops via `runHealToCompletion` with `shouldContinue: () => !input.signal.aborted && !signal.aborted`, where `input.signal` is the machine's shared abort-signal object (set by `ABORT_NIGHT_SHIFT`) and `signal` is xstate's built-in `fromPromise` AbortSignal — so ALL THREE stop paths take effect between batches: explicit abort (flag), an IMPORT stopping the invoke (`busyRetry` transition), and provider unmount (`actor.stop()`).
- Loop termination, checked in order AFTER each batch (`shouldContinue` is not consulted before the first batch): `remaining === 0` → done, `exhausted: false` (takes priority over the cap — a cap-limited run whose last batch returns 0 is a clean finish); else `!shouldContinue()` → stop; else `remaining` not shrinking vs previous iteration → stop (`noProgress: true`); else `batches >= maxBatches` (default 200, clamped to ≥ 1) → stop (`exhausted: true`).
- The summary `HealStepSummary = { batches, skipped, degraded, exhausted, noProgress, remaining }` is surfaced on completion or explicit abort: stored on machine context as `lastHealSummary` (reset on `START_NIGHT_SHIFT`), available to the Night Shift summary UI. `skipped` shape changed `number → Array<{id, reason}>` — display code reads the aggregated count, not the raw array. On invoke-stop paths (IMPORT/`busyRetry`, provider unmount) `step.onDone` never fires, so the context write is skipped by design; instead the loop logs the partial summary via `console.warn` whenever it stops because the signal aborted, so an interrupted heal always leaves a trace. `exhausted`/`noProgress` stops are also logged.

### 5.2 Surface ingest failures — `src/app/(tabs)/journal.tsx`

Wiki 5.5.0 widened `IngestResult` with `failedChunks` / `parseFailures`; partial chunk failure no longer throws. The save path currently ignores the result. Change: check the resolved value and show a non-blocking warning (e.g. toast/banner "Saved with N chunk failures") when either is non-empty. `error` remains reserved for total failure. The helper is typed against the library's `IngestResult` (not `unknown`) so `tsc` catches shape drift; before wiring, confirm from the 7.7.4 `.d.ts` what `execute` actually returns (if it returns `void` and only stores state, read the result from the hook's state instead).

### 5.3 OKF 0.2 — zero code change, two touch-ups

- `formatOkfBundle(dump)` defaults to profile `llm-wiki/2` / `okf_version: "0.2"` — export becomes 0.2 automatically. We deliberately pass `{ profile: 'llm-wiki/2' }` explicitly in `src/lib/okfExport.ts`: pinning the profile means a future library default flip cannot silently change our export format; adopting a future profile should be a reviewed decision.
- `parseOkfBundle` already accepts v0.1, v0.2, and unknown-profile-0.2 bundles with the spec §13 fallbacks (timestamp→generated, `# Citations`→`sources`). No change in `src/app/import.tsx`.
- README: update OKF wording to "OKF v0.2 (imports legacy v0.1 bundles)" — grep all occurrences of `v0\.1` (`:13, :26, :157, :171`) and SDK 56 / RN 0.85 mentions (`:4, :9, :84, :120, :158, :204`) and refresh each; update the AGENTS.md Expo docs pointer v56 → v57.
- New peer dep check: `expo-crypto >= 12` (7.7.4 requirement) — satisfied by ~57.0.3.

### 5.4 Verified unchanged (no action)

`createWiki`, `WikiProvider`, `WikiConfig` keys used, `LLMProvider.generateText` (+ new `this`-binding guarantee, no impact on our closure provider), `importDump(dump, {merge})`, `useMemoryRead`/`maxResults`, `useEntityStatus`, `useWikiExport`, ontology hooks, graph data fields — all identical or additively extended between 4.17.0 and 7.7.4 (verified by published-tarball `.d.ts` diff, not just changelogs — the old changelog tooling missed `!` markers before 7.0.0).

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| RN 0.85→0.86 native regression breaks llama.rn or Skia | Both peers permissive and officially non-breaking release; dev-client build on physical device is a gate (G6). llama.rn stays on stable 0.12.5. |
| react-native-worklets 0.8→0.10 removed `workletizableModules` babel option | Repo's babel config doesn't use it (verified); only relevant if a dep sets it — expo-doctor + build will catch. |
| Unrecorded breakage 4.17→7.7.4 (changelog gap pre-7.0.0) | Compensated: tarball `.d.ts` diff at both endpoints; only changes are §5.1/§5.2. Exact pin prevents silent drift. |
| Old dev-client binary can't load RN 0.86 JS | New development build required post-upgrade (documented in PR test plan). |
| 0.1 bundles in the wild | Importer fallbacks spec-mandated (§13) and library-implemented; desktop Curated Thoughts ships the same contract — cross-checked. |

## 7. Test Plan

1. `npm ci` after dep changes; `npx expo-doctor@latest` clean.
2. `npx tsc --noEmit` clean; `npm test` (jest-expo 57) green.
3. New dev build (`expo run:ios` / `run:android` with dev-client) on physical device.
4. Manual smoke: save journal entry (ingest — verify warning path by forcing a chunk failure or at minimum confirming the success path compiles against the widened result), Night Shift full pass (verify heal loops to `remaining === 0`), export bundle → inspect frontmatter shows `okf_version: "0.2"` + `generated: {by, at}`, re-import the same bundle, and import a legacy 0.1 bundle.
5. Optional cross-check: import a bundle exported by desktop Curated Thoughts.

## 8. Implementation Order

1. Branch `chore/sdk57-llm-wiki-7` off `feature/curated-journal-demo`.
2. Dependency matrix (§4) via `npx expo install expo@^57.0.0 --fix` + manual pins.
3. Code changes §5.1, §5.2, §5.3.
4. Test plan §7; iterate until G6 met.
5. PR open at spec stage now; implementation commits land on the same branch after Kurt's approval.

## 9. Review Trail

- 2026-09-24 Opus review (medium effort, $0.37): direction approved; MAJOR items 1–4 addressed in this revision — heal loop moved into the machine's heal step with abort callback, no-progress guard, and surfaced summary (§5.1); ingest helper typed against `IngestResult` with an explicit `.d.ts` check of `execute`'s return (§5.2); `core-llm-wiki` declared and pinned (G2, §4); install flow made two-step (§4, §8). MINOR items (README spot list, maxBatches clamp, ingest render test, deliberate profile pin rationale, test-count wording) folded into the plan.
- 2026-09-24 Opus plan review round 2 (medium effort, $0.42): direction sound; MAJOR 1–4 addressed — loop now also honors xstate's invoke AbortSignal (IMPORT-during-heal and unmount stop the loop between batches, not just explicit abort); adapter-level "variant B" dropped (adapter forwards verbatim, no arg forwarding into the library); §5.1 rewritten to match the plan's design; Kurt's spec approval ("The draft spec is good", 2026-09-24) recorded as a plan precondition instead of implementer self-approval. MINORs folded into the plan (named reset action shared by both START_NIGHT_SHIFT handlers, `lastHealSummary` reset, abort test drives the real event, corrected test counts, `countIngestFailures` typed directly against the confirmed library type, README `core-okf` row updated, 11 direct `core-llm-wiki` import sites).
- 2026-09-24 Opus plan review round 3 (medium effort, $0.43): "direction is sound and the round-1 issues are resolved." Final two MAJORs applied — Task 3 step 0 now also verifies the hook's `runHeal` RETURN type, with a pre-decided fallback (machine calls `input.wiki.runHeal(entityId)` from context if the hook resolves `void`); §5.1 wording corrected to "surfaced on completion or explicit abort" with invoke-stop paths logging the partial summary instead. MINORs applied: explicit termination ordering (`remaining === 0` beats the cap; `shouldContinue` checked after each batch only) + cap-with-0 test; the IMPORT-during-heal test asserts post-import queue state and the leftover-queue `isBusyState` debt gets a one-line fix (night-shift fields cleared on the IMPORT transition); `useJournalWiki.tsx` marked unchanged (verbatim forward already in place); signal object explicitly "constructed in the context factory". Review loop converged.
