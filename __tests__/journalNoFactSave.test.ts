import { createActor, waitFor } from 'xstate';
import {
  createWiki,
  WikiIngestEmptyError,
  type LLMProvider,
  type SQLiteAdapter,
  type WikiMemory,
} from '@equationalapplications/core-llm-wiki';
import {
  createJournalIngest,
  normalizeJournalSourceRef,
  NO_FACTS_SAVE_ERROR,
} from '@/lib/journalIngest';
import { journalSaveQueueMachine } from '@/machines/journalSaveQueueMachine';
import { createNodeSqliteAdapter, withExpoSqliteErrors } from './helpers/nodeSqliteAdapter';

// Issue #112: the model can answer every chunk with valid JSON and no facts.
// ingestDocument counts such a chunk as ingested, so a save can resolve clean
// and store nothing. The stored-facts guard in createJournalIngest reads the
// engine back and decides from what is stored.
//
// Each test below is one row of the outcome table in
// specs/2026-11-14-no-fact-save-guard/spec.md (O1–O13), run on the real
// engine (createWiki + node:sqlite). The invariants:
//   I1 the guard never causes a destructive re-ingest of a ref with live facts
//   I2 the guard never returns success when nothing is stored for the note
//   I3 the guard never rejects when the note's content has stored facts
//   I4 RETRY never duplicates facts

// The queue hashes the note with expo-crypto; jest-expo's mock returns an
// empty digest, which the engine rejects. Use the real SHA-256.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'),
  };
});

/**
 * Scripted model, one reply per chunk:
 * - facts: one fact per chunk (unique titles, so no cross-chunk dedupe)
 * - empty: valid JSON, no facts
 * - partial / partialEmpty: the chunk holding "Section 1" fails to parse;
 *   the others reply as `facts` / `empty`
 * - fail: every chunk fails to parse
 * `beforeReply` runs once, before the next reply (used to stage a race).
 */
type Mode = 'facts' | 'empty' | 'partial' | 'partialEmpty' | 'fail';
function scriptedModel(mode: Mode) {
  const model = { mode, calls: 0, beforeReply: null as null | (() => Promise<unknown>) };
  const llm: LLMProvider = {
    generateText: async ({ userPrompt }) => {
      model.calls++;
      const hook = model.beforeReply;
      model.beforeReply = null;
      if (hook) await hook();
      const m = model.mode;
      const failsHere =
        m === 'fail' || ((m === 'partial' || m === 'partialEmpty') && userPrompt.includes('Section 1'));
      if (failsHere) return 'not json {{{';
      const facts =
        m === 'facts' || m === 'partial'
          ? [{ title: `Fact ${model.calls}`, body: 'Three pages, longhand.', confidence: 'inferred' }]
          : [];
      return JSON.stringify({ facts, tasks: [] });
    },
  };
  return { model, llm };
}

const ENTITY = 'e1';
const HASH = 'a'.repeat(64);
const SHORT = '# Morning pages\n\nThree pages, longhand.';
// Seven chunks at maxChunkLength 120; chunk 1 holds "Section 1".
const LONG = Array.from({ length: 6 }, (_, i) => `# Section ${i}\n\n${'word '.repeat(20)}`).join('\n\n');
const save = (n: number, documentChunk = SHORT, sourceHash = HASH) => ({
  sourceRef: `journal://${n}`,
  sourceHash,
  documentChunk,
});

const wikis: WikiMemory[] = [];
async function makeWiki(llm: LLMProvider, adapter: SQLiteAdapter = createNodeSqliteAdapter()) {
  const wiki = createWiki(adapter, { llmProvider: llm, config: { maxChunkLength: 120, chunkOverlap: 10 } });
  await wiki.setup();
  wikis.push(wiki);
  return wiki;
}
afterEach(async () => {
  for (const wiki of wikis.splice(0)) await wiki.close?.();
});

const factsUnder = async (wiki: WikiMemory, ref: string) =>
  (await wiki.listSourceRefs(ENTITY)).find((r) => r.sourceRef === normalizeJournalSourceRef(ref))
    ?.factCount ?? 0;
const liveFactIds = async (wiki: WikiMemory) => {
  const dump = await wiki.exportDump([ENTITY]);
  return (dump.entities[ENTITY]?.facts ?? [])
    .filter((f) => f.deleted_at == null)
    .map((f) => f.id)
    .sort();
};

