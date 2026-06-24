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
