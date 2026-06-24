import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Target = { factId: string; blockAnchor?: string } | null;

type CitationNavContextValue = {
  target: Target;
  openCitation: (factId: string, blockAnchor?: string) => void;
  clearTarget: () => void;
};

const CitationNavigationContext = createContext<CitationNavContextValue | null>(null);

export function CitationNavigationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target>(null);
  const openCitation = useCallback((factId: string, blockAnchor?: string) => {
    setTarget({ factId, blockAnchor });
  }, []);
  const clearTarget = useCallback(() => setTarget(null), []);
  return (
    <CitationNavigationContext.Provider value={{ target, openCitation, clearTarget }}>
      {children}
    </CitationNavigationContext.Provider>
  );
}

export function useCitationNavigation(): CitationNavContextValue {
  const ctx = useContext(CitationNavigationContext);
  if (!ctx) throw new Error('useCitationNavigation requires CitationNavigationProvider');
  return ctx;
}
