import { nightShiftPhaseLabel, nightShiftStepLabel } from '@/lib/nightShiftCopy';

const idleStatus = { ingesting: false, librarian: false, heal: false };

describe('nightShiftPhaseLabel', () => {
  it('shows AI generation while tokens are streaming', () => {
    expect(
      nightShiftPhaseLabel(
        'librarian',
        idleStatus,
        { tokensGenerated: 12, maxTokens: 512, isGenerating: true },
      ),
    ).toContain('Running on-device AI');
  });

  it('shows applying results after generation finishes', () => {
    expect(
      nightShiftPhaseLabel(
        'heal',
        idleStatus,
        { tokensGenerated: 80, maxTokens: 512, isGenerating: false },
      ),
    ).toContain('Applying heal results');
  });

  it('shows preparing before generation starts', () => {
    expect(
      nightShiftPhaseLabel(
        'librarian',
        { ingesting: false, librarian: true, heal: false },
        { tokensGenerated: 0, maxTokens: 512, isGenerating: false },
      ),
    ).toContain('Preparing librarian pass');
  });
});

describe('nightShiftStepLabel', () => {
  it('shows step 1 while the first pass runs', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 0,
        queueLength: 2,
        isNightShift: true,
        isAdvancing: false,
        hasStarted: true,
      }),
    ).toBe('Step 1 / 2');
  });

  it('shows step 2 starting while advancing between passes', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 0,
        queueLength: 2,
        isNightShift: true,
        isAdvancing: true,
        hasStarted: true,
      }),
    ).toBe('Step 2 / 2 — starting…');
  });

  it('shows step 2 while the heal pass runs', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 1,
        queueLength: 2,
        isNightShift: true,
        isAdvancing: false,
        hasStarted: true,
      }),
    ).toBe('Step 2 / 2');
  });

  it('shows complete only after the queue is cleared', () => {
    expect(
      nightShiftStepLabel({
        queueIndex: 0,
        queueLength: 0,
        isNightShift: false,
        isAdvancing: false,
        hasStarted: true,
      }),
    ).toBe('Night Shift complete');
  });
});
