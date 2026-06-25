import { MODEL_CATALOG, getCuratedModel, type CuratedModelId } from '@/catalog/modelManifest';

describe('modelManifest', () => {
  it('has exactly two catalog entries with the spec-mandated ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(ids).toEqual(['fast-light', 'deep-thinker']);
  });

  it('every entry has a positive sizeBytes matching its sizeLabel order of magnitude', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.sizeBytes).toBeGreaterThan(1_000_000_000);
      expect(model.sizeBytes).toBeLessThan(3_000_000_000);
    }
  });

  it('no catalog entry exceeds 3 GB (NG5 — Jetsam safety)', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.sizeBytes).toBeLessThan(3 * 1024 * 1024 * 1024);
    }
  });

  it('getCuratedModel returns the matching entry', () => {
    const model = getCuratedModel('deep-thinker');
    expect(model.displayName).toBe('Deep Thinker');
  });

  it('getCuratedModel throws on an unknown id', () => {
    expect(() => getCuratedModel('nope' as CuratedModelId)).toThrow('Unknown curated model id: nope');
  });
});