describe('stored-facts guard, one test per outcome-table row (issue #112)', () => {
  it('O1 full success: resolves, facts stored under the save ref', async () => {
    const { llm } = scriptedModel('facts');
    const wiki = await makeWiki(llm);

    const result = await createJournalIngest(wiki)(ENTITY, save(1));
    expect(result.failedChunks).toBe(0);
    expect(await factsUnder(wiki, 'journal://1')).toBe(1);
  });

  it('O2 every chunk parses with no facts: rejects (I2)', async () => {
    const { llm } = scriptedModel('empty');
    const wiki = await makeWiki(llm);

    await expect(createJournalIngest(wiki)(ENTITY, save(1))).rejects.toThrow(NO_FACTS_SAVE_ERROR);
    expect(await liveFactIds(wiki)).toEqual([]);
  });

  it('O3 partial with facts: resolves with failedChunks > 0, and the NULL-hash facts exist (I3)', async () => {
    const { llm } = scriptedModel('partial');
    const wiki = await makeWiki(llm);

    const result = await createJournalIngest(wiki)(ENTITY, save(1, LONG));
    expect(result.failedChunks).toBeGreaterThan(0);
    const row = (await wiki.listSourceRefs(ENTITY)).find(
      (r) => r.sourceRef === normalizeJournalSourceRef('journal://1'),
    );
    expect(row?.sourceHash).toBeNull();
    expect(row?.factCount).toBeGreaterThan(0);
  });

  it('O4 partial whose surviving chunks have no facts: rejects (I2)', async () => {
    const { llm } = scriptedModel('partialEmpty');
    const wiki = await makeWiki(llm);

    await expect(createJournalIngest(wiki)(ENTITY, save(1, LONG))).rejects.toThrow(NO_FACTS_SAVE_ERROR);
    expect(await liveFactIds(wiki)).toEqual([]);
  });

  it('O5 every chunk fails: the engine error propagates, nothing stored', async () => {
    const { llm } = scriptedModel('fail');
    const wiki = await makeWiki(llm);

    await expect(createJournalIngest(wiki)(ENTITY, save(1, LONG))).rejects.toThrow(WikiIngestEmptyError);
    expect(await liveFactIds(wiki)).toEqual([]);
  });

  it('O6 duplicate whose holder has hash-stamped facts: resolves with no model call, one copy (I1, I3)', async () => {
    const { model, llm } = scriptedModel('facts');
    const wiki = await makeWiki(llm);
    const ingest = createJournalIngest(wiki);
    await ingest(ENTITY, save(1));
    const stored = await liveFactIds(wiki);

    model.mode = 'empty';
    const calls = model.calls;
    const second = await ingest(ENTITY, save(2));
    expect(second.duplicateOf).toBe(normalizeJournalSourceRef('journal://1'));
    expect(model.calls).toBe(calls);
    expect(await liveFactIds(wiki)).toEqual(stored);
    expect(stored).toHaveLength(1);
  });

  // Review round 3 MAJOR: factless save, then a RETRY whose re-ingest is
  // partial (NULL-hash facts under R1), then the same text saved again. The
  // re-save must count R1's facts and stop; a re-ingest under R1 would
  // supersede them, and an empty reply would wipe the earlier note.
  it.each([
    ['lowercase', HASH],
    ['uppercase', HASH.toUpperCase()],
  ])(
    'O6 duplicate whose holder has only NULL-hash partial facts (%s hash): resolves with no model call and R1 intact (I1, I3)',
    async (_case, hash) => {
      const { model, llm } = scriptedModel('empty');
      const wiki = await makeWiki(llm);
      const ingest = createJournalIngest(wiki);

      await expect(ingest(ENTITY, save(1, LONG, hash))).rejects.toThrow(NO_FACTS_SAVE_ERROR);
      model.mode = 'partial';
      const retry = await ingest(ENTITY, save(2, LONG, hash));
      expect(retry.failedChunks).toBeGreaterThan(0);
      const r1Facts = await liveFactIds(wiki);
      expect(r1Facts.length).toBeGreaterThan(0);
      expect(await factsUnder(wiki, 'journal://1')).toBe(r1Facts.length);

      model.mode = 'empty';
      const calls = model.calls;
      const resave = await ingest(ENTITY, save(3, LONG, hash));
      expect(resave.duplicateOf).toBe(normalizeJournalSourceRef('journal://1'));
      expect(model.calls).toBe(calls);
      expect(await liveFactIds(wiki)).toEqual(r1Facts);
    },
  );

  it('O7 duplicate of a factless save, re-ingest stores facts: one model pass, one copy (I4)', async () => {
    const { model, llm } = scriptedModel('empty');
    const wiki = await makeWiki(llm);
    const ingest = createJournalIngest(wiki);
    await expect(ingest(ENTITY, save(1))).rejects.toThrow(NO_FACTS_SAVE_ERROR);

    // RETRY: fresh ref, same hash. The first ingest is a duplicate skip (no
    // model call); the re-ingest under journal1 is the one model pass.
    model.mode = 'facts';
    const calls = model.calls;
    const retried = await ingest(ENTITY, save(2));
    expect(retried.failedChunks).toBe(0);
    expect(retried.ingestedChunks).toBeGreaterThan(0);
    expect(model.calls - calls).toBe(1);
    expect(await factsUnder(wiki, 'journal://1')).toBe(1);

    // Saving the same text again adds no second copy.
    await ingest(ENTITY, save(3));
    expect(await liveFactIds(wiki)).toHaveLength(1);
  });

  it('O8 duplicate of a factless save, re-ingest partial: resolves with failedChunks > 0, facts under the canonical ref', async () => {
    const { model, llm } = scriptedModel('empty');
    const wiki = await makeWiki(llm);
    const ingest = createJournalIngest(wiki);
    await expect(ingest(ENTITY, save(1, LONG))).rejects.toThrow(NO_FACTS_SAVE_ERROR);

    model.mode = 'partial';
    const retried = await ingest(ENTITY, save(2, LONG));
    expect(retried.failedChunks).toBeGreaterThan(0);
    expect(await factsUnder(wiki, 'journal://1')).toBeGreaterThan(0);
    expect(await factsUnder(wiki, 'journal://2')).toBe(0);
  });

  it.each([
    ['empty', NO_FACTS_SAVE_ERROR],
    ['partialEmpty', NO_FACTS_SAVE_ERROR],
    ['fail', WikiIngestEmptyError],
  ] as const)(
    'O9 duplicate of a factless save, re-ingest stores nothing (%s): rejects, and a later RETRY still stores one copy',
    async (mode, error) => {
      const { model, llm } = scriptedModel('empty');
      const wiki = await makeWiki(llm);
      const ingest = createJournalIngest(wiki);
      await expect(ingest(ENTITY, save(1, LONG))).rejects.toThrow(NO_FACTS_SAVE_ERROR);

      model.mode = mode;
      await expect(ingest(ENTITY, save(2, LONG))).rejects.toThrow(error);
      expect(await liveFactIds(wiki)).toEqual([]);

      model.mode = 'facts';
      await ingest(ENTITY, save(3, LONG));
      const stored = await factsUnder(wiki, 'journal://1');
      expect(stored).toBeGreaterThan(0);
      expect(await liveFactIds(wiki)).toHaveLength(stored);
    },
  );

  // Race: a second engine instance on the same database claims the hash while
  // this save's model pass runs, so this save's write loses the unique-index
  // race, rolls back, and reports the winner as duplicateOf.
  async function raceSetup(winner: Mode) {
    const adapter = withExpoSqliteErrors(createNodeSqliteAdapter());
    const a = scriptedModel('facts');
    const b = scriptedModel(winner);
    const wikiA = await makeWiki(a.llm, adapter);
    const wikiB = await makeWiki(b.llm, adapter);
    a.model.beforeReply = () => wikiB.ingestDocument(ENTITY, save(900), { onDuplicateHash: 'skip' });
    return { wikiA, a };
  }

  it('O10 race lost to a writer that stored facts: resolves as its duplicate after one model pass', async () => {
    const { wikiA, a } = await raceSetup('facts');

    const result = await createJournalIngest(wikiA)(ENTITY, save(1));
    expect(result.duplicateOf).toBe(normalizeJournalSourceRef('journal://900'));
    expect(a.model.calls).toBe(1);
    expect(await factsUnder(wikiA, 'journal://1')).toBe(0);
    expect(await factsUnder(wikiA, 'journal://900')).toBe(1);
  });

  it('O10 race lost to a factless writer: re-ingests under the winner (the only two-pass path)', async () => {
    const { wikiA, a } = await raceSetup('empty');

    const result = await createJournalIngest(wikiA)(ENTITY, save(1));
    expect(result.failedChunks).toBe(0);
    expect(a.model.calls).toBe(2);
    expect(await factsUnder(wikiA, 'journal://1')).toBe(0);
    expect(await factsUnder(wikiA, 'journal://900')).toBe(1);
  });

  it('O11 truncated (hard split) changes nothing: resolves with facts, rejects without', async () => {
    const unbroken = `# Morning pages\n\n${'x'.repeat(300)}`;
    const { model, llm } = scriptedModel('facts');
    const wiki = await makeWiki(llm);
    const ingest = createJournalIngest(wiki);

    const stored = await ingest(ENTITY, save(1, unbroken));
    expect(stored.truncated).toBe(true);

    model.mode = 'empty';
    await expect(ingest(ENTITY, save(2, unbroken, 'b'.repeat(64)))).rejects.toThrow(NO_FACTS_SAVE_ERROR);
  });

  it('O13 content imported with its hash but no index entry: a factless identical save resolves (I3); the hash compares case-insensitively', async () => {
    const source = await makeWiki(scriptedModel('facts').llm);
    await createJournalIngest(source)(ENTITY, save(1));
    const dump = await source.exportDump([ENTITY]);

    const { model, llm } = scriptedModel('empty');
    const wiki = await makeWiki(llm);
    await wiki.importDump(dump);
    expect(await wiki.findSourceRefsByHash(ENTITY, HASH)).toEqual([]);
    expect(await factsUnder(wiki, 'journal://1')).toBe(1);

    const result = await createJournalIngest(wiki)(ENTITY, save(2, SHORT, HASH.toUpperCase()));
    expect(result.duplicateOf).toBeUndefined();
    expect(model.calls).toBe(1);
    expect(await liveFactIds(wiki)).toHaveLength(1);
  });

  it('pins normalizeJournalSourceRef to the engine stored ref', async () => {
    const wiki = await makeWiki(scriptedModel('facts').llm);
    const params = save(7);
    await createJournalIngest(wiki)(ENTITY, params);

    const refs = await wiki.listSourceRefs(ENTITY);
    expect(refs.map((r) => r.sourceRef)).toContain(normalizeJournalSourceRef(params.sourceRef));
  });
});

