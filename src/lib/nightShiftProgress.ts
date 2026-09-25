import type { NightShiftLlmProgress } from '@/lib/llamaProvider';

/**
 * Share of a maintenance step per phase. Phases are laid end to end so each
 * starts where the previous one can reach, keeping the bar from moving
 * backward at a phase boundary.
 */
const STEP_PREP_START = 0.1;
const STEP_PREP = 0.25;
const STEP_LLM = 0.6;

/** Time constants (seconds) for creep while a step runs without token progress. */
const PREP_CREEP_SECONDS = 15;
const POST_CREEP_SECONDS = 30;

/** 0 at t=0, approaching (never reaching) 1 as t grows. */
function easeOut(seconds: number, timeConstant: number): number {
  return 1 - Math.exp(-seconds / timeConstant);
}

function inStepProgress(llm: NightShiftLlmProgress, elapsedSeconds: number): number {
  const llmEnd = STEP_PREP + STEP_LLM * Math.min(1, llm.tokensGenerated / llm.maxTokens);

  if (llm.isGenerating) return llmEnd;

  if (llm.tokensGenerated > 0) {
    // Applying results: ease from where generation stopped toward the end of the step.
    return llmEnd + (1 - llmEnd) * easeOut(elapsedSeconds, POST_CREEP_SECONDS);
  }

  // Preparing (loading notes, building the prompt): ease toward the start of generation.
  return (
    STEP_PREP_START + (STEP_PREP - STEP_PREP_START) * easeOut(elapsedSeconds, PREP_CREEP_SECONDS)
  );
}

/** Estimated overall Night Shift completion in the range [0, 1]. */
export function computeNightShiftProgress(
  queueIndex: number,
  queueLength: number,
  isStepRunning: boolean,
  llm: NightShiftLlmProgress,
  elapsedSecondsWhileStepRunning = 0,
): number {
  if (queueLength <= 0) return 0;

  const stepWeight = 1 / queueLength;

  if (!isStepRunning) {
    const completedSteps = Math.min(queueIndex + 1, queueLength);
    return completedSteps * stepWeight;
  }

  return (queueIndex + inStepProgress(llm, elapsedSecondsWhileStepRunning)) * stepWeight;
}
