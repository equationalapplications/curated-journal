import { createWiki, type LLMProvider, type WikiMemory } from '@equationalapplications/core-llm-wiki';
import { createJournalIngest } from '@/lib/journalIngest';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';

// Ingest returns one fact per chunk, like the on-device model does.
const llm: LLMProvider = {
  generateText: async ({ userPrompt }) =>
    JSON.stringify({
      facts: [{ title: 'Morning pages', body: userPrompt.slice(0, 200), confidence: 'inferred' }],
      tasks: [],
    }),
};

const ENTITY = 'e1';
const note = (ref: string) => ({
  sourceRef: ref,
  sourceHash: 'a'.repeat(64),
  documentChunk: '# Morning pages\n\nThree pages, longhand.',
});

describe('saving a note whose content already exists', () => {
  let wiki: WikiMemory;

  beforeEach(async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: llm });
    await wiki.setup();
  });

  afterEach(async () => {
    await wiki.close?.();
  });

  it('reproduces the bug: the default ingest mode rejects the second save', async () => {
    // What useWikiIngest().execute does today: ingestDocument(entityId, params).
    await wiki.ingestDocument(ENTITY, note('journal://1'));
    await expect(wiki.ingestDocument(ENTITY, note('journal://2'))).rejects.toThrow();
  });

  it('the journal ingest treats it as already saved and keeps one copy', async () => {
    const ingest = createJournalIngest(wiki);
    const first = await ingest(ENTITY, note('journal://1'));
    const second = await ingest(ENTITY, note('journal://2'));

    expect(first.failedChunks).toBe(0);
    expect(second.failedChunks).toBe(0);
    // duplicateOf is the stored ref in the library's normalized spelling.
    expect(second.duplicateOf).toEqual(expect.any(String));
    expect(second.ingestedChunks).toBe(0);

    const dump = await wiki.exportDump([ENTITY]);
    const facts = dump.entities[ENTITY].facts.filter((f) => f.deleted_at == null);
    expect(facts.filter((f) => f.title === 'Morning pages')).toHaveLength(1);
  });

  it('still saves an edited note (different content) as new', async () => {
    const ingest = createJournalIngest(wiki);
    await ingest(ENTITY, note('journal://1'));
    const edited = await ingest(ENTITY, {
      ...note('journal://2'),
      sourceHash: 'b'.repeat(64),
      documentChunk: '# Morning pages\n\nFour pages today.',
    });
    expect(edited.duplicateOf).toBeUndefined();
    expect(edited.ingestedChunks).toBeGreaterThan(0);
  });
});
