import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { createActor } from 'xstate';
import { useSelector } from '@xstate/react';
import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import { useWikiMaintenance } from '@equationalapplications/expo-llm-wiki';
import {
  journalWikiMachine,
  type JournalWikiMachineEvents,
  type NightShiftOperation,
  type NightShiftOutcome,
} from '@/machines/journalWikiMachine';

type JournalWikiContextValue = {
  send: (event: JournalWikiMachineEvents) => void;
  queueIndex: number;
  queueLength: number;
  currentOperation: NightShiftOperation | null;
  isStepRunning: boolean;
  isAdvancing: boolean;
  lastError: Error | null;
  isNightShift: boolean;
  nightShiftOutcome: NightShiftOutcome;
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
  const { runLibrarian, runHeal, runPrune } = useWikiMaintenance();
  const maintenanceRef = useRef({ runLibrarian, runHeal, runPrune });
  maintenanceRef.current = { runLibrarian, runHeal, runPrune };

  const actor = useMemo(
    () =>
      createActor(journalWikiMachine, {
        input: {
          wiki,
          maintenance: {
            runLibrarian: (entityId: string) => maintenanceRef.current.runLibrarian(entityId),
            runHeal: (entityId: string) => maintenanceRef.current.runHeal(entityId),
            runPrune: async (id: string) => {
              await maintenanceRef.current.runPrune(id);
            },
          },
        },
      }).start(),
    [wiki],
  );

  useEffect(() => {
    return () => {
      actor.stop();
    };
  }, [actor]);

  const send = useCallback((event: JournalWikiMachineEvents) => actor.send(event), [actor]);
  const queueIndex = useSelector(actor, (s) => s.context.queueIndex);
  const queueLength = useSelector(actor, (s) => s.context.queue.length);
  const currentOperation = useSelector(actor, (s) => {
    const { queue, queueIndex } = s.context;
    if (!s.matches('nightShift') || queue.length === 0) return null;
    if (s.matches({ nightShift: 'advance' }) && queueIndex + 1 < queue.length) {
      return queue[queueIndex + 1]?.operation ?? null;
    }
    return queue[queueIndex]?.operation ?? null;
  });
  const isStepRunning = useSelector(actor, (s) => s.matches({ nightShift: 'step' }));
  const isAdvancing = useSelector(actor, (s) => s.matches({ nightShift: 'advance' }));
  const lastError = useSelector(actor, (s) => s.context.lastError);
  const isNightShift = useSelector(actor, (s) => s.matches('nightShift'));
  const nightShiftOutcome = useSelector(actor, (s) => s.context.nightShiftOutcome);

  const value = useMemo(
    () => ({
      send,
      queueIndex,
      queueLength,
      currentOperation,
      isStepRunning,
      isAdvancing,
      lastError,
      isNightShift,
      nightShiftOutcome,
    }),
    [
      currentOperation,
      isAdvancing,
      isNightShift,
      isStepRunning,
      lastError,
      nightShiftOutcome,
      queueIndex,
      queueLength,
      send,
    ],
  );

  return <JournalWikiContext.Provider value={value}>{children}</JournalWikiContext.Provider>;
}

export function useJournalWiki(): JournalWikiContextValue {
  const ctx = useContext(JournalWikiContext);
  if (!ctx) throw new Error('useJournalWiki requires JournalWikiProvider');
  return ctx;
}
