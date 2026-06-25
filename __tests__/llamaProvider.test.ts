import { initLlama } from 'llama.rn';
import {
  createLlamaProvider,
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
      maxTokens: 512,
      isGenerating: false,
    });

    unsubscribe();
  });
});
