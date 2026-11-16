# Spec: fail a journal save that stores no facts

Status: Implemented
Amended 2026-11-16 after review: partial-ingest path.
Amended 2026-11-16 (review round 4): the O10 row and helper description were rewritten to expo-sqlite's primary error code 19 (device behavior; refs engine issue #403), with two device O10 tests plus two extended-code engine tests.
Amended 2026-11-16 (review round 3): the first readback counts the duplicate holder's facts (a re-save could wipe an earlier note); the guard is restated as invariants I1–I4 checked against every engine outcome; m4 and the readback cost corrected; error message covers an empty note; merged with main (engine 9.2.0), version 9.2.1.
Spec approved by the owner 2026-11-16.
Date: 2026-11-14
Version cost: PATCH (9.2.0 → 9.2.1) per `docs/VERSIONING.md`. PRs #117 and #120 also take 9.2.1; whichever merges later re-bumps.
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

## Design

Engine: `@equationalapplications/core-llm-wiki` 9.2.0 (`IngestionService.ingestDocument`, `EntryRepository.listSourceRefs`, `SourceRefIndexRepository`). Everything below was checked against the 8.4.0 source and re-checked against 9.2.0; the ingest flow and `listSourceRefs`' per-ref live fact count did not change between them (9.2.0 adds prompt guidance and a `source_documents` join).

Notation: **X** is this save's ref (`journal://<ms>`, fresh per attempt, stored as `journal<ms>`), **H** the note's hash, **R** the ref the engine names in `duplicateOf`.

Definitions:

- **Holder**: `result.duplicateOf ?? X`, the ref the engine says holds this content after the call.
- **Stored facts**: the sum of `factCount` over `listSourceRefs(entityId)` rows whose `sourceRef` equals the normalized holder, or whose `sourceHash` equals H (case-insensitive). The ref match counts every live row under the holder, any hash, so it sees partial rows (NULL hash). The hash match sees rows that carry H under another ref, such as imported ones (O13). `normalizeJournalSourceRef` mirrors core's unexported `normalizeSourceRef`; a real-engine test pins it.

The guard, in `createJournalIngest`:

1. Ingest under X with `onDuplicateHash: 'skip'`. Engine errors propagate.
2. If the holder has stored facts, resolve with the result.
3. If the result has `duplicateOf` (= R) and nothing is stored, an earlier save left H indexed under R with no facts. Re-ingest once under R, then re-read with holder `second.duplicateOf ?? R`. If facts are stored, resolve with that result.
4. Otherwise throw `NO_FACTS_SAVE_ERROR`. The queue keeps the entry, marks it `failed`, and shows the message; the user can Try again or Discard.

### Invariants

- **I1**: the guard never causes a destructive re-ingest of a ref that has live facts.
- **I2**: the guard never resolves when nothing is stored for the note's content.
- **I3**: the guard never rejects when the note's content has stored facts.
- **I4**: a RETRY never duplicates facts.

### Engine outcomes

One `ingestDocument(X, H, { onDuplicateHash: 'skip' })` call ends in one of these. "Passes" counts model passes for the whole save.

