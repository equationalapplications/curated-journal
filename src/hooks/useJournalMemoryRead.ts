import { useMemoryRead } from '@equationalapplications/expo-llm-wiki';
import { JOURNAL_LIST_MAX_RESULTS } from '@/lib/constants';

const journalReadOptions = { maxResults: JOURNAL_LIST_MAX_RESULTS } as const;

export function useJournalMemoryRead(entityId: string) {
  return useMemoryRead(entityId, '', journalReadOptions);
}
