import { createContext, useContext, type ReactNode } from 'react';

type CompletionFn = () => Promise<void>;

const ModelHubCompletionContext = createContext<CompletionFn | null>(null);

export function ModelHubCompletionProvider({
  onComplete,
  children,
}: {
  onComplete: CompletionFn;
  children: ReactNode;
}) {
  return <ModelHubCompletionContext.Provider value={onComplete}>{children}</ModelHubCompletionContext.Provider>;
}

export function useModelHubCompletion(): CompletionFn {
  const ctx = useContext(ModelHubCompletionContext);
  if (!ctx) throw new Error('useModelHubCompletion requires ModelHubCompletionProvider');
  return ctx;
}
