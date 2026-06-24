import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type PaneMode = 'notes' | 'chat';

type JournalContextValue = {
  entityId: string;
  selectedFactId: string | null;
  setSelectedFactId: (id: string | null) => void;
  paneMode: PaneMode;
  setPaneMode: (mode: PaneMode) => void;
};

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({
  entityId,
  children,
}: {
  entityId: string;
  children: ReactNode;
}) {
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>('notes');
  const value = useMemo(
    () => ({ entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode }),
    [entityId, selectedFactId, paneMode],
  );
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(): JournalContextValue {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal requires JournalProvider');
  return ctx;
}
