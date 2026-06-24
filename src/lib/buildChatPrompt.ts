import {
  CHARS_PER_TOKEN_ESTIMATE,
  CHAT_OUTPUT_TOKEN_RESERVE,
} from '@/lib/constants';

export type PromptFact = { id: string; title: string; body: string };

export type BuildChatPromptInput = {
  systemPrompt: string;
  userQuery: string;
  facts: PromptFact[];
  graphContext: string;
  contextTokenBudget: number;
};

export type BuildChatPromptResult = {
  systemPrompt: string;
  userPrompt: string;
  truncated: boolean;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function buildChatPrompt(input: BuildChatPromptInput): BuildChatPromptResult {
  const reserved = estimateTokens(input.systemPrompt) + CHAT_OUTPUT_TOKEN_RESERVE;
  const graphTokens = input.graphContext ? estimateTokens(input.graphContext) + 2 : 0;
  let remaining =
    input.contextTokenBudget - reserved - graphTokens - estimateTokens(input.userQuery) - 20;
  if (remaining < 0) remaining = 0;

  const factBlocks: string[] = [];
  let truncated = false;
  for (const fact of input.facts) {
    const block = `### ${fact.title} (ID: ${fact.id})\n${fact.body}`;
    const blockTokens = estimateTokens(block);
    if (blockTokens > remaining) {
      truncated = true;
      break;
    }
    factBlocks.push(block);
    remaining -= blockTokens;
  }

  const sections = [
    `User question: ${input.userQuery}`,
    input.graphContext ? `Graph context:\n${input.graphContext}` : '',
    factBlocks.length ? `Relevant notes:\n${factBlocks.join('\n\n')}` : '',
    'Answer concisely. Cite sources inline as [cite:fact_id].',
  ].filter(Boolean);

  return {
    systemPrompt: input.systemPrompt,
    userPrompt: sections.join('\n\n'),
    truncated,
  };
}
