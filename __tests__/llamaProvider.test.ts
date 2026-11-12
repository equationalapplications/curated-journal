import { initLlama } from 'llama.rn';
import {
  createLlamaProvider,
  LLM_MAX_PREDICT_TOKENS,
  releaseContext,
  setNightShiftActive,
  subscribeNightShiftLlmProgress,
} from '@/lib/llamaProvider';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

describe('createLlamaProvider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    setNightShiftActive(false);
    await releaseContext();
  });
  it('passes use_mlock: false through when useMlock is false in config', async () => {
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m.gguf', useMlock: false });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(initLlama).toHaveBeenCalledWith(expect.objectContaining({ use_mlock: false }));
  });

  it('defaults use_mlock to true when useMlock is omitted', async () => {
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m2.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(initLlama).toHaveBeenCalledWith(expect.objectContaining({ use_mlock: true }));
  });

  it('disables thinking so core-llm-wiki receives raw JSON', async () => {
    const completion = jest.fn(async () => ({ text: '{}' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m4.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(completion).toHaveBeenCalledWith(
      expect.objectContaining({ jinja: true, enable_thinking: false, n_predict: LLM_MAX_PREDICT_TOKENS }),
      undefined,
    );
  });

  it('advertises its output budget to the wiki as maxOutputTokens', () => {
    const provider = createLlamaProvider({ modelPath: '/m5.gguf' });
    expect(provider.maxOutputTokens).toBe(LLM_MAX_PREDICT_TOKENS);
  });

  it('streams token progress while night shift is active', async () => {
    setNightShiftActive(true);
    const snapshots: { tokensGenerated: number; isGenerating: boolean }[] = [];
    const unsubscribe = subscribeNightShiftLlmProgress((progress) => {
      snapshots.push({
        tokensGenerated: progress.tokensGenerated,
        isGenerating: progress.isGenerating,
      });
    });

    const completion = jest.fn(
      async (_params: unknown, onToken?: (data: { token: string }) => void) => {
        onToken?.({ token: 'a' });
        onToken?.({ token: 'b' });
        return { text: 'hi', tokens_predicted: 2 };
      },
    );
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);

    const provider = createLlamaProvider({ modelPath: '/m3.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });

    expect(snapshots.some((s) => s.isGenerating && s.tokensGenerated === 2)).toBe(true);
    expect(snapshots.at(-1)).toEqual({ tokensGenerated: 2, isGenerating: false });

    unsubscribe();
    setNightShiftActive(false);
  });

  it('does not emit token progress when night shift is inactive', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNightShiftLlmProgress(listener);

    const completion = jest.fn(
      async (_params: unknown, onToken?: (data: { token: string }) => void) => {
        onToken?.({ token: 'a' });
        return { text: 'hi', tokens_predicted: 1 };
      },
    );
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);

    const provider = createLlamaProvider({ modelPath: '/m4.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toEqual({
      tokensGenerated: 0,
      maxTokens: LLM_MAX_PREDICT_TOKENS,
      isGenerating: false,
    });

    unsubscribe();
  });

  // Spec specs/2026-11-12-background-save R9: a token callback switches on
  // llama.rn's emit_partial_completion (a full re-parse plus a JS-thread hop
  // per token), so it is passed only when Night Shift shows token progress.
  it('passes no token callback when night shift is inactive', async () => {
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m6.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(completion).toHaveBeenCalledTimes(1);
    expect((completion.mock.calls[0] as unknown[])[1]).toBeUndefined();
  });

  it('passes a token callback while night shift is active', async () => {
    setNightShiftActive(true);
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m7.gguf' });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect((completion.mock.calls[0] as unknown[])[1]).toEqual(expect.any(Function));
    setNightShiftActive(false);
  });

  // R8: a background save, a chat question and Night Shift share one llama
  // context; overlapping completions make llama.rn throw "Context is busy".
  it('runs generateText calls one at a time, in call order', async () => {
    const finishers: (() => void)[] = [];
    const order: string[] = [];
    const completion = jest.fn(
      (params: { messages: { content: string }[] }) =>
        new Promise<{ text: string }>((resolve) => {
          const name = params.messages[1].content;
          order.push(`start:${name}`);
          finishers.push(() => {
            order.push(`end:${name}`);
            resolve({ text: name });
          });
        }),
    );
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m8.gguf' });

    const a = provider.generateText({ systemPrompt: 's', userPrompt: 'A' });
    const b = provider.generateText({ systemPrompt: 's', userPrompt: 'B' });
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['start:A']);

    finishers[0]();
    await expect(a).resolves.toBe('A');
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['start:A', 'end:A', 'start:B']);

    finishers[1]();
    await expect(b).resolves.toBe('B');
  });

  it('releases the lock for the next call when a call fails', async () => {
    const completion = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ text: 'ok' });
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m9.gguf' });

    const a = provider.generateText({ systemPrompt: 's', userPrompt: 'A' });
    const b = provider.generateText({ systemPrompt: 's', userPrompt: 'B' });
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('ok');
  });
});
