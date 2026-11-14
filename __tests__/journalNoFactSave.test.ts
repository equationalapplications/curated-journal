import { createWiki, type LLMProvider, type WikiMemory } from '@equationalapplications/core-llm-wiki';
import { createJournalIngest } from '@/lib/journalIngest';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';

// Issue #112: the model answers every chunk with valid JSON and no facts.
// ingestDocument counts the chunk as ingested, so a save can resolve clean
// and store nothing. The journal ingest must treat that as a failed save:
// the queue keeps the entry and the user sees the failure.
const emptyLlm: LLMProvider = {
  generateText: async () => JSON.stringify({ facts: [], tasks: [] }),
};

const goodLlm: LLMProvider = {
  generateText: async ({ userPrompt }) =>
    JSON.stringify({
      facts: [{ title: 'Morning pages', body: userPrompt.slice(0, 200), confidence: 'inferred' }],
      tasks: [],
    }),
};

const ENTITY = 'e1';
const note = {
  sourceRef: 'journal://1',
  sourceHash: 'a'.repeat(64),
  documentChunk: '# Morning pages\n\nThree pages, longhand.',
};

describe('a save whose ingest stores no facts (issue #112)', () => {
  let wiki: WikiMemory;

  afterEach(async () => {
    await wiki.close?.();
  });

  it('fails the save when the model returns no facts for any chunk', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: emptyLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    const result = await ingest(ENTITY, note);
    expect(result).toBeUndefined(); // must reject; see spec
  });

  it('still succeeds when the model returns facts', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    const result = await ingest(ENTITY, note);
    expect(result.failedChunks).toBe(0);
    expect(result.ingestedChunks).toBeGreaterThan(0);
  });
});
