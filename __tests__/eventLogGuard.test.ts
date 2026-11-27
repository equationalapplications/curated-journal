import * as fs from 'fs';
import * as path from 'path';

// INTENT: the event log is never pruned. Engine prune hard-deletes events
// marked forgotten, so the app must never call forget/erase/expire.
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('event-log rule (INTENT: event log is never pruned)', () => {
  it('src never calls the engine forget/erase/expire methods', () => {
    const call = /\.(forget|erase|expire)\s*\(/;
    const destructured = /\{[^}]*\b(forget|erase|expire)\b[^}]*\}\s*=\s*(use\w*Wiki|\w*wiki\w*)/i;
    const offenders = walk(path.join(__dirname, '..', 'src')).filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return call.test(src) || destructured.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
