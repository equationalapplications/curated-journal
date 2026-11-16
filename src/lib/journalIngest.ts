import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import type { JournalSaveQueueInput } from '@/machines/journalSaveQueueMachine';

/**
 * Mirrors core-llm-wiki's `utils/pure.ts normalizeSourceRef`, which is not
 * exported. A real-engine test (journalNoFactSave) pins that the engine's
 * stored ref equals this function's output.
 */
export function normalizeJournalSourceRef(ref: string): string | null {
  const value = ref
    .replace(/[^A-Za-z0-9._\- ]/g, '')
    .trim()
    .slice(0, 255)
    .trimEnd();
  return value === '' ? null : value;
}

/** Shown on the failed entry's "Save failed" sheet (buttons: Try again, Discard). */
export const NO_FACTS_SAVE_ERROR =
  'Nothing could be stored from this note. Try again, or discard it and write it again with more text.';

/**
 * The journal's ingest call, with the stored-facts guard (issue #112; spec
 * `specs/2026-11-14-no-fact-save-guard/spec.md`, which holds the full
 * outcome table).
 *
 * Every save gets a fresh `journal://<time>` sourceRef and ingests with
 * `onDuplicateHash: 'skip'`: content that is already saved comes back as
 * `duplicateOf` (the ref holding that hash) instead of failing the unique
 * hash index. `useWikiIngest().execute` cannot pass ingest options, so this
 * calls `ingestDocument` directly.
 *
 * The engine's result reports chunk counts only, and a chunk whose reply
 * parses with an empty `facts` list counts as ingested. The app keeps no
 * other copy of a note's text, so the guard reads the engine back and
 * decides from what is stored.
 *
 * Stored facts: live facts under the HOLDER (`duplicateOf` when the engine
 * reported one, else this save's ref), plus live facts under any ref whose
 * latest hash is this note's hash. The holder match is by ref because
 * partial rows (some chunks failed) carry a NULL hash; the hash match covers
 * imported rows, which carry the hash but no index entry. Hashes compare
 * case-insensitively (the engine lowercases them).
 *
 *   1. Ingest under this save's ref. Engine errors propagate.
 *   2. Holder has stored facts → return the result (success or warning).
 *   3. `duplicateOf` and nothing stored → an earlier save left the hash
 *      indexed with no facts. Re-ingest once under that ref, then re-read.
 *   4. Still nothing stored → throw; the queue keeps the entry as failed.
 *
 * Invariants:
 *   I1 Never a destructive re-ingest: the only extra ingest is step 3, run
 *      only after step 2's readback found no live facts under that ref, so
 *      the engine's supersede step has nothing to delete.
 *   I2 Never success without stored facts: every return follows a readback
 *      that counted some.
 *   I3 Never a rejection while the content has stored facts: the throw
 *      follows a readback that counted none.
 *   I4 RETRY never duplicates: a rejection means nothing is stored for the
 *      content, so a RETRY stores the first copy.
 *
 * Assumes a journal ref only ever carries one note's text (a fresh ref per
 * save, never edited in place). Step 8's note editing must revisit the
 * holder match, which counts every live row under the ref.
 */
export function createJournalIngest(wiki: WikiMemory): JournalSaveQueueInput['ingest'] {
  return async (entityId, params) => {
    const hash = params.sourceHash.toLowerCase();
    const storedFacts = async (holder: string): Promise<number> => {
      const ref = normalizeJournalSourceRef(holder);
      const rows = await wiki.listSourceRefs(entityId);
      return rows
        .filter((r) => r.sourceRef === ref || r.sourceHash?.toLowerCase() === hash)
        .reduce((n, r) => n + r.factCount, 0);
    };

    const first = await wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' });
    if ((await storedFacts(first.duplicateOf ?? params.sourceRef)) > 0) return first;

    if (first.duplicateOf) {
      const canonical = first.duplicateOf;
      const second = await wiki.ingestDocument(
        entityId,
        { ...params, sourceRef: canonical },
        { onDuplicateHash: 'skip' },
      );
      if ((await storedFacts(second.duplicateOf ?? canonical)) > 0) return second;
    }

    throw new Error(NO_FACTS_SAVE_ERROR);
  };
}
