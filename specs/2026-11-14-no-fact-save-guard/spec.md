# Spec: fail a journal save that stores no facts

Status: Implemented
Amended 2026-11-16 after review: partial-ingest path.
Spec approved by the owner 2026-11-16.
Date: 2026-11-14
Version cost: PATCH (9.1.1 → 9.1.2) per `docs/VERSIONING.md`
Closes: #112

## Problem

A journal note can be saved, counted as saved, and stored nowhere.

1. Saving hands the note's text to `wiki.ingestDocument` (`src/lib/journalIngest.ts`). The app keeps no other copy of the text.
2. The queue treats a resolved ingest as a saved note and drops the entry (`src/machines/journalSaveQueueMachine.ts`, the `onDone` transition).
3. The engine throws only when every chunk fails to parse. A chunk whose reply parses but holds an empty `facts` list counts as ingested.

The on-device model can answer every chunk with valid JSON and no facts. The save then resolves with `failedChunks: 0`, the entry leaves the queue, and the note is gone.

### Evidence (real run, 2026-11-14)

The reproduction test `__tests__/journalNoFactSave.test.ts` fails on `main` (`94296e7`). The engine is real (`createWiki` + node sqlite adapter); the model stub returns `{"facts": [], "tasks": []}`. The save resolves with:

```
{"chunks": 1, "ingestedChunks": 1, "failedChunks": 0, "truncated": false}
```

The engine's result (`IngestDocumentResult`) reports chunk counts only. It does not report how many facts were stored. So the queue cannot see this failure from the result alone.

## Root cause

`createJournalIngest` passes the engine's result through unchanged. It is the only layer that holds the `wiki` handle, so it is the only layer that can check what the engine actually stored. The fix belongs there. The queue machine needs no change: a rejected ingest already marks the entry `failed` and keeps its text.

## Proposed change

Add a stored-facts guard to `createJournalIngest` in `src/lib/journalIngest.ts`:

1. Call `wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' })` as today.
2. Read the save's content back with `wiki.listSourceRefs(entityId)` and sum `factCount` over rows whose `sourceHash` equals `params.sourceHash` (case-insensitive) OR whose `sourceRef` equals the save's normalized ref.
3. If that sum is greater than 0, return the result unchanged. This also covers a duplicate of a good save: `duplicateOf` alone is NOT success.
4. If the readback found no facts but the result carries `duplicateOf`, a factless save already claimed this hash under the canonical ref. Re-ingest once under `sourceRef: result.duplicateOf` — the engine never reports the incoming ref as its own duplicate, so the model runs again and can store the note. If the readback then finds facts, return that result.
5. Otherwise throw an `Error` whose message names the cause ("The model stored no facts from this note. Try saving again."). The queue keeps the entry, marks it `failed`, and shows the error. The user can RETRY or DISCARD.

Why `duplicateOf` is not success: the engine writes the hash index during every ingest, including one that stored no facts. A RETRY of a factless save therefore reaches the duplicate path with nothing live under the hash; accepting it would drop the note silently — the exact loss this guard exists to stop. Found by the Tier-3 review of this spec's implementation (round 1, BLOCKER 1).

The readback matches by hash OR by normalized ref. The engine stores a ref with every character outside `[A-Za-z0-9._\- ]` stripped (so `journal://<n>` is stored as `journal<n>`), trimmed, cut to 255 characters. Core's `normalizeSourceRef` is not exported, so `normalizeJournalSourceRef` in `journalIngest.ts` mirrors it and a real-engine test pins that the stored ref equals it. Hashes are compared case-insensitively (the engine lowercases them).

Partial-ingest path (amendment, review M1): when some chunks fail and others succeed, the engine (core-llm-wiki 8.4.0, `appendPartialFacts`) stores the surviving facts with `source_hash` NULL and writes no hash-index row. `listSourceRefs` then shows `{sourceRef, sourceHash: null, factCount: N}`. A hash-only readback would find nothing, throw, and a RETRY would duplicate the facts. The ref match counts those facts, so the save resolves with `failedChunks > 0` and the queue's existing "saved with a warning" path (`onDone`, `countIngestFailures`) still applies. If the successful chunks stored nothing, the guard still throws.

`listSourceRefs` is a live API on `WikiMemory` (`@equationalapplications/core-llm-wiki`). It returns one row per live sourceRef with a `factCount`. The readback is one query per save.

The `sourceRef` is unique per save (`journal://<time>`), so the readback sees only this save's facts.

## Files touched

- `src/lib/journalIngest.ts` — the guard, including the duplicate re-ingest branch.
- `__tests__/journalNoFactSave.test.ts` — reproduction and retry tests (one RED before the fix).
- `__tests__/journalSaveWarning.test.tsx`, `__tests__/journalBackgroundSave.test.tsx` — the queue component stubs answer the readback with one stored fact; they always pass the guard, so the throw path is exercised only by the real-engine tests.
- `package.json`, `app.json`, `package-lock.json` — version 9.1.1 → 9.1.2.
- `specs/2026-11-14-no-fact-save-guard/` — this folder.

## Test plan

1. `__tests__/journalNoFactSave.test.ts` "fails the save when the model returns no facts": `await expect(ingest(ENTITY, note)).rejects.toThrow(/no facts/i)`. It is RED before the fix and must pass after.
2. The same file's "still succeeds when the model returns facts" stays green (control).
3. "does not guard a duplicate of a good save" stays green: a duplicate save with live facts under the hash succeeds.
4. "recovers on RETRY": factless save rejects, then a good model run with a fresh ref and the same hash stores the note (exercises the duplicate re-ingest branch).
5. "rejects a RETRY that still stores no facts": a second factless attempt rejects instead of accepting the duplicate.
6. `journalNoFactSave` test 3 proves a duplicate of a good save succeeds with exactly one live fact. (`journalDuplicateSave.test.ts` does not go through `createJournalIngest`.)
6a. Partial ingest: one failed chunk with facts elsewhere resolves with `failedChunks > 0`; one failed chunk with empty facts elsewhere still throws; the stored ref equals `normalizeJournalSourceRef`.
7. Full `npx jest` suite green; `npx tsc --noEmit` clean.

## Accepted limitation (m4)

A factless RETRY can run two model passes (the first ingest, then the duplicate re-ingest) inside the single 120s `saveTimeoutMs`. After a timeout the cancelled signal makes the second pass fail fast. This is accepted.

## Rejected alternatives

- Engine-side `factsStored` field on `IngestDocumentResult`: a cross-repo engine change, gated by the 14-day dependency gate, and obsolete once roadmap Step 8 ships the engine's source store. The in-app readback uses an API that ships today.
- Guard inside the queue machine: the machine holds no `wiki` handle and would need a new input contract for a readback. The ingest binding already owns engine fidelity.
- Wait for Step 8 without a guard: user data loss stays live until the engine ships the store. The guard is cheap and survives Step 8 (with the store, a note is always findable, so the guard never fires).

## INTENT alignment

Rule 3 keeps knowledge in one storage owner (the engine) on device; the guard reads the engine back, not a second store. Rule 1 (works with no network) is untouched. A saved note must be findable or the save must say it failed — that is the charter's honesty about state, and the issue's expected behavior.

## Out of scope (belong to Step 8's spec)

- Note edit and note delete.
- Chunked import and export carrying sources.
- Removing the model from the save path entirely (the store-only ruling's end state).
