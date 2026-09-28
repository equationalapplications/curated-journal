// The committed seed fixture must stay importable. parseOkfBundle only reads
// files under `entities/<id>/`; a layout drift makes the zip import as zero
// facts silently (it happened once), so assert on what the app will parse.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOkfBundle } from '@equationalapplications/core-llm-wiki';

const ROOT = join(__dirname, '..', 'fixtures', 'night-shift-seed');
const FACTS = 'entities/journal/facts';

describe('fixtures/night-shift-seed', () => {
  it('parses to 50 facts with cross-link edges', () => {
    const files = readdirSync(join(ROOT, FACTS)).map((name) => ({
      path: `${FACTS}/${name}`,
      content: readFileSync(join(ROOT, FACTS, name), 'utf8'),
    }));
    const bundle = parseOkfBundle('seed', files, { defaultSchema: 'fact' }).entities.seed;
    expect(bundle.facts).toHaveLength(50);
    expect(bundle.edges).toHaveLength(150);
  });

  it('zips the same entities/ layout', () => {
    const entries = execFileSync('unzip', ['-Z1', join(ROOT, '..', 'night-shift-seed.zip')], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((e) => e.endsWith('.md'));
    expect(entries).toHaveLength(50);
    for (const entry of entries) expect(entry.startsWith(`${FACTS}/`)).toBe(true);
  });
});
