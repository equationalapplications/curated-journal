import { initLlama } from 'llama.rn';
import { AppState } from 'react-native';
import {
  createLlamaProvider,
  GenerationCancelledError,
  LLM_MAX_PREDICT_TOKENS,
  openGenerationScope,
  releaseContext,
  setNightShiftActive,
  subscribeNightShiftLlmProgress,
} from '@/lib/llamaProvider';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('expo-device', () => ({ totalMemory: 3 * 1024 ** 3 }));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(), currentState: 'active' },
  Platform: { OS: 'ios' },
}));

describe('createLlamaProvider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    setNightShiftActive(false);
    await releaseContext();
  });
  it('never pins weights on iOS, whatever the manifest says', async () => {
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m.gguf', llamaConfig: { useMlock: true } });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(initLlama).toHaveBeenCalledWith(expect.objectContaining({ use_mlock: false }));
  });

  it('quantizes the KV cache on a device below the comfortable RAM', async () => {
    const completion = jest.fn(async () => ({ text: 'hi' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m2.gguf', minComfortableRamBytes: 5 * 1024 ** 3 });
    await provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
    expect(initLlama).toHaveBeenCalledWith(expect.objectContaining({ cache_type_k: 'q8_0' }));
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

  // Releasing the context (app sent to the background) interrupts a running
  // completion, which llama.rn resolves with partial text and `interrupted`.
  it('rejects a completion interrupted by a context release', async () => {
    const completion = jest.fn(async () => ({ text: '{"facts": [', interrupted: true }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m-int.gguf' });
    await expect(provider.generateText({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow(
      'interrupted',
    );
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

  it('a cancelled scope stops its running completion and skips its queued calls', async () => {
    const finishers: ((text: string) => void)[] = [];
    const started: string[] = [];
    const completion = jest.fn(
      (params: { messages: { content: string }[] }) =>
        new Promise<{ text: string }>((resolve) => {
          started.push(params.messages[1].content);
          finishers.push((text) => resolve({ text }));
        }),
    );
    const stopCompletion = jest.fn(async () => {
      // llama.rn resolves a stopped completion with its partial text.
      finishers[finishers.length - 1]('{"partial');
    });
    jest
      .mocked(initLlama)
      .mockResolvedValueOnce({ completion, stopCompletion, release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m10.gguf' });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // Night Shift's call predates the save's scope.
    const before = provider.generateText({ systemPrompt: 's', userPrompt: 'before' });
    const scope = openGenerationScope();
    const save1 = provider.generateText({ systemPrompt: 's', userPrompt: 'save1' });
    const save2 = provider.generateText({ systemPrompt: 's', userPrompt: 'save2' });
    await tick();
    finishers[0]('before-done');
    await expect(before).resolves.toBe('before-done');
    await tick();
    expect(started).toEqual(['before', 'save1']);

    scope.cancel();
    await expect(save1).rejects.toBeInstanceOf(GenerationCancelledError);
    await expect(save2).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(stopCompletion).toHaveBeenCalledTimes(1);

    // Once the save ends its scope closes, and later calls run normally.
    scope.close();
    const after = provider.generateText({ systemPrompt: 's', userPrompt: 'after' });
    await tick();
    // save2 never reached the model.
    expect(started).toEqual(['before', 'save1', 'after']);
    finishers[2]('after-done');
    await expect(after).resolves.toBe('after-done');
  });

  it('a cancelled scope also cancels calls made later, until it closes', async () => {
    const completion = jest.fn(async () => ({ text: 'ran' }));
    jest
      .mocked(initLlama)
      .mockResolvedValueOnce({ completion, stopCompletion: jest.fn(), release: jest.fn() } as never);
    const provider = createLlamaProvider({ modelPath: '/m11.gguf' });

    const scope = openGenerationScope();
    scope.cancel();
    // The cancelled ingest moves on to its next chunk.
    await expect(
      provider.generateText({ systemPrompt: 's', userPrompt: 'next-chunk' }),
    ).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(completion).not.toHaveBeenCalled();

    scope.close();
    await expect(provider.generateText({ systemPrompt: 's', userPrompt: 'later' })).resolves.toBe(
      'ran',
    );
  });

  it('waits for the foreground before loading the model outside Night Shift', async () => {
    const listeners: ((state: string) => void)[] = [];
    const remove = jest.fn();
    jest.mocked(AppState.addEventListener).mockImplementation(((_: string, fn: (s: string) => void) => {
      listeners.push(fn);
      return { remove };
    }) as never);
    (AppState as { currentState: string }).currentState = 'background';
    const completion = jest.fn(async () => ({ text: 'ok' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release: jest.fn() } as never);
    try {
      const provider = createLlamaProvider({ modelPath: '/m12.gguf' });
      const call = provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
      await new Promise((r) => setTimeout(r, 0));
      expect(initLlama).not.toHaveBeenCalled();

      (AppState as { currentState: string }).currentState = 'active';
      listeners.forEach((fn) => fn('active'));
      await expect(call).resolves.toBe('ok');
      expect(remove).toHaveBeenCalled();
    } finally {
      (AppState as { currentState: string }).currentState = 'active';
    }
  });

  it('a cancel ends the foreground wait', async () => {
    jest.mocked(AppState.addEventListener).mockImplementation((() => ({ remove: jest.fn() })) as never);
    (AppState as { currentState: string }).currentState = 'background';
    try {
      const provider = createLlamaProvider({ modelPath: '/m13.gguf' });
      const scope = openGenerationScope();
      const call = provider.generateText({ systemPrompt: 's', userPrompt: 'u' });
      await new Promise((r) => setTimeout(r, 0));
      scope.cancel();
      await expect(call).rejects.toBeInstanceOf(GenerationCancelledError);
      expect(initLlama).not.toHaveBeenCalled();
      scope.close();
    } finally {
      (AppState as { currentState: string }).currentState = 'active';
    }
  });
});
