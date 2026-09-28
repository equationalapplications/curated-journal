import { createMockLlmProvider } from '@/lib/mockLlmProvider';

describe('createMockLlmProvider', () => {
  it('returns JSON for librarian-style prompts', async () => {
    const provider = createMockLlmProvider();
    const text = await provider.generateText({
      systemPrompt: 'Return JSON',
      userPrompt: 'librarian',
    });
    expect(JSON.parse(text)).toEqual({ facts: [], tasks: [] });
  });

  it('cites a fact id when user asks about notes', async () => {
    const provider = createMockLlmProvider();
    const text = await provider.generateText({
      systemPrompt: 'cite with [cite:id]',
      userPrompt: 'What did I write about stoicism?',
    });
    expect(text).toMatch(/\[cite:[a-zA-Z0-9_-]+\]/);
  });

  it('omits embed (v1 keyword-only)', () => {
    const provider = createMockLlmProvider();
    expect(provider.embed).toBeUndefined();
  });
});

describe('createMockLlmProvider ingest', () => {
  it('answers ingest prompts with a fact, so saving a note works in mock mode', async () => {
    const provider = createMockLlmProvider();
    const text = await provider.generateText({
      systemPrompt: 'Extract facts as JSON',
      userPrompt: 'Document Chunk:\n# Morning pages\n\nThree pages, longhand.',
    });
    const parsed = JSON.parse(text);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0]).toMatchObject({ title: 'Morning pages', confidence: 'inferred' });
    expect(parsed.facts[0].body).toContain('Three pages, longhand.');
  });
});
