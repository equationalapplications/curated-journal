import { countIngestFailures } from '@/lib/ingestReport';
import type { IngestResult } from '@equationalapplications/expo-llm-wiki';

function makeResult(overrides: Partial<IngestResult> = {}): IngestResult {
  return {
    truncated: false,
    chunks: 3,
    ingestedChunks: 3,
    failedChunks: 0,
    ...overrides,
  };
}

describe('countIngestFailures', () => {
  it('sums failedChunks and parseFailures entries', () => {
    expect(
      countIngestFailures(
        makeResult({
          failedChunks: 2,
          parseFailures: [
            { chunkIndex: 0, sourceRef: 'a', source: 'parse', position: 0, message: 'x' },
            { chunkIndex: 1, sourceRef: 'b', source: 'llm', position: null, message: 'y' },
          ],
        }),
      ),
    ).toBe(4);
  });

  it('returns failedChunks alone when parseFailures is absent', () => {
    expect(countIngestFailures(makeResult({ failedChunks: 1 }))).toBe(1);
  });

  it('returns 0 for a clean result', () => {
    expect(countIngestFailures(makeResult())).toBe(0);
  });

  it('returns 0 for a null or undefined result', () => {
    expect(countIngestFailures(null)).toBe(0);
    expect(countIngestFailures(undefined)).toBe(0);
  });
});
