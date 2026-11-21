/** T-own: only the controller touches a transfer or the saved download row. */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(d.name) ? [full] : [];
  });
}

/** Every module specifier a file imports, re-exports, requires or dynamically imports. */
function specifiers(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g, // import ... from, import * as, export ... from
    /\bimport\s*['"]([^'"]+)['"]/g, // side-effect import
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const files = sources(SRC).map((f) => ({ file: rel(f), text: stripComments(fs.readFileSync(f, 'utf8')) }));

describe('T-own download ownership', () => {
  it('only the service names DownloadTask, however it reaches it', () => {
    // A namespace import, a require or a re-export still has to spell `DownloadTask` to use it.
    const offenders = files.filter(({ text }) => /\bDownloadTask\b/.test(text)).map((f) => f.file);
    expect(offenders).toEqual(['services/modelDownloadService.ts']);
  });

  it('only the controller reaches the transfer functions or the store factory', () => {
    const importers = files.filter(
      ({ file, text }) =>
        file !== 'services/modelDownloadService.ts' &&
        file !== 'services/modelDownloadController.ts' &&
        specifiers(text).some((s) => /modelDownloadService$/.test(s)),
    );
    for (const { file, text } of importers) {
      // Every importer other than the controller may use only the file helpers: no namespace
      // import, no require, no dynamic import (they could reach startDownload through a member),
      // and the transfer function names never appear.
      const bypass =
        /import\s*\*\s*as\s+\w+\s+from\s*['"][^'"]*modelDownloadService['"]/.test(text) ||
        /\brequire\s*\(\s*['"][^'"]*modelDownloadService['"]\s*\)/.test(text) ||
        /\bimport\s*\(\s*['"][^'"]*modelDownloadService['"]\s*\)/.test(text) ||
        /\b(startDownload|resumeDownload)\b/.test(text);
      expect({ file, bypass }).toEqual({ file, bypass: false });
    }
    const store = files.filter(({ text }) => /\bcreateModelDownloadStateStore\b/.test(text)).map((f) => f.file);
    expect(store.sort()).toEqual(['services/modelDownloadController.ts', 'services/modelDownloadState.ts']);
  });

  it('the hub machine imports neither', () => {
    const machine = files.find((f) => f.file === 'machines/modelHubMachine.ts')!;
    expect(specifiers(machine.text).some((s) => /modelDownloadService$/.test(s))).toBe(false);
    expect(machine.text).not.toMatch(/\bcreateModelDownloadStateStore\b/);
    expect(machine.text).not.toMatch(/\bDownloadTask\b/);
  });
});
