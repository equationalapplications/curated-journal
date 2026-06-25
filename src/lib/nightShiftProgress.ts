import type { NightShiftLlmProgress } from '@/lib/llamaProvider';

/** Share of a maintenance step spent outside the LLM call. */
const STEP_PREP = 0.1;
const STEP_LLM = 0.75;
const STEP_POST = 0.15;

function inStepProgress(llm: NightShiftLlmProgress): number {
  if (llm.isGenerating) {
    const llmFraction = Math.min(1, llm.tokensGenerated / llm.maxTokens);
    return STEP_PREP + STEP_LLM * llmFraction;
  }

  if (llm.tokensGenerated > 0) {
    return STEP_PREP + STEP_LLM + STEP_POST * 0.7;
  }

  return STEP_PREP;
}

/** Estimated overall Night Shift completion in the range [0, 1]. */
export function computeNightShiftProgress(
  queueIndex: number,
  queueLength: number,
  isStepRunning: boolean,
  llm: NightShiftLlmProgress,
): number {
  if (queueLength <= 0) return 0;

  const stepWeight = 1 / queueLength;

  if (!isStepRunning) {
    const completedSteps = Math.min(queueIndex + 1, queueLength);
    return completedSteps * stepWeight;
  }

  return (queueIndex + inStepProgress(llm)) * stepWeight;
}
