/**
 * A note's markdown carries its title as the leading `# Heading` line. Views
 * that already render the title separately (the journal pane, the list
 * preview) would otherwise show it twice, so the heading has to come off the
 * body before it is rendered or summarised.
 */

/** The note's leading H1, if the body starts with one. */
function leadingHeading(body: string): { title: string; length: number } | null {
  const match = body.match(/^[ \t]*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/);
  if (!match) return null;
  return { title: match[1].trim(), length: match[0].length };
}

/**
 * The title to show for a note. Prefers an explicit `title` (the importer
 * records one) and otherwise lifts it from the body's leading H1.
 *
 * Anchored to the start of the body on purpose: a heading further down a note
 * is part of the note, not its name.
 */
export function noteTitle(body: string | null | undefined, fallback: string): string {
  if (!body) return fallback;
  return leadingHeading(body)?.title ?? fallback;
}

/**
 * The body to render below an already-rendered `title`, with that title's H1
 * removed. A heading that does not match `title` is left alone — it is real
 * content, and dropping it would lose a note's only section heading.
 */
export function noteBody(body: string | null | undefined, title: string): string {
  if (!body) return '';
  const heading = leadingHeading(body);
  if (!heading || heading.title !== title) return body;
  return body.slice(heading.length);
}

/**
 * A single-line summary of a note, for list previews. Drops the title line
 * (the caller renders the title) but keeps section headings, which are real
 * content — only inline emphasis and line structure are flattened away.
 */
export function notePreview(body: string | null | undefined, limit = 120): string {
  if (!body) return '';
  const text = noteBody(body, noteTitle(body, ''))
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
