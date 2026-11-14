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

    // Reject, so the queue keeps the entry as failed (RETRY/DISCARD).
    await expect(ingest(ENTITY, note)).rejects.toThrow(/no facts/i);
  });

  it('still succeeds when the model returns facts', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    const result = await ingest(ENTITY, note);
    expect(result.failedChunks).toBe(0);
    expect(result.ingestedChunks).toBeGreaterThan(0);
  });

  it('does not guard a duplicate save: already-saved content stays a success', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    // First save stores one fact under journal://1.
    const first = await ingest(ENTITY, note);
    expect(first.failedChunks).toBe(0);

    // Same content, empty-facts model, fresh sourceRef: the engine reports
    // duplicateOf before any chunk runs, so the guard must not fire.
    const second = await ingest(ENTITY, {
      ...note,
      sourceRef: 'journal://2',
    });
    expect(second.duplicateOf).toEqual(expect.any(String));
    expect(second.ingestedChunks).toBe(0);
  });
});
