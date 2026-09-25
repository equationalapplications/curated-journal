import type { NightShiftLlmProgress } from '@/lib/llamaProvider';

/** Share of a maintenance step spent outside the LLM call. */
const STEP_PREP = 0.1;
const STEP_LLM = 0.75;
const STEP_POST = 0.15;

/** Time constants (seconds) for creep while a step runs without token progress. */
const PREP_CREEP_SECONDS = 15;
const POST_CREEP_SECONDS = 30;

/** 0 at t=0, approaching (never reaching) 1 as t grows. */
function easeOut(seconds: number, timeConstant: number): number {
  return 1 - Math.exp(-seconds / timeConstant);
}

function inStepProgress(llm: NightShiftLlmProgress, elapsedSeconds: number): number {
  if (llm.isGenerating) {
    const llmFraction = Math.min(1, llm.tokensGenerated / llm.maxTokens);
    return STEP_PREP + STEP_LLM * llmFraction;
  }

  if (llm.tokensGenerated > 0) {
    // Applying results: ease from 70% toward 100% of the post-LLM share.
    return (
      STEP_PREP + STEP_LLM + STEP_POST * (0.7 + 0.3 * easeOut(elapsedSeconds, POST_CREEP_SECONDS))
    );
  }

  // Preparing (loading notes, building the prompt): ease toward 20% of the LLM share.
  return STEP_PREP + STEP_LLM * 0.2 * easeOut(elapsedSeconds, PREP_CREEP_SECONDS);
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
