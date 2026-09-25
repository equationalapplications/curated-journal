import type { EntityStatus } from '@equationalapplications/expo-llm-wiki';
import type { NightShiftLlmProgress } from '@/lib/llamaProvider';
import type { NightShiftOperation } from '@/machines/journalWikiMachine';

const idleLlm: NightShiftLlmProgress = {
  tokensGenerated: 0,
  maxTokens: 512,
  isGenerating: false,
};

const OPERATION_TITLES: Record<NightShiftOperation, string> = {
  librarian: 'Librarian pass',
  heal: 'Heal pass',
  reembed: 'Re-embed pass',
  prune: 'Prune pass',
};

export function nightShiftOperationTitle(operation: NightShiftOperation | null): string {
  if (!operation) return 'Night Shift';
  return OPERATION_TITLES[operation];
}

function healPhaseLabel(llm: NightShiftLlmProgress): string {
  if (llm.isGenerating) {
    return 'Running on-device AI — healing broken links and duplicates…';
  }
  if (llm.tokensGenerated > 0) {
    return 'Applying heal results — updating your graph…';
  }
  return 'Preparing heal pass — reviewing the graph…';
}

export function nightShiftPhaseLabel(
  operation: NightShiftOperation | null,
  status: EntityStatus,
  llm: NightShiftLlmProgress = idleLlm,
): string {
  if (operation === 'librarian') {
    // The library can run its own heal during the librarian step; say so in
    // the phase text only — title and step counter follow the machine queue.
    if (status.heal) return healPhaseLabel(llm);
    if (llm.isGenerating) {
      return 'Running on-device AI — synthesizing insights and new connections…';
    }
    if (llm.tokensGenerated > 0) {
      return 'Applying librarian results — updating your graph…';
    }
    return 'Preparing librarian pass — loading your notes…';
  }

  if (operation === 'heal') return healPhaseLabel(llm);

  if (operation === 'reembed') return 'Rebuilding search embeddings…';
  if (operation === 'prune') return 'Pruning old events and soft-deleted entries…';

  if (status.ingesting) return 'Reading your notes…';
  if (status.librarian) return 'Synthesizing insights…';
  if (status.heal) return 'Healing memory graph…';
  return 'Starting Night Shift…';
}

export function nightShiftDetailLabel(operation: NightShiftOperation | null): string {
  switch (operation) {
    case 'librarian':
      return 'The librarian reads your imported notes, asks the local model for new inferred facts, tasks, and graph edges, then updates search indexes.';
    case 'heal':
      return 'The heal pass reviews the graph for orphans and weak links, then asks the model which entries to merge, downgrade, or remove.';
    case 'reembed':
      return 'Refreshing vector embeddings so chat search stays accurate.';
    case 'prune':
      return 'Cleaning up old events and deleted records.';
    default:
      return 'Heavy maintenance runs on your device while this screen stays open.';
  }
}

export const NIGHT_SHIFT_STEP_COUNT = 2;

export function nightShiftStepLabel({
  queueIndex,
  queueLength,
  isNightShift,
  isAdvancing,
  hasStarted,
  nightShiftFinished = false,
}: {
  queueIndex: number;
  queueLength: number;
  isNightShift: boolean;
  isAdvancing: boolean;
  hasStarted: boolean;
  nightShiftFinished?: boolean;
}): string {
  const total = queueLength > 0 ? queueLength : NIGHT_SHIFT_STEP_COUNT;

  if (hasStarted && nightShiftFinished && !isNightShift && queueLength === 0) {
    return 'Night Shift complete';
  }

  if (isAdvancing && queueIndex + 1 < total) {
    return `Step ${queueIndex + 2} / ${total} — starting…`;
  }

  return `Step ${Math.min(queueIndex + 1, total)} / ${total}`;
}
