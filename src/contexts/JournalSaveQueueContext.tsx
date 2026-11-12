import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useMachine } from '@xstate/react';
import { useWiki } from '@equationalapplications/expo-llm-wiki';
import { useJournal } from '@/contexts/JournalContext';
import { createJournalIngest } from '@/lib/journalIngest';
import {
  journalSaveQueueMachine,
  type JournalSaveQueueInput,
  type QueuedEntry,
  type SaveWarning,
} from '@/machines/journalSaveQueueMachine';

type JournalSaveQueueValue = {
  entries: QueuedEntry[];
  warnings: SaveWarning[];
  /** Increments on every successful save. */
  savedCount: number;
  enqueue: (input: { title: string; body: string }) => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  ackWarning: (id: string) => void;
};

const JournalSaveQueueContext = createContext<JournalSaveQueueValue | null>(null);

/**
 * Holds the background save queue above the tab navigator (spec R7), so
 * switching tabs or remounting the journal screen never loses a queued save.
 * Must be mounted inside `JournalProvider` and `WikiProvider`.
 */
export function JournalSaveQueueProvider({ children }: { children: ReactNode }) {
  const { entityId } = useJournal();
  const wiki = useWiki();
  // The machine gets one stable ingest that always calls the live wiki, so a
  // Fast-Refreshed or re-bootstrapped wiki never strands later saves on a dead
  // closure, and a new `useWiki()` identity never re-renders the queue.
  const wikiRef = useRef(wiki);
  useLayoutEffect(() => {
    wikiRef.current = wiki;
  }, [wiki]);
  const ingest = useCallback<JournalSaveQueueInput['ingest']>(
    (id, params) => createJournalIngest(wikiRef.current)(id, params),
    [],
  );
  const [state, send] = useMachine(journalSaveQueueMachine, {
    input: { entityId, ingest, saveTimeoutMs: 120_000 },
  });

  useEffect(() => {
    send({ type: 'SET_ENGINE', entityId, ingest });
  }, [send, entityId, ingest]);

  const enqueue = useCallback(
    ({ title, body }: { title: string; body: string }) => send({ type: 'ENQUEUE', title, body }),
    [send],
  );
  const retry = useCallback((id: string) => send({ type: 'RETRY', id }), [send]);
  const discard = useCallback((id: string) => send({ type: 'DISCARD', id }), [send]);
  const ackWarning = useCallback((id: string) => send({ type: 'ACK_WARNING', id }), [send]);

  const { entries, warnings, savedCount } = state.context;
  const value = useMemo(
    () => ({ entries, warnings, savedCount, enqueue, retry, discard, ackWarning }),
    [entries, warnings, savedCount, enqueue, retry, discard, ackWarning],
  );
  return (
    <JournalSaveQueueContext.Provider value={value}>{children}</JournalSaveQueueContext.Provider>
  );
}

export function useJournalSaveQueue(): JournalSaveQueueValue {
  const ctx = useContext(JournalSaveQueueContext);
  if (!ctx) throw new Error('useJournalSaveQueue requires JournalSaveQueueProvider');
  return ctx;
}
