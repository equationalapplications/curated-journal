import { noteBody, notePreview, noteTitle } from '@/lib/noteText';

describe('noteTitle', () => {
  it('lifts the title from a leading H1', () => {
    expect(noteTitle('# Morning pages\n\nBody text.', 'Untitled')).toBe('Morning pages');
  });

  it('falls back when the body has no leading H1', () => {
    expect(noteTitle('Just a body.', 'Untitled')).toBe('Untitled');
    expect(noteTitle(null, 'Untitled')).toBe('Untitled');
  });

  it('ignores a heading that is not the first line', () => {
    expect(noteTitle('Intro paragraph.\n\n# Later heading\n\nMore.', 'Untitled')).toBe('Untitled');
  });
});

describe('noteBody', () => {
  it('drops the H1 when it is the title we already render', () => {
    expect(noteBody('# Morning pages\n\nBody text.', 'Morning pages')).toBe('\nBody text.');
  });

  it('keeps a heading that does not match the title', () => {
    const body = '# A different heading\n\nBody text.';
    expect(noteBody(body, 'Morning pages')).toBe(body);
  });

  it('leaves a body with no heading alone', () => {
    expect(noteBody('Just a body.', 'Morning pages')).toBe('Just a body.');
  });

  it('handles a single-line body that is only the heading', () => {
    expect(noteBody('# Only a title', 'Only a title')).toBe('');
  });

  it('is empty for a missing body', () => {
    expect(noteBody(null, 'Morning pages')).toBe('');
  });
});

describe('notePreview', () => {
  it('does not repeat the title', () => {
    expect(
      notePreview('# Morning pages\n\nBus was late so I listened to a full album.', 'Morning pages'),
    ).toBe('Bus was late so I listened to a full album.');
  });

  it('keeps a heading that is not the title it is previewing', () => {
    // The row renders "Travel" from the record, so a body opening "# Packing"
    // is a real section heading, not a second title — same as in the pane.
    expect(notePreview('# Packing\n\nShoes and a hat.', 'Travel')).toBe('Packing Shoes and a hat.');
  });

  it('previews a heading-only body that is not the title', () => {
    expect(notePreview('# Packing', 'Travel')).toBe('Packing');
  });

  it('keeps section headings but flattens inline emphasis', () => {
    expect(notePreview('## Section\n\n- **bold** item\n- second', 'Untitled')).toBe(
      'Section bold item second',
    );
  });

  it('keeps hyphens that belong to the note text', () => {
    // Only a leading `-` is a list marker; `-42` and `check-in` are words.
    expect(notePreview('Dropped to -42 after the check-in.', 'Untitled')).toBe(
      'Dropped to -42 after the check-in.',
    );
  });

  it('keeps punctuation that sits inside a word', () => {
    // `#` and `_` are formatting only where they mark formatting. Elsewhere
    // they are the note's text, and dropping them changes what it says.
    expect(notePreview('C# notes and snake_case identifiers', 'Untitled')).toBe(
      'C# notes and snake_case identifiers',
    );
  });

  it('keeps a heading that is not the title it is previewing, whole', () => {
    // A `#` at the start of a line strips only the marker, never the words
    // after it — this used to lose the first one.
    expect(notePreview('# List item\n\nContent', 'Untitled')).toBe('List item Content');
  });

  it('flattens inline code and italic, and keeps a bare asterisk', () => {
    expect(notePreview('Ran `npm test` then *twice* for 2 * 3', 'Untitled')).toBe(
      'Ran npm test then twice for 2 * 3',
    );
  });

  it('truncates with an ellipsis', () => {
    expect(notePreview('x'.repeat(200), 'Untitled', 10)).toBe(`${'x'.repeat(10)}…`);
  });

  it('is empty for a missing body', () => {
    expect(notePreview(null, 'Untitled')).toBe('');
  });
});
