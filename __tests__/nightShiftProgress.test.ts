import { computeNightShiftProgress } from '@/lib/nightShiftProgress';
import type { NightShiftLlmProgress } from '@/lib/llamaProvider';

const idleLlm: NightShiftLlmProgress = {
  tokensGenerated: 0,
  maxTokens: 512,
  isGenerating: false,
};

const midLlm: NightShiftLlmProgress = {
  tokensGenerated: 256,
  maxTokens: 512,
  isGenerating: true,
};

const postLlm: NightShiftLlmProgress = {
  tokensGenerated: 400,
  maxTokens: 512,
  isGenerating: false,
};

describe('computeNightShiftProgress', () => {
  it('returns 0 when the queue is empty', () => {
    expect(computeNightShiftProgress(0, 0, true, idleLlm)).toBe(0);
  });

  it('estimates low progress at the start of step 1', () => {
    const progress = computeNightShiftProgress(0, 2, true, idleLlm);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(0.1);
  });

  it('moves through the middle of step 1 during token generation', () => {
    const progress = computeNightShiftProgress(0, 2, true, midLlm);
    expect(progress).toBeGreaterThan(0.2);
    expect(progress).toBeLessThan(0.45);
  });

  it('jumps to 50% when step 1 finishes', () => {
    expect(computeNightShiftProgress(0, 2, false, postLlm)).toBe(0.5);
  });

  it('reaches 100% when both steps finish', () => {
    expect(computeNightShiftProgress(1, 2, false, postLlm)).toBe(1);
  });
});
