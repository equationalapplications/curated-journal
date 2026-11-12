import {
  createModelDownloadStateStore,
  normalizePauseState,
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
  it('lands unawaited writes in call order, even when an earlier write is slow', async () => {
    const db = makeDb();
    const realRun = db.runAsync.getMockImplementation()!;
    let releaseFirst!: () => void;
    db.runAsync.mockImplementationOnce(async (sql: string, ...params: unknown[]) => {
      await new Promise<void>((r) => { releaseFirst = r; });
      return realRun(sql, ...params);
    });
    const store = createModelDownloadStateStore(db as never);

    // The machine's `downloading` entry write is fire-and-forget; the smoke
    // marker is written right after it.
    void store.set({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    const marker = store.set({ modelId: 'fast-light', status: 'smoke-testing', pauseState: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(db.runAsync).toHaveBeenCalledTimes(1);

    releaseFirst();
    await marker;
    await expect(store.get()).resolves.toMatchObject({ status: 'smoke-testing' });
  });

  it('a failed write does not block the next one', async () => {
    const db = makeDb();
    db.runAsync.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const store = createModelDownloadStateStore(db as never);
    await expect(store.set({ modelId: 'fast-light', status: 'downloading', pauseState: null })).rejects.toThrow(
      'SQLITE_BUSY',
    );
    await store.clear();
    await expect(store.get()).resolves.toMatchObject({ status: 'idle' });
  });

  it('returns null status when no row has been written yet', async () => {
    const store = createModelDownloadStateStore(makeDb() as never);
    await expect(store.get()).resolves.toBeNull();
  });

  it('upserts and reads back the singleton row', async () => {
    const db = makeDb();
    const store = createModelDownloadStateStore(db as never);
    await store.set({ modelId: 'smarter-slower', status: 'downloading', pauseState: null });
    const result = await store.get();
    expect(result).toEqual({ modelId: 'smarter-slower', status: 'downloading', pauseState: null });
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

  it('normalizePauseState is null unless resumeData is a non-empty string', () => {
    const base = { url: 'u', fileUri: 'f', isDirectory: false };
    expect(normalizePauseState(null)).toBeNull();
    expect(normalizePauseState(undefined)).toBeNull();
    expect(normalizePauseState({ ...base, resumeData: undefined })).toBeNull();
    expect(normalizePauseState({ ...base, resumeData: '' })).toBeNull();
    expect(normalizePauseState({ ...base, resumeData: 'rd' })).toEqual({ ...base, resumeData: 'rd' });
  });

  it('get() reads a paused row without resumeData as pauseState null, keeping status', async () => {
    const db = makeDb();
    await db.runAsync('x', 'fast-light', JSON.stringify({ url: 'u', fileUri: 'f', isDirectory: false }), 'paused', 't');
    const result = await createModelDownloadStateStore(db as never).get();
    expect(result).toEqual({ modelId: 'fast-light', status: 'paused', pauseState: null });
  });

  it('set() stores NULL for a pauseState without resumeData', async () => {
    const db = makeDb();
    const store = createModelDownloadStateStore(db as never);
    await store.set({ modelId: 'fast-light', status: 'paused', pauseState: { url: 'u', fileUri: 'f', isDirectory: false } });
    expect(db.runAsync.mock.calls.at(-1)![2]).toBeNull();
  });

  it('round-trips smoke-testing and smoke-failed statuses', async () => {
    const store = createModelDownloadStateStore(makeDb() as never);
    await store.set({ modelId: 'm', status: 'smoke-testing', pauseState: null });
    expect((await store.get())?.status).toBe('smoke-testing');
    await store.set({ modelId: 'm', status: 'smoke-failed', pauseState: null });
    expect((await store.get())?.status).toBe('smoke-failed');
  });
});