describe('the save queue on the real engine and guard', () => {
  function startQueue(wiki: WikiMemory) {
    const actor = createActor(journalSaveQueueMachine, {
      input: { entityId: ENTITY, ingest: createJournalIngest(wiki), saveTimeoutMs: 10_000 },
    });
    actor.start();
    return actor;
  }

  it('a factless save ends failed with its text kept; RETRY stores it once', async () => {
    const { model, llm } = scriptedModel('empty');
    const wiki = await makeWiki(llm);
    const actor = startQueue(wiki);
    try {
      actor.send({ type: 'ENQUEUE', title: 'Morning pages', body: 'Three pages, longhand.' });
      const failed = await waitFor(actor, (s) => s.context.entries.some((e) => e.status === 'failed'));
      const [entry] = failed.context.entries;
      expect(entry).toMatchObject({ title: 'Morning pages', body: 'Three pages, longhand.', status: 'failed' });
      expect(entry.error?.message).toBe(NO_FACTS_SAVE_ERROR);
      expect(failed.context.savedCount).toBe(0);

      model.mode = 'facts';
      actor.send({ type: 'RETRY', id: entry.id });
      const saved = await waitFor(actor, (s) => s.context.savedCount === 1);
      expect(saved.context.entries).toEqual([]);
      expect(await liveFactIds(wiki)).toHaveLength(1);
    } finally {
      actor.stop();
    }
  });

  it('an empty note (no title, no body) fails with a message that offers discarding it', async () => {
    const wiki = await makeWiki(scriptedModel('empty').llm);
    const actor = startQueue(wiki);
    try {
      actor.send({ type: 'ENQUEUE', title: '', body: '' });
      const failed = await waitFor(actor, (s) => s.context.entries.some((e) => e.status === 'failed'));
      const [entry] = failed.context.entries;
      expect(entry).toMatchObject({ title: '', body: '', status: 'failed' });
      expect(entry.error?.message).toMatch(/discard it/);
    } finally {
      actor.stop();
    }
  });
});