| Row | Engine outcome | What the engine stored | Guard | Passes | Test |
|---|---|---|---|---|---|
| O1 | Full success: no chunk failed, at least one fact | facts under X stamped H; index H→X | holder X has facts: resolve | 1 | O1 |
| O2 | No chunk failed, every reply empty | index H→X, no facts | nothing stored, no `duplicateOf`: reject | 1 | O2 |
| O3 | Partial: some chunks failed, the others have facts | facts under X with NULL hash; no index row | holder X has facts: resolve; `failedChunks > 0`, so the queue shows "Saved with warnings" | 1 | O3 |
| O4 | Partial, the surviving chunks are empty | nothing | reject | 1 | O4 |
| O5 | Every chunk failed | nothing; engine throws `WikiIngestEmptyError` | propagates | 1 | O5 |
| O6 | Duplicate skip; R has live facts (stamped H, or NULL-hash rows from an O8 re-ingest) | nothing; no model call | holder R has facts: resolve | 0 | O6 (three tests; two are the round-3 MAJOR, lower- and uppercase hash) |
| O7 | Duplicate skip; R has none (left by O2 or O9); re-ingest under R succeeds in full | facts under R stamped H | resolve | 1 | O7 |
| O8 | Same, re-ingest partial | NULL-hash facts under R | resolve (warning) | 1 | O8 |
| O9 | Same, re-ingest stores nothing (all empty, partial with empty survivors, or every chunk failed) | index H→R rewritten, or nothing | reject (`WikiIngestEmptyError` propagates for every chunk failed) | 1 | O9 (three tests) |
| O10 | Race: another writer claims H during this save's model pass; the write hits the unique hash index, rolls back, and the result names the winner W in `duplicateOf` | nothing under X | **On device** (expo-sqlite reports primary code 19, which the engine does not translate; engine issue: extractSqliteCode ignores primary code 19): the save rejects with `WikiTransactionError`, W's facts intact, nothing lost or duplicated; a RETRY is a duplicate of W (one copy). If expo-sqlite ever enables extended codes (2067), the engine translates it: as O6 if W has facts, else as O7–O9 under W | 1 (2 if W has none and extended codes) | O10 (two device tests, two engine-level tests) |
| O11 | `truncated: true`: a hard split with no boundary; no text is dropped | as O1–O4 | flag ignored; O1–O4 decide | as O1–O4 | O11 |
| O12 | No chunks (whitespace-only document) | nothing; no `duplicateOf` | reject | 0 | none: unreachable, the journal's document always starts with `# ` |
| O13 | Content imported from an OKF bundle: facts stamped H under its own ref, no index row; this save is then O1–O4 | as O1–O4 | the hash match counts the imported facts: resolve even if this save stored none | 1 | O13 (uppercase hash) |

### Why the invariants hold

- **I1.** The engine's only destructive step is the full path's supersede: it soft-deletes every live fact under the ingested ref (`upsertGraphCore` step d). The partial path never deletes. The guard ingests at most twice. The first ingest is under X, a fresh ref with nothing under it. The second is under R (O7–O9), and only when the readback just before found no stored facts. That readback's ref match counts every live row under R, any hash, so the supersede deletes nothing. The round-3 MAJOR broke exactly this: the first readback did not count R, so an identical re-save re-ingested an R that held a partial retry's facts.
  Not covered: a writer adding facts under R between that readback and the re-ingest. The queue saves one entry at a time and nothing else writes under a journal ref, so there is no such writer today.
- **I2.** The guard resolves only right after a readback that counted stored facts under the holder or stamped H.
- **I3.** The guard rejects only right after a readback that counted none. The note's content can be stored under R (O6), under X (O1, O3), or stamped H under any ref (O13), and the readback covers all three. Two blind spots, both of which reject with the text kept (the safe direction):
  (a) NULL-hash rows under an unrelated earlier ref. A previous partial save of the same text (O3) never claimed H, so neither its ref nor a hash ties it to this note.
  (b) Engine errors (O5) propagate unchanged.
- **I4.** A RETRY follows a rejection, and a guard rejection means nothing is stored for the content. If an earlier attempt left H indexed (O2, O9), the RETRY is a duplicate skip followed by a re-ingest under R, which supersedes nothing and stores the only copy (O7). Otherwise it is a fresh ingest of content with nothing stored. A later identical save is O6 and adds no copy. Not covered: owner decision 1, a queue rule rather than the guard.

### Model passes (m4, corrected)

A save costs one model pass. A duplicate of stored content costs none. A RETRY of a factless save also costs one: its first ingest is a duplicate skip with no model call, and the re-ingest is the pass. Two passes inside the single 120 s `saveTimeoutMs` happen only on the race path when the winner stored nothing (O10). That path needs another writer to claim the same hash during this save's model pass, outside this engine instance's per-hash ingest lock; nothing in the app does that today. After a timeout, the cancelled generation scope makes a second pass fail fast. Accepted.

### Readback cost

