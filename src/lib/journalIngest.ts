import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import type { JournalSaveMachineInput } from '@/machines/journalSaveMachine';

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
 */
export function createJournalIngest(wiki: WikiMemory): JournalSaveMachineInput['ingest'] {
  return (entityId, params) => wiki.ingestDocument(entityId, params, { onDuplicateHash: 'skip' });
}
