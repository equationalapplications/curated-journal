/** Pins the event-log / runPrune lint rules (eslint.config.js) with fixtures. */
const path = require('path');
const { ESLint } = require('eslint');

const RULES = new Set(['no-restricted-syntax', 'no-restricted-imports', 'no-restricted-properties']);

const MUST_FLAG = [
  'm.runPrune(id)',
  'm.runPrune(id, { retainEventsFor: 30 })',
  'm.runPrune(id, { retainEventsFor: 30, x: { retainEventsFor: null } })',
  'm.runPrune(id, buildOpts({ retainEventsFor: null }))',
  'm.runPrune(id, { onProgress: () => log({ retainEventsFor: null }) })',
  'm.runPrune(id, { retainEventsFor: null, ...opts })',
  'm.runPrune(id, opts)',
  'p.then(m.runPrune)',
  'ids.forEach(m.runPrune)',
  'const prune = m.runPrune',
  'const x = { pruneAll: m.runPrune }',
  'm.runPrune.bind(m)',
  'const { runPrune: p } = useWikiMaintenance()',
  'const { runPrune } = w; ids.forEach(runPrune)',
  "import { useWikiForget } from '@equationalapplications/expo-llm-wiki'",
  'w.forget(1)',
  "w['erase']()",
  'const d = { forgotten_at: 1 }',
  'const q = `UPDATE events SET forgotten_at = ?`',
];
const MUST_NOT_FLAG = ['m.runPrune(id, { retainEventsFor: null })', 'wiki.pruneKeepingEvents(id)'];

describe('event-log lint rules', () => {
  const root = path.resolve(__dirname, '..');
  const eslint = new ESLint({
    cwd: root,
    // Jest forbids ESLint's dynamic import of the config file; load it via require.
    overrideConfigFile: true,
    overrideConfig: require(path.join(root, 'eslint.config.js')),
  });
  const flagged = async (code: string) => {
    const [res] = await eslint.lintText(code, { filePath: 'src/__probe.ts' });
    return res.messages.filter((m: { ruleId: string | null }) => m.ruleId && RULES.has(m.ruleId));
  };

  it.each(MUST_FLAG)('flags %s', async (code) => {
    expect((await flagged(code)).length).toBeGreaterThan(0);
  }, 30000);

  it.each(MUST_NOT_FLAG)('allows %s', async (code) => {
    expect(await flagged(code)).toEqual([]);
  }, 30000);
});
