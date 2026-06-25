import { initLlama } from 'llama.rn';
import { File } from 'expo-file-system';
import { runModelSmokeTest } from '@/lib/modelSmokeTest';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, exists: true, delete: jest.fn() })),
}));

describe('modelSmokeTest', () => {
  it('resolves true when initLlama and completion succeed', async () => {
    const release = jest.fn(async () => undefined);
    const completion = jest.fn(async () => ({ text: 'OK' }));
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release } as never);
    const result = await runModelSmokeTest({
      modelPath: '/doc/model.gguf',
      llamaConfig: { contextSize: 2048, useMlock: false },
    });
    expect(result.ok).toBe(true);
    expect(completion).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });

  it('resolves false and deletes the file when initLlama throws (OOM/load failure)', async () => {
    jest.mocked(initLlama).mockRejectedValueOnce(new Error('failed to load model'));
    const result = await runModelSmokeTest({
      modelPath: '/doc/bad.gguf',
      llamaConfig: { contextSize: 4096 },
    });
    expect(result.ok).toBe(false);
    const fileInstance = jest.mocked(File).mock.results[0]!.value as { delete: jest.Mock };
    expect(fileInstance.delete).toHaveBeenCalled();
  });

  it('resolves false when completion itself throws after a successful load', async () => {
    const release = jest.fn(async () => undefined);
    const completion = jest.fn(async () => {
      throw new Error('inference failed');
    });
    jest.mocked(initLlama).mockResolvedValueOnce({ completion, release } as never);
    const result = await runModelSmokeTest({
      modelPath: '/doc/model.gguf',
      llamaConfig: { contextSize: 2048 },
    });
    expect(result.ok).toBe(false);
    expect(release).toHaveBeenCalled();
  });
});
