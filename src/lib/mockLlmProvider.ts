import type { LLMProvider } from '@equationalapplications/core-llm-wiki';

const LIBRARIAN_JSON = '{"facts":[],"tasks":[]}';

export function createMockLlmProvider(): LLMProvider {
  return {
    generateText: async ({ userPrompt }) => {
      if (/librarian|heal|maintenance/i.test(userPrompt)) {
        return LIBRARIAN_JSON;
      }
      return `Based on your notes [cite:demo_fact_1], here is a concise answer about: ${userPrompt.slice(0, 80)}`;
    },
  };
}
