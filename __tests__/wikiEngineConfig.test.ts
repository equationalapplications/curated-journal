import { createWiki, type LLMProvider } from '@equationalapplications/core-llm-wiki';
import { WIKI_CONFIG } from '@/lib/constants';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';

// llm-wiki 8.x warns at construction when a host's config would silently
// lose 7.x behavior under the new 'ops' + 'deferred' defaults. That warning
// is the library's own "your pin is incomplete" signal, so the app config
// must not trigger it once it actually reaches the engine.
const llm: LLMProvider = { generateText: async () => '{}' };
const defaultsWarnings = (spy: jest.SpyInstance) =>
  spy.mock.calls.map((args) => String(args[0])).filter((m) => m.includes('now defaults to'));

describe('wiki engine config', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  // Order matters: the library warns once per process per message, so the
  // app config runs before the control that is expected to warn.
  it('reaches the engine without a changed-defaults warning', async () => {
    const wiki = createWiki(createNodeSqliteAdapter(), { llmProvider: llm, config: WIKI_CONFIG });
    await wiki.setup();
    expect(defaultsWarnings(warn)).toEqual([]);
    await wiki.close?.();
  });

  it('control: the 7.x-only config (thresholds, no pin) does warn', async () => {
    const wiki = createWiki(createNodeSqliteAdapter(), {
      llmProvider: llm,
      config: { autoLibrarianThreshold: Infinity, autoHealThreshold: Infinity },
    });
    await wiki.setup();
    expect(defaultsWarnings(warn)).toHaveLength(1);
    await wiki.close?.();
  });
});
