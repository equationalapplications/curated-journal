import { createContext, useContext, type ReactNode } from 'react';

const AppReadyContext = createContext(false);

export function AppReadyProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <AppReadyContext.Provider value={ready}>{children}</AppReadyContext.Provider>;
}

export function useAppReady(): boolean {
  return useContext(AppReadyContext);
}
