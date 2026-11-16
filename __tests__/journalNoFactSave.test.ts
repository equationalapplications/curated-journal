import { createWiki, type LLMProvider, type WikiMemory } from '@equationalapplications/core-llm-wiki';
import { createJournalIngest, normalizeJournalSourceRef } from '@/lib/journalIngest';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';

// Issue #112: the model answers every chunk with valid JSON and no facts.
// ingestDocument counts the chunk as ingested, so a save can resolve clean
// and store nothing. The journal ingest must treat that as a failed save:
// the queue keeps the entry and the user sees the failure.
//
// The model stub is switchable so tests can cover the retry path: a factless
// save writes the engine's hash index even with no facts, so a RETRY (fresh
// sourceRef, same hash) comes back as duplicateOf and must be re-ingested
// under the canonical ref rather than accepted.
let factsMode = false;
const switchableLlm: LLMProvider = {
  generateText: async ({ userPrompt }) => {
    if (!factsMode) return JSON.stringify({ facts: [], tasks: [] });
    return JSON.stringify({
      facts: [{ title: 'Morning pages', body: userPrompt.slice(0, 200), confidence: 'inferred' }],
      tasks: [],
    });
  },
};

const alwaysEmptyLlm: LLMProvider = {
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
  sourceHash: 'a'.repeat(64),
  documentChunk: '# Morning pages\n\nThree pages, longhand.',
};
const save = (n: number) => ({ ...note, sourceRef: `journal://${n}` });

describe('a save whose ingest stores no facts (issue #112)', () => {
  let wiki: WikiMemory;

  afterEach(async () => {
    await wiki.close?.();
  });

  it('fails the save when the model returns no facts for any chunk', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: alwaysEmptyLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    // Reject, so the queue keeps the entry as failed (RETRY/DISCARD).
    await expect(ingest(ENTITY, save(1))).rejects.toThrow(/no facts/i);
  });

  it('still succeeds when the model returns facts', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    const result = await ingest(ENTITY, save(1));
    expect(result.failedChunks).toBe(0);
    expect(result.ingestedChunks).toBeGreaterThan(0);
  });

  it('does not guard a duplicate of a good save: already-saved content stays a success', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    // First save stores one fact under journal://1.
    const first = await ingest(ENTITY, save(1));
    expect(first.failedChunks).toBe(0);

    // Same content, fresh sourceRef: the engine reports duplicateOf and the
    // readback finds live facts, so the save succeeds without a second copy.
    const second = await ingest(ENTITY, save(2));
    expect(second.duplicateOf).toEqual(expect.any(String));
    expect(second.ingestedChunks).toBe(0);

    const dump = await wiki.exportDump([ENTITY]);
    expect(dump.entities[ENTITY].facts.filter((f) => f.deleted_at == null)).toHaveLength(1);
  });

  it('recovers on RETRY: a factless save, then a good model run, stores the note', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: switchableLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    factsMode = false;
    await expect(ingest(ENTITY, save(1))).rejects.toThrow(/no facts/i);

    // The factless save indexed the hash, so the retry (fresh ref, same
    // hash) comes back duplicateOf; the guard must re-ingest under the
    // canonical ref, where the model runs again and stores the note.
    factsMode = true;
    const retried = await ingest(ENTITY, save(2));
    expect(retried).toBeDefined();

    const dump = await wiki.exportDump([ENTITY]);
    const facts = dump.entities[ENTITY].facts.filter((f) => f.deleted_at == null);
    expect(facts.filter((f) => f.title === 'Morning pages')).toHaveLength(1);
  });

  it('rejects a RETRY that still stores no facts instead of accepting the duplicate', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: alwaysEmptyLlm });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    await expect(ingest(ENTITY, save(1))).rejects.toThrow(/no facts/i);
    // Second save, fresh ref, same hash: duplicateOf again, still no facts.
    await expect(ingest(ENTITY, save(2))).rejects.toThrow(/no facts/i);
  });

  // Partial ingest: the engine stores the surviving chunks' facts with a NULL
  // source_hash and no hash-index row, so the guard must match by ref too.
  const longNote = {
    sourceHash: 'b'.repeat(64),
    documentChunk: Array.from({ length: 6 }, (_, i) => `# Section ${i}\n\n${'word '.repeat(20)}`).join('\n\n'),
  };
  const partialLlm = (okFacts: boolean): LLMProvider => {
    let calls = 0;
    return {
      generateText: async ({ userPrompt }) => {
        if (calls++ === 1) return 'not json {{{';
        return JSON.stringify({
          facts: okFacts ? [{ title: `Fact ${calls}`, body: userPrompt.slice(0, 80), confidence: 'inferred' }] : [],
          tasks: [],
        });
      },
    };
  };

  it('resolves (not throws) when one chunk fails and the others store facts', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: partialLlm(true), config: { maxChunkLength: 120, chunkOverlap: 10 } });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    const result = await ingest(ENTITY, { ...longNote, sourceRef: 'journal://1' });
    expect(result.failedChunks).toBeGreaterThan(0);
    expect(result.ingestedChunks).toBeGreaterThan(0);
  });

  it('still throws when one chunk fails and the successful chunks stored no facts', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: partialLlm(false), config: { maxChunkLength: 120, chunkOverlap: 10 } });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    await expect(ingest(ENTITY, { ...longNote, sourceRef: 'journal://1' })).rejects.toThrow(/no facts/i);
  });

  it('resolves a RETRY whose duplicate re-ingest is partial (facts stored under the canonical ref)', async () => {
    let phase: 'empty' | 'partial' = 'empty';
    let calls = 0;
    const llm: LLMProvider = {
      generateText: async ({ userPrompt }) => {
        if (phase === 'partial' && calls++ === 1) return 'not json {{{';
        const facts =
          phase === 'partial' ? [{ title: `Fact ${calls}`, body: userPrompt.slice(0, 80), confidence: 'inferred' }] : [];
        return JSON.stringify({ facts, tasks: [] });
      },
    };
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: llm, config: { maxChunkLength: 120, chunkOverlap: 10 } });
    await wiki.setup();
    const ingest = createJournalIngest(wiki);

    await expect(ingest(ENTITY, { ...longNote, sourceRef: 'journal://1' })).rejects.toThrow(/no facts/i);

    phase = 'partial';
    const result = await ingest(ENTITY, { ...longNote, sourceRef: 'journal://2' });
    expect(result.failedChunks).toBeGreaterThan(0);

    const refs = await wiki.listSourceRefs(ENTITY);
    const r0 = refs.find((r) => r.sourceRef === normalizeJournalSourceRef('journal://1'));
    expect(r0?.factCount).toBeGreaterThan(0);
  });

  it('pins normalizeJournalSourceRef to the engine stored ref', async () => {
    wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: goodLlm });
    await wiki.setup();
    const params = save(7);
    await createJournalIngest(wiki)(ENTITY, params);

    const refs = await wiki.listSourceRefs(ENTITY);
    expect(refs.map((r) => r.sourceRef)).toContain(normalizeJournalSourceRef(params.sourceRef));
  });
});