A save reads back once (one `listSourceRefs` call). The re-ingest branch (O7–O9, and O10 with a factless winner) reads back twice. `listSourceRefs` is one SQL query, but it ranks and counts every live entry of the entity with window functions (9.2.0 adds a LEFT JOIN to `source_documents`), so its cost grows with the entity. Accepted: one or two queries per save, next to a model pass that takes seconds. `pendingSources` reads only the named refs, but it reports a status rather than a count and has no hash match, so it is not used.

### Error message

`NO_FACTS_SAVE_ERROR`: "Nothing could be stored from this note. Try again, or discard it and write it again with more text."

The failed-entry sheet offers Try again and Discard, and a failed entry cannot be edited. The editor does not block an empty save (`JournalEntryEditor` sends any title and body). An empty note becomes the document `# \n\n`, which never yields a fact, so "Try again" alone would loop. The message names the way out. The editor is unchanged (owner decision 2).

## Owner decisions

1. **A timed-out partial save duplicates on RETRY.** This is pre-existing, from background-save R4. `withTimeout` rejects a timed-out save whose ingest later resolves with chunk failures, even though facts were stored (O3, O8). The entry stays failed. A RETRY ingests under a fresh ref, and because a partial ingest claims no hash, it stores a second copy. Two possible fixes: count such a save as saved with a warning, or give each queue entry one sourceRef for all its attempts. Neither is made here.
2. **The editor allows an empty save.** It now fails with the message above. Disabling Save on an empty note would stop it earlier.

## Accepted limitations

- I3 blind spot (a): a NULL-hash partial save of the same text under an earlier ref is invisible. A later identical save rejects (text kept) if its model stores nothing. If its model stores facts, it adds a second copy. This is engine behavior (partial rows carry no hash), and Step 8's source store is the place to fix it.
- A re-save resolved via a NULL-hash partial holder (R) reports a clean duplicate with no "saved with warnings". Cosmetic: the warning was shown on the earlier RETRY.
- m4 and the readback cost, above.

## Files touched

- `src/lib/journalIngest.ts`: the guard, `NO_FACTS_SAVE_ERROR`, `normalizeJournalSourceRef`.
- `__tests__/journalNoFactSave.test.ts`: real-engine tests, one per outcome row, plus two queue tests on the real engine and guard.
- `__tests__/helpers/nodeSqliteAdapter.ts`: `withExpoSqliteErrors`, which reports failures in expo-sqlite's shape: "Error code N" with the primary code (`errcode & 0xff`), because expo-sqlite 58.0.14 never enables extended result codes (ios/SQLiteResult.swift, android SQLiteError.h). An `extendedCodes` option emits 2067 for the engine-level O10 tests.
- `__tests__/journalSaveWarning.test.tsx`, `__tests__/journalBackgroundSave.test.tsx`, `__tests__/journalPaneToggle.test.tsx`, `__tests__/journalSaveSourceHash.test.tsx`: the queue/screen stubs answer the readback with one fact stamped with the save's hash, so they always pass the guard. The guard's reject path is exercised only on the real engine.
- `package.json`, `app.json`, `package-lock.json`: version 9.2.0 → 9.2.1.
- `specs/2026-11-14-no-fact-save-guard/`: this folder.

## Test plan

`__tests__/journalNoFactSave.test.ts` (20 tests, real engine). Each test is named after its row:

- O1–O5, O7, O8, O11, O13: one test each.
- O6: three tests. The first is a duplicate of a hash-stamped save: no model call, one copy. The other two are the round-3 MAJOR, factless save, then a partial RETRY, then the same text saved again with an empty model, for lowercase and uppercase hashes. Each resolves with no model call and leaves R1's facts untouched.
- O9: three tests (empty, partial with empty survivors, every chunk failed). Each rejects, stores nothing, and a later RETRY stores one copy.
- O10: four tests. A second engine instance on the same database claims the hash during the model pass. Two assert device behavior (primary code 19): the save rejects, the winner's facts are intact, a RETRY is a duplicate with one copy (winner with facts, factless winner). Two assert the engine's translation under extended code 2067 (one pass; two passes with a factless winner).
- A pin that `normalizeJournalSourceRef` equals the engine's stored ref.
- Queue tests on the real engine and guard:
  - A factless save ends `failed` with its title and body kept and the message shown; RETRY then stores it once.
  - An empty note fails with the message offering Discard.

