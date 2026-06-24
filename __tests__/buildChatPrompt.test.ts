import { buildChatPrompt } from '@/lib/buildChatPrompt';

const system = 'You are a journal assistant. Cite with [cite:fact_id].';

describe('buildChatPrompt', () => {
  it('includes ranked facts and graph context', () => {
    const { userPrompt } = buildChatPrompt({
      systemPrompt: system,
      userQuery: 'morning routine',
      facts: [{ id: 'f1', title: 'Routine', body: 'Wake at 6am' }],
      graphContext: '[fact] Routine (ID: f1)',
      contextTokenBudget: 1000,
    });
    expect(userPrompt).toContain('morning routine');
    expect(userPrompt).toContain('Wake at 6am');
    expect(userPrompt).toContain('[fact] Routine');
  });

  it('truncates facts to fit token budget', () => {
    const longBody = 'x'.repeat(8000);
    const { userPrompt, truncated } = buildChatPrompt({
      systemPrompt: system,
      userQuery: 'q',
      facts: [{ id: 'f1', title: 'T', body: longBody }],
      graphContext: '',
      contextTokenBudget: 200,
    });
    expect(truncated).toBe(true);
    expect(userPrompt.length).toBeLessThan(longBody.length);
  });
});
