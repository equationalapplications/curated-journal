import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import type { JournalSaveQueueInput } from '@/machines/journalSaveQueueMachine';

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
 * entity's source refs and require a live fact under the save's hash.
 * Rejecting keeps the entry in the queue as failed (RETRY/DISCARD) instead
 * of dropping the text. Owner ruling 2026-11-14: forcing a manual discard
 * of a factless note is the intended UX until Step 8's source store lands.
 *
 * The readback matches by `sourceHash`, not by `sourceRef`: the engine
 * normalizes the stored spelling of a sourceRef (a `journal://<n>` ref is
 * stored with the scheme stripped), and that normalization is not a callable
 * rule. The hash round-trips verbatim.
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
    const liveFactCount = async (): Promise<number> => {
      const refs = await wiki.listSourceRefs(entityId);
      return refs.find((r) => r.sourceHash === params.sourceHash)?.factCount ?? 0;
    };

    const result = await wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' });
    if ((await liveFactCount()) > 0) return result;

    if (result.duplicateOf) {
      const retry = await wiki.ingestDocument(
        entityId,
        { ...params, sourceRef: result.duplicateOf },
        { onDuplicateHash: 'skip' },
      );
      if ((await liveFactCount()) > 0) return retry;
    }

    throw new Error('The model stored no facts from this note. Try saving again.');
  };
}
