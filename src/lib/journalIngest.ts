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

/**
 * The journal's ingest call. Every save gets a fresh `journal://<time>`
 * sourceRef, so saving a note whose exact content already exists would put a
 * second live sourceRef on the same content hash, which the wiki's unique
 * index rejects ("UNIQUE constraint failed: …source_ref_index…"), failing the
 * save. `onDuplicateHash: 'skip'` checks first and returns the existing
 * sourceRef as `duplicateOf`: the content is already saved, so the save
 * succeeds without storing a second copy.
 *
 * `useWikiIngest().execute` cannot pass ingest options, so this calls
 * `ingestDocument` directly.
 *
 * Stored-facts guard (issue #112): the engine's result reports chunk counts
 * only, and a chunk whose reply parses with an empty `facts` list counts as
 * ingested. The app keeps no other copy of a note's text, so a clean result
 * can mean the note is gone. Every save is verified by readback: list the
 * entity's source refs and require a live fact under the save's hash OR the save's normalized ref (OR the canonical duplicate ref after a re-ingest).
 * Rejecting keeps the entry in the queue as failed (RETRY/DISCARD) instead
 * of dropping the text. Owner ruling 2026-11-14: forcing a manual discard
 * of a factless note is the intended UX until Step 8's source store lands.
 *
 * The readback counts a live fact under the save's hash (compared
 * case-insensitively; the engine lowercases hashes) OR under the save's
 * normalized sourceRef. The second match matters: when some chunks fail and
 * others succeed, the engine stores the partial facts with a NULL
 * `source_hash` and no hash-index row, so only the ref identifies them. The
 * engine strips every character outside `[A-Za-z0-9._\- ]` from a stored
 * ref (so `journal://<n>` becomes `journal<n>`); `normalizeJournalSourceRef`
 * mirrors that rule, and a real-engine test pins it.
 *
 * `duplicateOf` is NOT success by itself. The engine writes the hash index
 * during every ingest, including one that stored no facts, so a retry of a
 * factless save reaches the duplicate path with nothing live under the hash.
 * Accepting it would drop the note silently — the exact loss this guard
 * exists to stop. When the readback finds no facts but the engine reports a
 * duplicate, the save is re-ingested under the canonical ref (the engine
 * never reports the incoming ref as its own duplicate, so the model runs
 * again and can store facts this time). If the readback still finds no
 * facts, the save throws and the entry stays failed.
 *
 * Step 8 assumption: each save's sourceRef carries exactly one hash (a fresh
 * `journal://<time>` ref per save, never edited in place). If the store
 * later lets a ref carry a new hash of edited text, the readback — which
 * sees only each ref's latest hash and its live fact count — must be
 * revisited.
 */
export function createJournalIngest(wiki: WikiMemory): JournalSaveQueueInput['ingest'] {
  return async (entityId, params) => {
    const liveFactCount = async (extraRef?: string): Promise<number> => {
      const refs = await wiki.listSourceRefs(entityId);
      const hash = params.sourceHash.toLowerCase();
      const ref = normalizeJournalSourceRef(params.sourceRef);
      const extra = extraRef == null ? null : normalizeJournalSourceRef(extraRef);
      return refs
        .filter(
          (r) =>
            (r.sourceHash != null && r.sourceHash.toLowerCase() === hash) ||
            (ref != null && r.sourceRef === ref) ||
            (extra != null && r.sourceRef === extra),
        )
        .reduce((n, r) => n + r.factCount, 0);
    };

    const result = await wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' });
    if ((await liveFactCount()) > 0) return result;

    if (result.duplicateOf) {
      const retry = await wiki.ingestDocument(
        entityId,
        { ...params, sourceRef: result.duplicateOf },
        { onDuplicateHash: 'skip' },
      );
      // A partial re-ingest stores facts under the canonical ref with a NULL hash.
      if ((await liveFactCount(result.duplicateOf)) > 0) return retry;
    }

    throw new Error('The model stored no facts from this note. Try saving again.');
  };
}
