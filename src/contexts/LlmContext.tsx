import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';

const LlmContext = createContext<LLMProvider | null>(null);

export function LlmProvider({ provider, children }: { provider: LLMProvider; children: ReactNode }) {
  return <LlmContext.Provider value={provider}>{children}</LlmContext.Provider>;
}

export function useLlm(): LLMProvider {
  const ctx = useContext(LlmContext);
  if (!ctx) throw new Error('useLlm requires LlmProvider');
  return ctx;
}
