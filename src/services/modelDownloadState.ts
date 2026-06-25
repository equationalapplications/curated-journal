import type * as SQLite from 'expo-sqlite';

export type ModelDownloadStatus = 'idle' | 'downloading' | 'paused' | 'failed';

export type DownloadPauseStateRecord = {
  url: string;
  fileUri: string;
  isDirectory: boolean;
  headers?: Record<string, string>;
  resumeData?: string;
};

export type ModelDownloadStateRecord = {
  modelId: string | null;
  status: ModelDownloadStatus;
  pauseState: DownloadPauseStateRecord | null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS model_download_state (
  id INTEGER PRIMARY KEY NOT NULL,
  model_id TEXT,
  pause_state_json TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

type Row = {
  model_id: string | null;
  pause_state_json: string | null;
  status: string;
  updated_at: string;
};

export function createModelDownloadStateStore(db: SQLite.SQLiteDatabase) {
  let ready: Promise<void> | null = null;

  function ensureSchema(): Promise<void> {
    if (!ready) ready = db.execAsync(SCHEMA).then(() => undefined);
    return ready;
  }

  return {
    async get(): Promise<ModelDownloadStateRecord | null> {
      await ensureSchema();
      const row = await db.getFirstAsync<Row>(
        'SELECT model_id, pause_state_json, status, updated_at FROM model_download_state WHERE id = 1',
      );
      if (!row) return null;
      return {
        modelId: row.model_id,
        status: row.status as ModelDownloadStatus,
        pauseState: row.pause_state_json ? (JSON.parse(row.pause_state_json) as DownloadPauseStateRecord) : null,
      };
    },

    async set(record: { modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null }): Promise<void> {
      await ensureSchema();
      await db.runAsync(
        `INSERT INTO model_download_state (id, model_id, pause_state_json, status, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET model_id = excluded.model_id, pause_state_json = excluded.pause_state_json,
           status = excluded.status, updated_at = excluded.updated_at`,
        record.modelId,
        record.pauseState ? JSON.stringify(record.pauseState) : null,
        record.status,
        new Date().toISOString(),
      );
    },

    async clear(): Promise<void> {
      await ensureSchema();
      await db.runAsync(
        `INSERT INTO model_download_state (id, model_id, pause_state_json, status, updated_at)
         VALUES (1, NULL, NULL, 'idle', ?)
         ON CONFLICT(id) DO UPDATE SET model_id = NULL, pause_state_json = NULL, status = 'idle', updated_at = excluded.updated_at`,
        new Date().toISOString(),
      );
    },
  };
}