Mutation check: each mutation of `journalIngest.ts`, run against the file.

| Mutation | Tests that fail |
|---|---|
| M1: first readback ignores `duplicateOf` (the round-3 code) | O6 round-3 MAJOR, both hashes (2) |
| M2: no re-ingest branch | O6 MAJOR ×2, O7, O8, O9 ×3, O10 factless winner, queue RETRY (9) |
| M3: re-ingest a duplicate without the readback precondition (I1) | O6 ×3, O10 winner with facts (4) |
| M4: never throw | O2, O4, O6 MAJOR ×2, O7, O8, O9 ×3, O11, both queue tests (12) |
| M5: hash compared case-sensitively | O13 (1) |
| M6: no hash match | O13 (1) |
| M7: holder ref not normalized | O3 (1) |
| M8: second readback reads X instead of R | O6 MAJOR ×2, O8 (3) |
| M9: re-ingest under X instead of R | O6 MAJOR ×2, O7, O8, O9 ×3, O10 factless winner, queue RETRY (9) |

(Counts from the round-3 pass of 20 tests; the two round-4 O10 device tests add failures — e.g. a never-throw mutation now fails 14, re-verified in review round 5.)

Some tests pin engine behavior and have no guard code of their own: O1 (control), O5 (the engine error propagates), O11 (the flag is ignored; it also fails under M4), and the normalization pin.

## Verification

- [x] `npx tsc --noEmit` clean.
- [x] `npm run lint`: 0 errors (30 pre-existing warnings, none in touched files).
- [x] `npx jest --maxWorkers=2`: 68/68 suites, 517/517 tests.
- [ ] On device (user, not blocking): save a note while the model returns no facts. The entry stays failed with Try again / Discard and the new message. Try again after switching to a model that extracts facts, and the note appears once.

## Rejected alternatives

- `onDuplicateHash: 'ingest'` on RETRY, with no re-ingest. The duplicate pre-check is skipped, but the full path's index write still collides with the factless row holding H. The unique index rejects it, the write rolls back, and `'ingest'` mode then throws `WikiDuplicateHashError` (the `ingestDocument` catch block). A RETRY that fully succeeds could never store the note; only a partial one would, with no hash. The guard also cannot tell a RETRY from a first save.
- Decide from a before/after diff of `listSourceRefs`. A duplicate of a good save adds nothing and must resolve, so a content-level check is needed anyway. A diff alone also never clears a factless index row, so every later save of that text would duplicate-skip into a rejection.
- `forget` the factless index row instead of re-ingesting. It costs the same passes, because the next ingest runs the model anyway, but it puts a deletion API on the save path. Re-ingesting the canonical ref is the engine's own re-run path.
- One sourceRef per queue entry, assigned at ENQUEUE and reused on RETRY. A RETRY would re-ingest its own ref without a duplicate skip, and this would also fix owner decision 1. It changes the queue machine and the background-save spec, and it still needs the re-ingest for a factless row left by a discarded entry. Left to owner decision 1.
- Engine-side `factsStored` field on `IngestDocumentResult`. It is a cross-repo engine change, gated by the 14-day dependency gate, and obsolete once roadmap Step 8 ships the engine's source store. The in-app readback uses an API that ships today.
- Guard inside the queue machine. The machine holds no `wiki` handle and would need a new input contract for a readback. The ingest binding already owns engine fidelity.
- Wait for Step 8 without a guard. User data loss stays live until the engine ships the store. The guard is cheap and survives Step 8: with the store, a note is always findable, so the guard never fires.

## INTENT alignment

Rule 3 keeps knowledge in one storage owner (the engine) on device. The guard reads the engine back through its public API and writes only through `ingestDocument`; it is not a second store. Rule 1 (works with no network) is untouched. A saved note must be findable, or the save must say it failed. That is the charter's honesty about state, and the issue's expected behavior.

## Out of scope (belong to Step 8's spec)

- Note edit and note delete.
- Chunked import and export carrying sources.
- Removing the model from the save path entirely (the store-only ruling's end state).
