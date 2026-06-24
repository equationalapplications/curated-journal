import * as SQLite from 'expo-sqlite';
import { createWiki, WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { WIKI_CONFIG } from '@/lib/constants';
import { getOrCreateEntityId } from '@/lib/entityStorage';

export type BootstrapResult = {
  wiki: WikiMemory;
  entityId: string;
  WikiProvider: typeof WikiProvider;
};

export async function bootstrapWiki(llmProvider: LLMProvider): Promise<BootstrapResult> {
  const db = await SQLite.openDatabaseAsync('curated_journal.db');
  const wiki = createWiki(db, { llmProvider, config: WIKI_CONFIG });
  await wiki.setup();
  const entityId = await getOrCreateEntityId();
  await wiki.setOntologyManifest(
    entityId,
    { node_types: [], edge_types: [] },
    { mode: 'emergent' },
  );
  return { wiki, entityId, WikiProvider };
}
