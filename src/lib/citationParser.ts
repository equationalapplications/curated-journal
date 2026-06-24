export const CITE_REGEX = /\[cite:([a-zA-Z0-9_-]+)\]/g;

export type CitationSegment =
  | { type: 'text'; value: string }
  | { type: 'cite'; value: string };

function citeMatches(text: string): Iterable<RegExpMatchArray> {
  return text.matchAll(new RegExp(CITE_REGEX.source, 'g'));
}

export function extractCitationIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of citeMatches(text)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function splitCitationSegments(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  for (const match of citeMatches(text)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'cite', value: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
