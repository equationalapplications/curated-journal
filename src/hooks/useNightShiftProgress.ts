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
  const [creep, setCreep] = useState<{ key: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!isNightShift) return;
    return subscribeNightShiftLlmProgress(setLlm);
  }, [isNightShift]);

  // Creep only while a step runs without streaming tokens. The key changes per
  // step and per phase (preparing vs applying), so a stale count reads as 0
  // without a synchronous setState in the effect body.
  const creepKey =
    isStepRunning && !llm.isGenerating
      ? `${queueIndex}:${llm.tokensGenerated > 0 ? 'apply' : 'prep'}`
      : null;

  useEffect(() => {
    if (creepKey === null) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setCreep({ key: creepKey, seconds: Math.floor((Date.now() - startedAt) / 1000) });
    }, 1000);
    return () => clearInterval(timer);
  }, [creepKey]);

  const elapsedSeconds = creep !== null && creep.key === creepKey ? creep.seconds : 0;

  const progress = useMemo(
    () => computeNightShiftProgress(queueIndex, queueLength, isStepRunning, llm, elapsedSeconds),
    [elapsedSeconds, isStepRunning, llm, queueIndex, queueLength],
  );

  return { progress, llm };
}
