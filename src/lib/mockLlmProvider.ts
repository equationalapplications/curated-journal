import type { LLMProvider } from '@equationalapplications/core-llm-wiki';

const LIBRARIAN_JSON = '{"facts":[],"tasks":[]}';

export function createMockLlmProvider(): LLMProvider {
  return {
    generateText: async ({ userPrompt }) => {
      if (/librarian|heal|maintenance/i.test(userPrompt)) {
        return LIBRARIAN_JSON;
      }
      // Ingest asks for JSON back, not prose — without this the wiki's
      // parseJsonResponse throws and every save fails. The chunk is
      // `# <title>\n\n<body>` (journalSaveMachine).
      if (userPrompt.startsWith('Document Chunk:')) {
        const chunk = userPrompt.slice('Document Chunk:'.length).trim();
        const heading = /^#\s+(.+)$/m.exec(chunk);
        return JSON.stringify({
          facts: [
            {
              title: heading?.[1]?.trim() ?? 'Untitled',
              body: chunk,
              confidence: 'inferred',
            },
          ],
          tasks: [],
        });
      }
      return `Based on your notes [cite:demo_fact_1], here is a concise answer about: ${userPrompt.slice(0, 80)}`;
    },
  };
}
