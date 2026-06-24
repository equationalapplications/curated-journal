import { CITE_REGEX, extractCitationIds, splitCitationSegments } from '@/lib/citationParser';

describe('citationParser', () => {
  it('matches cite tokens', () => {
    expect('[cite:fact_abc]').toMatch(CITE_REGEX);
    expect(CITE_REGEX.exec('see [cite:fact_abc] here')?.[1]).toBe('fact_abc');
  });

  it('extracts unique ids in order', () => {
    expect(extractCitationIds('a [cite:x] b [cite:y] c [cite:x]')).toEqual(['x', 'y']);
  });

  it('splits text and cite segments', () => {
    expect(splitCitationSegments('Hi [cite:a] there')).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'cite', value: 'a' },
      { type: 'text', value: ' there' },
    ]);
  });
});
