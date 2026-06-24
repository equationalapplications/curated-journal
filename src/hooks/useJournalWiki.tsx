import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { createActor } from 'xstate';
import { useSelector } from '@xstate/react';
import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import { useWikiMaintenance } from '@equationalapplications/expo-llm-wiki';
import {
  journalWikiMachine,
  type JournalWikiMachineEvents,
} from '@/machines/journalWikiMachine';

type JournalWikiContextValue = {
  send: (event: JournalWikiMachineEvents) => void;
  queueIndex: number;
  queueLength: number;
  lastError: Error | null;
  isNightShift: boolean;
};

const JournalWikiContext = createContext<JournalWikiContextValue | null>(null);

export function JournalWikiProvider({
  wiki,
  entityId: _entityId,
  children,
}: {
  wiki: WikiMemory;
  entityId: string;
  children: ReactNode;
}) {
  const { runLibrarian, runHeal, runPrune, runReembed } = useWikiMaintenance();

  const actor = useMemo(
    () =>
      createActor(journalWikiMachine, {
        input: {
          wiki,
          maintenance: {
            runLibrarian,
            runHeal,
            runReembed: async (id?: string) => {
              await runReembed(id);
            },
            runPrune: async (id: string) => {
              await runPrune(id);
            },
          },
        },
      }).start(),
    [runHeal, runLibrarian, runPrune, runReembed, wiki],
  );

  useEffect(() => {
    return () => {
      actor.stop();
    };
  }, [actor]);

  const send = useCallback((event: JournalWikiMachineEvents) => actor.send(event), [actor]);
  const queueIndex = useSelector(actor, (s) => s.context.queueIndex);
  const queueLength = useSelector(actor, (s) => s.context.queue.length);
  const lastError = useSelector(actor, (s) => s.context.lastError);
  const isNightShift = useSelector(actor, (s) => s.matches('nightShift'));

  const value = useMemo(
    () => ({ send, queueIndex, queueLength, lastError, isNightShift }),
    [isNightShift, lastError, queueIndex, queueLength, send],
  );

  return <JournalWikiContext.Provider value={value}>{children}</JournalWikiContext.Provider>;
}

export function useJournalWiki(): JournalWikiContextValue {
  const ctx = useContext(JournalWikiContext);
  if (!ctx) throw new Error('useJournalWiki requires JournalWikiProvider');
  return ctx;
}
