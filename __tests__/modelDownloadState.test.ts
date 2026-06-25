import {
  createModelDownloadStateStore,
  type ModelDownloadStatus,
} from '@/services/modelDownloadState';

function makeDb() {
  let row: { model_id: string | null; pause_state_json: string | null; status: string; updated_at: string } | null = null;
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async (_sql: string, ...params: unknown[]) => {
      if (params.length === 1) {
        row = { model_id: null, pause_state_json: null, status: 'idle', updated_at: params[0] as string };
      } else {
        const [modelId, pauseStateJson, status, updatedAt] = params as [string, string | null, string, string];
        row = { model_id: modelId, pause_state_json: pauseStateJson, status, updated_at: updatedAt };
      }
      return { changes: 1 };
    }),
    getFirstAsync: jest.fn(async () => row),
  };
}

describe('modelDownloadState', () => {
  it('returns null status when no row has been written yet', async () => {
    const store = createModelDownloadStateStore(makeDb() as never);
    await expect(store.get()).resolves.toBeNull();
  });

  it('upserts and reads back the singleton row', async () => {
    const db = makeDb();
    const store = createModelDownloadStateStore(db as never);
    await store.set({ modelId: 'deep-thinker', status: 'downloading', pauseState: null });
    const result = await store.get();
    expect(result).toEqual({ modelId: 'deep-thinker', status: 'downloading', pauseState: null });
  });

  it('round-trips a pauseState object through JSON', async () => {
    const db = makeDb();
    const store = createModelDownloadStateStore(db as never);
    const pauseState = { url: 'https://x', fileUri: 'file://y', isDirectory: false, resumeData: 'abc' };
    await store.set({ modelId: 'fast-light', status: 'paused', pauseState });
    const result = await store.get();
    expect(result?.pauseState).toEqual(pauseState);
  });

  it('clear resets status to idle and removes pauseState', async () => {
    const db = makeDb();
    const store = createModelDownloadStateStore(db as never);
    await store.set({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    await store.clear();
    const result = await store.get();
    expect(result).toEqual({ modelId: null, status: 'idle', pauseState: null });
  });

  it('typechecks all four ModelDownloadStatus values', () => {
    const statuses: ModelDownloadStatus[] = ['idle', 'downloading', 'paused', 'failed'];
    expect(statuses).toHaveLength(4);
  });
});
