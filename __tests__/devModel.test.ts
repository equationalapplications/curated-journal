import { MODEL_CATALOG } from '@/catalog/modelManifest';
import { devLlmMode, findCachedCatalogModel } from '@/lib/devModel';

jest.mock('@/lib/entityStorage', () => ({ setModelPath: jest.fn(), setModelId: jest.fn() }));
jest.mock('@/services/modelDownloadService', () => ({ verifyDownload: jest.fn() }));

describe('devLlmMode', () => {
  it('is always off in release builds', () => {
    expect(devLlmMode('mock', false)).toBe('off');
    expect(devLlmMode(undefined, false)).toBe('off');
  });

  it('defaults to auto in dev and honours mock/off', () => {
    expect(devLlmMode(undefined, true)).toBe('auto');
    expect(devLlmMode('mock', true)).toBe('mock');
    expect(devLlmMode('off', true)).toBe('off');
    expect(devLlmMode('garbage', true)).toBe('auto');
  });
});

describe('findCachedCatalogModel', () => {
  it('returns the first catalog model whose file is complete', () => {
    const second = MODEL_CATALOG[1];
    expect(findCachedCatalogModel((m) => m.id === second.id)).toBe(second);
  });

  it('returns null when nothing complete is on disk (e.g. a partial download)', () => {
    expect(findCachedCatalogModel(() => false)).toBeNull();
  });
});

describe('scripts/dev-model.js', () => {
  // The script reads the catalog out of modelManifest.ts; if the catalog's
  // shape changes, this fails before a developer's download does.
  it('reads the same catalog the app uses', () => {
    const { readCatalog } = require('../scripts/dev-model.js');
    expect(readCatalog()).toEqual(
      MODEL_CATALOG.map(({ id, filename, hfUrl, sizeBytes }) => ({ id, filename, hfUrl, sizeBytes })),
    );
  });

  it('parses model, platform and serial arguments', () => {
    const { parseArgs } = require('../scripts/dev-model.js');
    expect(parseArgs([])).toMatchObject({ modelId: 'fast-light', platform: 'android', serial: null });
    expect(parseArgs(['smarter-slower', '--ios'])).toMatchObject({ modelId: 'smarter-slower', platform: 'ios' });
    expect(parseArgs(['--serial', 'emulator-5554'])).toMatchObject({ serial: 'emulator-5554' });
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option/);
  });
});
