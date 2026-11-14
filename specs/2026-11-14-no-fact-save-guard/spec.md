# Spec: fail a journal save that stores no facts

Status: Draft
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
2. If the result carries `duplicateOf`, the content was already saved. Return the result unchanged.
3. Otherwise read back the fresh sourceRef with `wiki.listSourceRefs(entityId)` and find the row for `params.sourceRef`.
4. If that row's `factCount` is 0, throw an `Error` whose message names the cause ("the model stored no facts from this note — try saving again"). The queue keeps the entry, marks it `failed`, and shows the error. The user can RETRY or DISCARD.
5. If `factCount` is greater than 0, return the result unchanged.

`listSourceRefs` is a live API on `WikiMemory` (`@equationalapplications/core-llm-wiki`). It returns one row per live sourceRef with a `factCount`. The readback is one query per save.

The `sourceRef` is unique per save (`journal://<time>`), so the readback sees only this save's facts.

## Files touched

- `src/lib/journalIngest.ts` — the guard.
- `__tests__/journalNoFactSave.test.ts` — reproduction tests (already on the branch, one RED).
- `package.json`, `app.json`, `package-lock.json` — version 9.1.1 → 9.1.2.
- `specs/2026-11-14-no-fact-save-guard/` — this folder.

## Test plan

1. `__tests__/journalNoFactSave.test.ts` "fails the save when the model returns no facts" flips to: `await expect(ingest(ENTITY, note)).rejects.toThrow(/no facts/i)`. It is RED now and must pass after the fix.
2. The same file's "still succeeds when the model returns facts" stays green (control).
3. `__tests__/journalDuplicateSave.test.ts` stays green: a duplicate save carries `duplicateOf` and skips the guard.
4. Full `npx jest` suite green; `npx tsc --noEmit` clean.

## Rejected alternatives

- Engine-side `factsStored` field on `IngestDocumentResult`: a cross-repo engine change, gated by the 14-day dependency gate, and obsolete once roadmap Step 8 ships the engine's source store. The in-app readback uses an API that ships today.
- Guard inside the queue machine: the machine holds no `wiki` handle and would need a new input contract for a readback. The ingest binding already owns engine fidelity.
- Wait for Step 8 without a guard: user data loss stays live until the engine ships the store. The guard is cheap and survives Step 8 unchanged (with the store, a note is always findable, so the guard never fires).

## INTENT alignment

Rule 3 keeps knowledge in one storage owner (the engine) on device; the guard reads the engine back, not a second store. Rule 1 (works with no network) is untouched. A saved note must be findable or the save must say it failed — that is the charter's honesty about state, and the issue's expected behavior.

## Out of scope (belong to Step 8's spec)

- Note edit and note delete.
- Chunked import and export carrying sources.
- Removing the model from the save path entirely (the store-only ruling's end state).
