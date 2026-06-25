import { useEffect, useMemo, useState } from 'react';
import {
  getNightShiftLlmProgress,
  subscribeNightShiftLlmProgress,
  type NightShiftLlmProgress,
} from '@/lib/llamaProvider';
import { computeNightShiftProgress } from '@/lib/nightShiftProgress';

export function useNightShiftProgress(
  queueIndex: number,
  queueLength: number,
  isStepRunning: boolean,
  isNightShift: boolean,
): { progress: number; llm: NightShiftLlmProgress } {
  const [llm, setLlm] = useState<NightShiftLlmProgress>(getNightShiftLlmProgress);

  useEffect(() => {
    if (!isNightShift) return;
    return subscribeNightShiftLlmProgress(setLlm);
  }, [isNightShift]);

  const progress = useMemo(
    () => computeNightShiftProgress(queueIndex, queueLength, isStepRunning, llm),
    [isStepRunning, llm, queueIndex, queueLength],
  );

  return { progress, llm };
}
