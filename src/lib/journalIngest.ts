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
 * can mean the note is gone. For every non-duplicate save, read the save's
 * content hash back and reject the save if the engine stored no facts under
 * it. The queue then keeps the entry as failed (RETRY/DISCARD) instead of
 * dropping the text. Owner ruling 2026-11-14: forcing a manual discard of a
 * factless note is the intended UX until Step 8's source store lands.
 *
 * The readback matches by `sourceHash`, not by `sourceRef`: the engine
 * normalizes the stored spelling of a sourceRef (a `journal://<n>` ref is
 * stored with the scheme stripped), and that normalization is not a callable
 * rule. The hash round-trips verbatim.
 */
export function createJournalIngest(wiki: WikiMemory): JournalSaveQueueInput['ingest'] {
  return async (entityId, params) => {
    const result = await wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' });
    if (result.duplicateOf) return result;
    const refs = await wiki.listSourceRefs(entityId);
    const fresh = refs.find((r) => r.sourceHash === params.sourceHash);
    if (!fresh || fresh.factCount === 0) {
      throw new Error('The model stored no facts from this note. Try saving again.');
    }
    return result;
  };
}
