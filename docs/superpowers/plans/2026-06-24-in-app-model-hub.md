# In-App Model Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings-first GGUF picker + mock-LLM fallback with a required, first-launch Model Hub: pick a curated model, download over Wi-Fi (cellular override), verify by exact byte count, smoke-test, then enter the journal — with pause/resume across app restarts and backgrounding.

**Architecture:** A new `modelHubMachine` (XState v5, same `setup()`/`fromPromise()` style as the existing `journalWikiMachine`) drives the flow. A `modelDownloadService` module wraps Expo SDK 56 `DownloadTask` (module-level mutable task handle, same pattern as `sharedContext` in `llamaProvider.ts`). Download/pause state persists to a new `model_download_state` SQLite table (same `createXStore(db)` pattern as `chatMessages.ts`). `RootLayout` gates on `getModelPath()`: no path → render the new `ModelHubStack`; valid path → existing wiki bootstrap with the real llama provider only (mock provider becomes Jest-only).

**Tech Stack:** Expo SDK 56, `expo-file-system` `DownloadTask`/`File`/`Paths` (already installed, ~56.0.8), `expo-network` ~56.0.5 (new dependency), `expo-application` ~56.0.3 (new dependency), `expo-keep-awake` ~56.0.3 (already installed), XState v5 (^5.32.2) + `@xstate/react`, `expo-sqlite` ~56.0.5, `expo-secure-store` ~56.0.4, `react-native-reanimated` 4.3.1, Jest + `jest-expo`.

**Verified external facts (fetched live via `curl -I -L`, do not re-guess):**

| Model | URL | `sizeBytes` | HF commit SHA |
|---|---|---|---|
| `fast-light` | `https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf` | `2393231072` | `a64113399c2f6b8ad3e11c394733a2ddadaa7f33` |
| `deep-thinker` | `https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf` | `2104932768` | `7dabda4d13d513e3e842b20f0d435c732f172cbe` |

**Verified `expo-file-system` API (read from `node_modules/expo-file-system/build/NetworkTasks.d.ts` and `.types.d.ts` in this repo — SDK 56.0.8, not the spec's hypothetical shape):**

```typescript
class DownloadTask {
  constructor(url: string, destination: File | Directory, options?: DownloadTaskOptions);
  get state(): 'idle' | 'active' | 'paused' | 'completed' | 'cancelled' | 'error';
  downloadAsync(): Promise<File | null>;   // null if paused before completion
  pauseAsync(): Promise<void>;             // waits until task reaches 'paused'
  resumeAsync(): Promise<File | null>;
  cancel(): void;
  savable(): DownloadPauseState;           // only while paused
  static fromSavable(state: DownloadPauseState, options?: DownloadTaskOptions): DownloadTask;
}
type DownloadTaskOptions = { headers?: Record<string,string>; onProgress?: (d: { bytesWritten: number; totalBytes: number }) => void; signal?: AbortSignal; sessionType?: 'background'|'foreground' };
type DownloadPauseState = { url: string; fileUri: string; isDirectory: boolean; headers?: Record<string,string>; resumeData?: string };
```

`File` (from `expo-file-system`) exposes `exists: boolean`, `size: number` (0 if missing), `delete(): void` (verified in `node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts`).

**Deviations from the spec's literal API sketch (§4.4):** the spec shows `new DownloadTask(url, dest, { headers, onProgress })` then `await task.downloadAsync()` — this matches the real API. The spec's `task.pauseAsync()` → `task.savable()` two-step matches real API exactly. No behavioral deviation; only the type names above are the verified real ones to use instead of guessing.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/catalog/modelManifest.ts` | Bundled catalog of curated models (types + 2 entries), pinned `sizeBytes`/SHA. |
| `src/lib/buildUserAgent.ts` | Builds the `CuratedJournal/{version} (Expo; {os})` User-Agent string. |
| `src/lib/entityStorage.ts` (modify) | Add `getModelId`/`setModelId`/`getDisplayName`/`setDisplayName`/`clearModelPath`. |
| `src/lib/constants.ts` (modify) | Add `MODEL_ID_KEY`, `DISPLAY_NAME_KEY` SecureStore key constants. |
| `src/lib/networkGate.ts` | Wraps `expo-network`; classifies connection as `'wifi' \| 'cellular' \| 'offline'`. |
| `src/services/modelDownloadState.ts` | SQLite singleton-row store for `model_download_state` (status/pauseState), mirrors `chatMessages.ts`. |
| `src/services/modelDownloadService.ts` | Wraps `DownloadTask` lifecycle (start/pause/resume/cancel), classifies write errors (`disk-full` vs `network`), exact byte verification. |
| `src/lib/modelSmokeTest.ts` | Runs a short `initLlama` completion against a freshly downloaded/imported model; deletes file on failure. |
| `src/lib/llamaProvider.ts` (modify) | Add `useMlock` option to `createLlamaProvider` (manifest-driven, default `true`). |
| `src/machines/modelHubMachine.ts` | XState v5 machine: `selecting → confirmingNetwork → downloading → verifying → smokeTest → complete`, plus `paused`/`cellularConfirm`/`failed`. |
| `src/hooks/useModelHub.tsx` | React context wrapping `createActor(modelHubMachine)`, wires `AppState` → `APP_BACKGROUND`/`APP_FOREGROUND`. |
| `src/app/model-hub/_layout.tsx` | `ModelHubStack` — wraps screens in `ModelHubProvider`. |
| `src/app/model-hub/index.tsx` | "Choose Your AI" screen. |
| `src/app/model-hub/download.tsx` | Progress screen (speed/ETA, pause/resume, tips carousel, optional display name, error states). |
| `src/app/model-hub/import.tsx` | Custom `.gguf` import screen (reuses doc-picker logic, no byte check, smoke-test gated). |
| `src/app/_layout.tsx` (modify) | Gate: no model path → `ModelHubStack`; valid path → existing wiki bootstrap, real provider only. |
| `src/app/(tabs)/settings.tsx` (modify) | Replace "Pick GGUF model" with "Change AI model" (delete-then-redownload flow, §4.10). |
| `docs/qa/model-hub-device-matrix.md` | Manual QA artifact stub for the M6 on-device Jetsam soak (not automatable — see Task 21). |

Tests live in `__tests__/` (flat, matching existing convention), one file per new module.

---

### Task 1: Install new Expo packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install via Expo CLI (not raw npm) so versions match the SDK 56 bundle**

```bash
npx expo install expo-network expo-application
```

Expected: `package.json` gains `"expo-network": "~56.0.5"` and `"expo-application": "~56.0.3"` under `dependencies`; `node_modules/expo-network` and `node_modules/expo-application` are created.

- [ ] **Step 2: Verify**

```bash
ls node_modules/expo-network node_modules/expo-application
```

Expected: both directories exist, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-network and expo-application for Model Hub"
```

---

### Task 2: Curated model manifest

**Files:**
- Create: `src/catalog/modelManifest.ts`
- Test: `__tests__/modelManifest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { MODEL_CATALOG, getCuratedModel, type CuratedModelId } from '@/catalog/modelManifest';

describe('modelManifest', () => {
  it('has exactly two catalog entries with the spec-mandated ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(ids).toEqual(['fast-light', 'deep-thinker']);
  });

  it('every entry has a positive sizeBytes matching its sizeLabel order of magnitude', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.sizeBytes).toBeGreaterThan(1_000_000_000);
      expect(model.sizeBytes).toBeLessThan(3_000_000_000);
    }
  });

  it('no catalog entry exceeds 3 GB (NG5 — Jetsam safety)', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.sizeBytes).toBeLessThan(3 * 1024 * 1024 * 1024);
    }
  });

  it('getCuratedModel returns the matching entry', () => {
    const model = getCuratedModel('deep-thinker');
    expect(model.displayName).toBe('Deep Thinker');
  });

  it('getCuratedModel throws on an unknown id', () => {
    expect(() => getCuratedModel('nope' as CuratedModelId)).toThrow('Unknown curated model id: nope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/modelManifest.test.ts`
Expected: FAIL with "Cannot find module '@/catalog/modelManifest'"

- [ ] **Step 3: Write the manifest**

```typescript
export type CuratedModelId = 'fast-light' | 'deep-thinker';

export type LlamaModelConfig = {
  contextSize: number;
  nGpuLayers?: number;
  useMlock?: boolean;
};

export type DeviceHint = 'all' | 'recommended-high-ram';

export type CuratedModel = {
  id: CuratedModelId;
  displayName: string;
  tagline: string;
  sizeLabel: string;
  sizeBytes: number;
  hfUrl: string;
  filename: string;
  llamaConfig: LlamaModelConfig;
  deviceHint: DeviceHint;
  deviceWarning?: string;
};

// sizeBytes pinned against the live HF `resolve/main` Content-Length at the
// commit SHA noted below. If a download fails byte verification for every
// user, the upstream owner likely rewrote `main` — re-HEAD the hfUrl, update
// sizeBytes + the SHA comment, and ship a normal app update (see spec §4.8).
export const MODEL_CATALOG: CuratedModel[] = [
  {
    id: 'fast-light',
    displayName: 'Fast & Light',
    tagline: 'Best for everyday journaling. Fast responses, gentle on battery.',
    sizeLabel: '~2.3 GB',
    // HF commit a64113399c2f6b8ad3e11c394733a2ddadaa7f33
    sizeBytes: 2393231072,
    hfUrl:
      'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    filename: 'phi-3-mini-4k-instruct-q4.gguf',
    llamaConfig: { contextSize: 4096, useMlock: true },
    deviceHint: 'all',
  },
  {
    id: 'deep-thinker',
    displayName: 'Deep Thinker',
    tagline: 'Richer synthesis and emergent ontology. Works on most modern phones and tablets.',
    sizeLabel: '~2.0 GB',
    // HF commit 7dabda4d13d513e3e842b20f0d435c732f172cbe
    sizeBytes: 2104932768,
    hfUrl:
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    llamaConfig: { contextSize: 4096, useMlock: false },
    deviceHint: 'all',
  },
];

export function getCuratedModel(id: CuratedModelId): CuratedModel {
  const model = MODEL_CATALOG.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown curated model id: ${id}`);
  return model;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/modelManifest.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/catalog/modelManifest.ts __tests__/modelManifest.test.ts
git commit -m "feat: add curated model manifest catalog"
```

---

### Task 3: `buildUserAgent` helper

**Files:**
- Create: `src/lib/buildUserAgent.ts`
- Test: `__tests__/buildUserAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { buildUserAgent } from '@/lib/buildUserAgent';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0' }));

describe('buildUserAgent', () => {
  it('matches the required format on iOS', () => {
    Platform.OS = 'ios';
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; ios)');
  });

  it('matches the required format on android', () => {
    Platform.OS = 'android';
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; android)');
  });

  it('falls back to 1.0 when nativeApplicationVersion is null', () => {
    jest.mocked(Application).nativeApplicationVersion = null;
    expect(buildUserAgent()).toBe('CuratedJournal/1.0 (Expo; android)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/buildUserAgent.test.ts`
Expected: FAIL with "Cannot find module '@/lib/buildUserAgent'"

- [ ] **Step 3: Write the implementation**

```typescript
import { Platform } from 'react-native';
import * as Application from 'expo-application';

export function buildUserAgent(): string {
  const version = Application.nativeApplicationVersion ?? '1.0';
  return `CuratedJournal/${version} (Expo; ${Platform.OS})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/buildUserAgent.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildUserAgent.ts __tests__/buildUserAgent.test.ts
git commit -m "feat: add buildUserAgent for HF download requests"
```

---

### Task 4: Extend `entityStorage.ts` and `constants.ts` for model id / display name

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/entityStorage.ts`
- Modify: `__tests__/entityStorage.test.ts`

- [ ] **Step 1: Write the failing tests (append to existing file)**

Add to `__tests__/entityStorage.test.ts`, inside the existing `describe('entityStorage', ...)` block, after the existing tests:

```typescript
  it('round-trips model id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('deep-thinker');
    await expect(getModelId()).resolves.toBe('deep-thinker');
    await setModelId('deep-thinker');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(MODEL_ID_KEY, 'deep-thinker');
  });

  it('round-trips display name', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('My Journal');
    await expect(getDisplayName()).resolves.toBe('My Journal');
    await setDisplayName('My Journal');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DISPLAY_NAME_KEY, 'My Journal');
  });

  it('clearModelPath deletes the stored path and model id', async () => {
    await clearModelPath();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(MODEL_PATH_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(MODEL_ID_KEY);
  });
```

Update the top imports in that file to:

```typescript
import * as SecureStore from 'expo-secure-store';
import {
  getOrCreateEntityId,
  getModelPath,
  setModelPath,
  getModelId,
  setModelId,
  getDisplayName,
  setDisplayName,
  clearModelPath,
} from '@/lib/entityStorage';
import { ENTITY_ID_KEY, MODEL_PATH_KEY, MODEL_ID_KEY, DISPLAY_NAME_KEY } from '@/lib/constants';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/entityStorage.test.ts`
Expected: FAIL — `getModelId is not a function` (or import error) since `MODEL_ID_KEY`/`DISPLAY_NAME_KEY` and the new functions don't exist yet.

- [ ] **Step 3: Add the new constants**

In `src/lib/constants.ts`, change the last line from:

```typescript
export const MODEL_PATH_KEY = 'curated_journal_model_path';
```

to:

```typescript
export const MODEL_PATH_KEY = 'curated_journal_model_path';
export const MODEL_ID_KEY = 'curated_journal_model_id';
export const DISPLAY_NAME_KEY = 'curated_journal_display_name';
```

- [ ] **Step 4: Add the new storage functions**

Replace the full contents of `src/lib/entityStorage.ts` with:

```typescript
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  ENTITY_ID_KEY,
  MODEL_PATH_KEY,
  MODEL_ID_KEY,
  DISPLAY_NAME_KEY,
} from '@/lib/constants';

export async function getOrCreateEntityId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENTITY_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(ENTITY_ID_KEY, id);
  return id;
}

export async function getModelPath(): Promise<string | null> {
  return SecureStore.getItemAsync(MODEL_PATH_KEY);
}

export async function setModelPath(path: string): Promise<void> {
  await SecureStore.setItemAsync(MODEL_PATH_KEY, path);
}

export async function getModelId(): Promise<string | null> {
  return SecureStore.getItemAsync(MODEL_ID_KEY);
}

export async function setModelId(id: string): Promise<void> {
  await SecureStore.setItemAsync(MODEL_ID_KEY, id);
}

export async function getDisplayName(): Promise<string | null> {
  return SecureStore.getItemAsync(DISPLAY_NAME_KEY);
}

export async function setDisplayName(name: string): Promise<void> {
  await SecureStore.setItemAsync(DISPLAY_NAME_KEY, name);
}

export async function clearModelPath(): Promise<void> {
  await SecureStore.deleteItemAsync(MODEL_PATH_KEY);
  await SecureStore.deleteItemAsync(MODEL_ID_KEY);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/entityStorage.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/lib/entityStorage.ts __tests__/entityStorage.test.ts
git commit -m "feat: add modelId/displayName storage and clearModelPath"
```

---

### Task 5: `networkGate` — Wi-Fi / cellular / offline classification

**Files:**
- Create: `src/lib/networkGate.ts`
- Test: `__tests__/networkGate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import * as Network from 'expo-network';
import { checkNetworkGate } from '@/lib/networkGate';

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE', UNKNOWN: 'UNKNOWN' },
}));

describe('networkGate', () => {
  it('returns wifi when connected over WIFI', async () => {
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.WIFI,
    });
    await expect(checkNetworkGate()).resolves.toBe('wifi');
  });

  it('returns cellular when connected over CELLULAR', async () => {
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.CELLULAR,
    });
    await expect(checkNetworkGate()).resolves.toBe('cellular');
  });

  it('returns offline when not connected', async () => {
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
      type: Network.NetworkStateType.NONE,
    });
    await expect(checkNetworkGate()).resolves.toBe('offline');
  });

  it('treats an unknown connected type as offline (fail closed)', async () => {
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: Network.NetworkStateType.UNKNOWN,
    });
    await expect(checkNetworkGate()).resolves.toBe('offline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/networkGate.test.ts`
Expected: FAIL with "Cannot find module '@/lib/networkGate'"

- [ ] **Step 3: Write the implementation**

```typescript
import * as Network from 'expo-network';

export type NetworkGateState = 'wifi' | 'cellular' | 'offline';

export async function checkNetworkGate(): Promise<NetworkGateState> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return 'offline';
  if (state.type === Network.NetworkStateType.WIFI) return 'wifi';
  if (state.type === Network.NetworkStateType.CELLULAR) return 'cellular';
  return 'offline';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/networkGate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/networkGate.ts __tests__/networkGate.test.ts
git commit -m "feat: add networkGate wifi/cellular/offline classifier"
```

---

### Task 6: `model_download_state` SQLite store

**Files:**
- Create: `src/services/modelDownloadState.ts`
- Test: `__tests__/modelDownloadState.test.ts`

This mirrors the `createChatStore(db)` pattern in `src/services/chatMessages.ts` exactly: lazy `ensureSchema()`, plain `db.execAsync`/`runAsync`/`getFirstAsync`. The table holds a **singleton row** (`id = 1`) per spec §4.4.

- [ ] **Step 1: Write the failing test**

```typescript
import {
  createModelDownloadStateStore,
  type ModelDownloadStatus,
} from '@/services/modelDownloadState';

function makeDb() {
  let row: { model_id: string; pause_state_json: string | null; status: string; updated_at: string } | null = null;
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async (_sql: string, ...params: unknown[]) => {
      const [modelId, pauseStateJson, status, updatedAt] = params as [string, string | null, string, string];
      row = { model_id: modelId, pause_state_json: pauseStateJson, status, updated_at: updatedAt };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/modelDownloadState.test.ts`
Expected: FAIL with "Cannot find module '@/services/modelDownloadState'"

- [ ] **Step 3: Write the implementation**

```typescript
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

    async set(record: { modelId: string; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null }): Promise<void> {
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
```

Note: the test's `makeDb()` mock stores `params` positionally and ignores the `ON CONFLICT` SQL text (mocks don't parse SQL), so `runAsync`'s mock implementation in the test re-assigns `row` unconditionally on every call — that's why `set()` then `clear()` both work against the same mock without real SQLite semantics.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/modelDownloadState.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/modelDownloadState.ts __tests__/modelDownloadState.test.ts
git commit -m "feat: add model_download_state SQLite store"
```

---

### Task 7: `modelDownloadService` — `DownloadTask` lifecycle wrapper

**Files:**
- Create: `src/services/modelDownloadService.ts`
- Test: `__tests__/modelDownloadService.test.ts`

This module holds the active `DownloadTask` as module-level mutable state, the same convention as `sharedContext` in `src/lib/llamaProvider.ts`. It is the only place that imports `DownloadTask`/`File`/`Paths` from `expo-file-system` for downloads, so the machine and UI never touch the native API directly.

- [ ] **Step 1: Write the failing test**

```typescript
import { DownloadTask, File } from 'expo-file-system';
import {
  startDownload,
  pauseDownload,
  resumeDownload,
  verifyDownload,
  classifyDownloadError,
} from '@/services/modelDownloadService';
import type { CuratedModel } from '@/catalog/modelManifest';

jest.mock('expo-file-system', () => {
  const mockTaskInstances: Record<string, unknown> = {};
  return {
    File: jest.fn().mockImplementation((...args: unknown[]) => ({
      uri: 'file:///doc/test.gguf',
      exists: true,
      size: 2393231072,
      delete: jest.fn(),
      __args: args,
    })),
    Paths: { document: 'file:///doc' },
    DownloadTask: jest.fn().mockImplementation(function (
      this: Record<string, unknown>,
      url: string,
      _dest: unknown,
      options: { onProgress?: (p: { bytesWritten: number; totalBytes: number }) => void },
    ) {
      this.downloadAsync = jest.fn(async () => {
        options.onProgress?.({ bytesWritten: 2393231072, totalBytes: 2393231072 });
        return { uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() };
      });
      this.pauseAsync = jest.fn(async () => undefined);
      this.resumeAsync = jest.fn(async () => ({ uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() }));
      this.savable = jest.fn(() => ({ url, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' }));
      mockTaskInstances[url] = this;
    }),
  };
});

const model: CuratedModel = {
  id: 'fast-light',
  displayName: 'Fast & Light',
  tagline: 't',
  sizeLabel: '~2.3 GB',
  sizeBytes: 2393231072,
  hfUrl: 'https://huggingface.co/x/resolve/main/f.gguf',
  filename: 'f.gguf',
  llamaConfig: { contextSize: 4096 },
  deviceHint: 'all',
};

describe('modelDownloadService', () => {
  it('starts a download with the User-Agent header and reports progress', async () => {
    const onProgress = jest.fn();
    const file = await startDownload(model, { onProgress });
    expect(file?.size).toBe(2393231072);
    expect(onProgress).toHaveBeenCalledWith({ bytesWritten: 2393231072, totalBytes: 2393231072 });
    const ctorCall = jest.mocked(DownloadTask).mock.calls.at(-1)!;
    const options = ctorCall[2] as { headers?: Record<string, string> };
    expect(options.headers?.['User-Agent']).toMatch(/^CuratedJournal\//);
  });

  it('pauseDownload returns a savable pause state', async () => {
    await startDownload(model, {});
    const pauseState = await pauseDownload();
    expect(pauseState).toEqual({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' });
  });

  it('resumeDownload restores from saved state via DownloadTask.fromSavable', async () => {
    const fromSavable = jest.fn().mockReturnValue({
      resumeAsync: jest.fn(async () => ({ uri: 'file:///doc/test.gguf', exists: true, size: 2393231072, delete: jest.fn() })),
      pauseAsync: jest.fn(async () => undefined),
      savable: jest.fn(() => ({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false })),
    });
    (DownloadTask as unknown as { fromSavable: typeof fromSavable }).fromSavable = fromSavable;
    const file = await resumeDownload({ url: model.hfUrl, fileUri: 'file:///doc/test.gguf', isDirectory: false, resumeData: 'rd' }, {});
    expect(fromSavable).toHaveBeenCalled();
    expect(file?.size).toBe(2393231072);
  });

  it('verifyDownload passes when file.size matches manifest.sizeBytes', () => {
    const file = new File('file:///doc/f.gguf') as unknown as File;
    expect(verifyDownload(file, model)).toBe(true);
  });

  it('verifyDownload fails when sizes mismatch', () => {
    const file = { exists: true, size: 1 } as unknown as File;
    expect(verifyDownload(file, model)).toBe(false);
  });

  it('classifyDownloadError recognizes iOS disk-full', () => {
    expect(classifyDownloadError(new Error('NSFileWriteOutOfSpaceError'))).toBe('disk-full');
  });

  it('classifyDownloadError recognizes Android disk-full', () => {
    expect(classifyDownloadError(new Error('ENOSPC: no space left on device'))).toBe('disk-full');
  });

  it('classifyDownloadError defaults unknown errors to network', () => {
    expect(classifyDownloadError(new Error('fetch failed'))).toBe('network');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/modelDownloadService.test.ts`
Expected: FAIL with "Cannot find module '@/services/modelDownloadService'"

- [ ] **Step 3: Write the implementation**

```typescript
import { DownloadTask, File, Paths } from 'expo-file-system';
import type { CuratedModel } from '@/catalog/modelManifest';
import { buildUserAgent } from '@/lib/buildUserAgent';
import type { DownloadPauseStateRecord } from '@/services/modelDownloadState';

export type DownloadErrorCode = 'disk-full' | 'network';

export type DownloadCallbacks = {
  onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void;
};

let activeTask: DownloadTask | null = null;

export function classifyDownloadError(error: unknown): DownloadErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC|NSFileWriteOutOfSpaceError/.test(message)) return 'disk-full';
  return 'network';
}

export async function startDownload(model: CuratedModel, callbacks: DownloadCallbacks): Promise<File | null> {
  const dest = new File(Paths.document, model.filename);
  activeTask = new DownloadTask(model.hfUrl, dest, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress,
  });
  return activeTask.downloadAsync();
}

export async function pauseDownload(): Promise<DownloadPauseStateRecord> {
  if (!activeTask) throw new Error('No active download to pause');
  await activeTask.pauseAsync();
  return activeTask.savable();
}

export async function resumeDownload(
  pauseState: DownloadPauseStateRecord,
  callbacks: DownloadCallbacks,
): Promise<File | null> {
  activeTask = DownloadTask.fromSavable(pauseState, {
    headers: { 'User-Agent': buildUserAgent() },
    onProgress: callbacks.onProgress,
  });
  return activeTask.resumeAsync();
}

export function cancelActiveDownload(): void {
  activeTask?.cancel();
  activeTask = null;
}

export function verifyDownload(file: File, model: CuratedModel): boolean {
  return file.exists && file.size === model.sizeBytes;
}

export function deletePartialFile(filename: string): void {
  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/modelDownloadService.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/modelDownloadService.ts __tests__/modelDownloadService.test.ts
git commit -m "feat: add modelDownloadService wrapping DownloadTask"
```

---

### Task 8: `modelSmokeTest` — post-download/import verification

**Files:**
- Create: `src/lib/modelSmokeTest.ts`
- Test: `__tests__/modelSmokeTest.test.ts`

Per spec §4.9: run a short completion through `initLlama` with the manifest's `llamaConfig`; on success the model is good; on failure (load error/OOM) delete the file so the user isn't left with dead weight on disk.

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/modelSmokeTest.test.ts`
Expected: FAIL with "Cannot find module '@/lib/modelSmokeTest'"

- [ ] **Step 3: Write the implementation**

```typescript
import { Platform } from 'react-native';
import { initLlama } from 'llama.rn';
import { File } from 'expo-file-system';
import type { LlamaModelConfig } from '@/catalog/modelManifest';

export type SmokeTestResult = { ok: true } | { ok: false; error: Error };

export async function runModelSmokeTest(input: {
  modelPath: string;
  llamaConfig: LlamaModelConfig;
}): Promise<SmokeTestResult> {
  try {
    const ctx = await initLlama({
      model: input.modelPath,
      n_ctx: input.llamaConfig.contextSize,
      n_gpu_layers: input.llamaConfig.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0),
      use_mlock: input.llamaConfig.useMlock ?? true,
    });
    try {
      await ctx.completion(
        {
          messages: [
            { role: 'system', content: 'Reply with OK' },
            { role: 'user', content: 'Go' },
          ],
          n_predict: 10,
        },
        () => undefined,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      await ctx.release();
    }
  } catch (error) {
    const file = new File(input.modelPath);
    if (file.exists) file.delete();
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/modelSmokeTest.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/modelSmokeTest.ts __tests__/modelSmokeTest.test.ts
git commit -m "feat: add post-download smoke test"
```

---

### Task 9: Add `useMlock` option to `createLlamaProvider`

**Files:**
- Modify: `src/lib/llamaProvider.ts`
- Create: `__tests__/llamaProvider.test.ts` (none exists yet)

Deep Thinker's manifest entry sets `useMlock: false` (spec §4.3, floor-device safety). `createLlamaProvider` currently hardcodes `use_mlock: true` — it must honor the manifest.

- [ ] **Step 1: Write the failing test**

```typescript
import { initLlama } from 'llama.rn';
import { createLlamaProvider } from '@/lib/llamaProvider';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

describe('createLlamaProvider', () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/llamaProvider.test.ts`
Expected: FAIL — first test fails because `use_mlock` is always `true` regardless of input (second test passes already, first doesn't).

- [ ] **Step 3: Modify the implementation**

In `src/lib/llamaProvider.ts`, change the `createLlamaProvider` signature and body:

```typescript
export function createLlamaProvider(config: {
  modelPath: string;
  contextSize?: number;
  nGpuLayers?: number;
  useMlock?: boolean;
}): LLMProvider {
  const contextSize = config.contextSize ?? 4096;
  const nGpuLayers = config.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0);
  const useMlock = config.useMlock ?? true;

  async function ensureContext(): Promise<LlamaContext> {
    if (sharedContext) return sharedContext;
    sharedContext = await initLlama({
      model: config.modelPath,
      n_ctx: contextSize,
      n_gpu_layers: nGpuLayers,
      use_mlock: useMlock,
    });
    return sharedContext;
  }
```

(Only the function signature gains `useMlock?: boolean`, a new `const useMlock = config.useMlock ?? true;` line, and `use_mlock: useMlock` replaces the hardcoded `use_mlock: true` inside `ensureContext`. Everything else in the file — `AppState` listener, `releaseContext`, `generateText` — is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/llamaProvider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/llamaProvider.ts __tests__/llamaProvider.test.ts
git commit -m "feat: honor manifest useMlock in createLlamaProvider"
```

---

### Task 10: `modelHubMachine` (XState v5)

**Files:**
- Create: `src/machines/modelHubMachine.ts`
- Test: `__tests__/modelHubMachine.test.ts`

**Design decision (deviates from `journalWikiMachine`'s pure `fromPromise` actors):** the `downloading` state needs to stream repeated progress events to the parent while a single `downloadAsync()`/`resumeAsync()` promise is in flight — `fromPromise` only reports one final result. This task uses `fromCallback` for the download actor, which gets `sendBack` to dispatch events to the parent machine as many times as needed. All other actors (`checkNetworkActor`, `pauseTask`, `verifyTask`, `smokeTestTask`) follow the existing `fromPromise` convention exactly as in `journalWikiMachine.ts`.

**Design decision (I/O injection):** like `journalWikiMachine`'s `MaintenanceApi`, every side-effecting function (network check, download, pause, verify, smoke test, persistence) is grouped into one `ModelHubApi` object passed via machine `input`, then carried in `context.api`. The machine file itself never imports `expo-file-system`, `expo-network`, `expo-sqlite`, or `llama.rn` — that keeps the machine pure and the test file mock-free (plain `jest.fn()` stubs only). Task 11 (`useModelHub.tsx`) is the only place that assembles the real `ModelHubApi` from the modules built in Tasks 2–9.

- [ ] **Step 1: Write the failing test**

```typescript
import { createActor, waitFor } from 'xstate';
import { modelHubMachine, type ModelHubApi } from '@/machines/modelHubMachine';
import type { CuratedModel } from '@/catalog/modelManifest';

const fastLight: CuratedModel = {
  id: 'fast-light',
  displayName: 'Fast & Light',
  tagline: 't',
  sizeLabel: '~2.3 GB',
  sizeBytes: 2393231072,
  hfUrl: 'https://huggingface.co/x/resolve/main/f.gguf',
  filename: 'f.gguf',
  llamaConfig: { contextSize: 4096 },
  deviceHint: 'all',
};

function makeApi(overrides: Partial<ModelHubApi> = {}): ModelHubApi {
  return {
    checkNetwork: jest.fn(async () => 'wifi' as const),
    startDownload: jest.fn(async () => true),
    resumeDownload: jest.fn(async () => true),
    pauseDownload: jest.fn(async () => ({ url: fastLight.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' })),
    verifyDownload: jest.fn(() => true),
    deletePartialFile: jest.fn(),
    runSmokeTest: jest.fn(async () => ({ ok: true })),
    persistDownloadState: jest.fn(async () => undefined),
    clearDownloadState: jest.fn(async () => undefined),
    setModelPath: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('modelHubMachine', () => {
  it('happy path: select -> wifi -> download -> verify -> smoke -> complete', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.setModelPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'fast-light' }));
    expect(api.clearDownloadState).toHaveBeenCalled();
    actor.stop();
  });

  it('routes to cellularConfirm on cellular and proceeds only after CELLULAR_CONFIRM', async () => {
    const api = makeApi({ checkNetwork: jest.fn(async () => 'cellular' as const) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('cellularConfirm'), { timeout: 3000 });
    actor.send({ type: 'CELLULAR_CONFIRM' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('routes to awaitingWifi when offline, and re-checks on CHECK_NETWORK', async () => {
    const checkNetwork = jest
      .fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValueOnce('wifi');
    const api = makeApi({ checkNetwork });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('awaitingWifi'), { timeout: 3000 });
    actor.send({ type: 'CHECK_NETWORK' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('tracks DOWNLOAD_PROGRESS events while downloading', async () => {
    let progressCb: ((p: { bytesWritten: number; totalBytes: number }) => void) | undefined;
    const api = makeApi({
      startDownload: jest.fn(async (_model, onProgress) => {
        progressCb = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, () => progressCb !== undefined, { timeout: 3000 });
    progressCb!({ bytesWritten: 100, totalBytes: 200 });
    await waitFor(actor, (s) => s.context.progress.bytesWritten === 100, { timeout: 3000 });
    actor.stop();
  });

  it('manual PAUSE then RESUME preserves pauseState and resumes the same download', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused') && s.context.pauseState !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('user');
    actor.send({ type: 'RESUME' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    expect(api.resumeDownload).toHaveBeenCalledWith(
      expect.objectContaining({ resumeData: 'rd' }),
      expect.any(Function),
    );
    actor.stop();
  });

  it('APP_BACKGROUND pauses and APP_FOREGROUND auto-resumes (background reason)', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'APP_BACKGROUND' });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    expect(actor.getSnapshot().context.pausedReason).toBe('background');
    actor.send({ type: 'APP_FOREGROUND' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.stop();
  });

  it('APP_FOREGROUND does NOT auto-resume a manually-paused download', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => new Promise<boolean>(() => undefined)),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('downloading'), { timeout: 3000 });
    actor.send({ type: 'PAUSE' });
    await waitFor(actor, (s) => s.matches('paused'), { timeout: 3000 });
    actor.send({ type: 'APP_FOREGROUND' });
    expect(actor.getSnapshot().matches('paused')).toBe(true);
    actor.stop();
  });

  it('byte mismatch on verify deletes the partial file and goes to failed', async () => {
    const api = makeApi({ verifyDownload: jest.fn(() => false) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(api.deletePartialFile).toHaveBeenCalledWith('f.gguf');
    expect(actor.getSnapshot().context.error?.code).toBe('verify');
    actor.stop();
  });

  it('smoke test failure returns to selecting with a smoke error', async () => {
    const api = makeApi({ runSmokeTest: jest.fn(async () => ({ ok: false })) });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('smoke');
    actor.stop();
  });

  it('disk-full failure routes RETRY back to selecting (not downloading)', async () => {
    const api = makeApi({
      startDownload: jest.fn(async () => {
        throw new Error('NSFileWriteOutOfSpaceError');
      }),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('disk-full');
    actor.send({ type: 'RETRY' });
    await waitFor(actor, (s) => s.matches('selecting'), { timeout: 3000 });
    actor.stop();
  });

  it('network failure routes RETRY back to downloading (resumable)', async () => {
    let attempt = 0;
    const api = makeApi({
      startDownload: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('fetch failed');
        return true;
      }),
      pauseDownload: jest.fn(async () => ({ url: fastLight.hfUrl, fileUri: 'file:///f.gguf', isDirectory: false, resumeData: 'rd' })),
    });
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('failed'), { timeout: 3000 });
    expect(actor.getSnapshot().context.error?.code).toBe('network');
    actor.send({ type: 'RETRY' });
    await waitFor(actor, (s) => s.matches('selecting') || s.matches('downloading') || s.matches('complete'), { timeout: 3000 });
    actor.stop();
  });

  it('IMPORT_CUSTOM exits to customImport and IMPORT_SMOKE_OK completes onboarding', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    expect(actor.getSnapshot().matches('customImport')).toBe(true);
    actor.send({ type: 'IMPORT_SMOKE_OK' });
    expect(actor.getSnapshot().matches('complete')).toBe(true);
    actor.stop();
  });

  it('IMPORT_FAILED returns to selecting with an error message', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_FAILED', message: 'Could not load this file.' });
    expect(actor.getSnapshot().matches('selecting')).toBe(true);
    expect(actor.getSnapshot().context.error?.message).toBe('Could not load this file.');
    actor.stop();
  });

  it('SET_DISPLAY_NAME works from any state and does not block progress', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'SET_DISPLAY_NAME', displayName: 'My Journal' });
    expect(actor.getSnapshot().context.displayName).toBe('My Journal');
    actor.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/modelHubMachine.test.ts`
Expected: FAIL with "Cannot find module '@/machines/modelHubMachine'"

- [ ] **Step 3: Write the implementation**

```typescript
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import { getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import type { NetworkGateState } from '@/lib/networkGate';
import type { DownloadPauseStateRecord, ModelDownloadStatus } from '@/services/modelDownloadState';

export type ModelHubMachineEvents =
  | { type: 'SELECT_MODEL'; modelId: CuratedModelId }
  | { type: 'IMPORT_CUSTOM' }
  | { type: 'CHECK_NETWORK' }
  | { type: 'CELLULAR_CONFIRM' }
  | { type: 'CELLULAR_CANCEL' }
  | { type: 'DOWNLOAD_PROGRESS'; bytesWritten: number; totalBytes: number }
  | { type: 'DOWNLOAD_COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'APP_BACKGROUND' }
  | { type: 'APP_FOREGROUND' }
  | { type: 'FAIL'; code: 'network' | 'disk-full'; message: string }
  | { type: 'RETRY' }
  | { type: 'IMPORT_SMOKE_OK' }
  | { type: 'IMPORT_FAILED'; message: string }
  | { type: 'SET_DISPLAY_NAME'; displayName: string };

export type ModelHubApi = {
  checkNetwork: () => Promise<NetworkGateState>;
  startDownload: (
    model: CuratedModel,
    onProgress: (p: { bytesWritten: number; totalBytes: number }) => void,
  ) => Promise<boolean>;
  resumeDownload: (
    pauseState: DownloadPauseStateRecord,
    onProgress: (p: { bytesWritten: number; totalBytes: number }) => void,
  ) => Promise<boolean>;
  pauseDownload: () => Promise<DownloadPauseStateRecord>;
  verifyDownload: (model: CuratedModel) => boolean;
  deletePartialFile: (filename: string) => void;
  runSmokeTest: (model: CuratedModel) => Promise<{ ok: boolean }>;
  persistDownloadState: (record: {
    modelId: CuratedModelId | null;
    status: ModelDownloadStatus;
    pauseState: DownloadPauseStateRecord | null;
  }) => Promise<void>;
  clearDownloadState: () => Promise<void>;
  setModelPath: (model: CuratedModel) => Promise<void>;
};

export type ModelHubMachineInput = { api: ModelHubApi };

type ErrorCode = 'network' | 'disk-full' | 'verify' | 'smoke';

type Context = {
  api: ModelHubApi;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: ErrorCode; message: string } | null;
  pauseState: DownloadPauseStateRecord | null;
  pausedReason: 'user' | 'background' | null;
  displayName: string | null;
};

export const modelHubMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ModelHubMachineEvents,
    input: {} as ModelHubMachineInput,
  },
  actors: {
    checkNetworkActor: fromPromise(async ({ input }: { input: { api: ModelHubApi } }) =>
      input.api.checkNetwork(),
    ),
    runDownload: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: ModelHubMachineEvents) => void;
        input: { api: ModelHubApi; model: CuratedModel; pauseState: DownloadPauseStateRecord | null };
      }) => {
        let cancelled = false;
        const onProgress = (p: { bytesWritten: number; totalBytes: number }) => {
          if (!cancelled) {
            sendBack({ type: 'DOWNLOAD_PROGRESS', bytesWritten: p.bytesWritten, totalBytes: p.totalBytes });
          }
        };
        (async () => {
          try {
            const completed = input.pauseState
              ? await input.api.resumeDownload(input.pauseState, onProgress)
              : await input.api.startDownload(input.model, onProgress);
            if (!cancelled && completed) sendBack({ type: 'DOWNLOAD_COMPLETE' });
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error);
              const code: 'network' | 'disk-full' = /ENOSPC|NSFileWriteOutOfSpaceError/.test(message)
                ? 'disk-full'
                : 'network';
              sendBack({ type: 'FAIL', code, message });
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      },
    ),
    pauseTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; modelId: CuratedModelId | null } }) => {
        const pauseState = await input.api.pauseDownload();
        await input.api.persistDownloadState({ modelId: input.modelId, status: 'paused', pauseState });
        return pauseState;
      },
    ),
    verifyTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) =>
        input.api.verifyDownload(input.model),
    ),
    smokeTestTask: fromPromise(
      async ({ input }: { input: { api: ModelHubApi; model: CuratedModel } }) =>
        input.api.runSmokeTest(input.model),
    ),
  },
}).createMachine({
  id: 'modelHub',
  initial: 'selecting',
  context: ({ input }) => ({
    api: input.api,
    modelId: null,
    progress: { bytesWritten: 0, totalBytes: -1 },
    error: null,
    pauseState: null,
    pausedReason: null,
    displayName: null,
  }),
  on: {
    SET_DISPLAY_NAME: { actions: assign({ displayName: ({ event }) => event.displayName }) },
  },
  states: {
    selecting: {
      on: {
        SELECT_MODEL: {
          target: 'confirmingNetwork',
          actions: assign({
            modelId: ({ event }) => event.modelId,
            error: null,
            pauseState: null,
            pausedReason: null,
          }),
        },
        IMPORT_CUSTOM: { target: 'customImport' },
      },
    },
    confirmingNetwork: {
      invoke: {
        src: 'checkNetworkActor',
        input: ({ context }) => ({ api: context.api }),
        onDone: [
          { guard: ({ event }) => event.output === 'wifi', target: 'downloading' },
          { guard: ({ event }) => event.output === 'cellular', target: 'cellularConfirm' },
          { target: 'awaitingWifi' },
        ],
      },
    },
    awaitingWifi: {
      on: { CHECK_NETWORK: { target: 'confirmingNetwork' } },
    },
    cellularConfirm: {
      on: {
        CELLULAR_CONFIRM: { target: 'downloading' },
        CELLULAR_CANCEL: { target: 'selecting' },
      },
    },
    downloading: {
      entry: [
        assign({ pausedReason: null }),
        ({ context }) => {
          void context.api.persistDownloadState({
            modelId: context.modelId,
            status: 'downloading',
            pauseState: null,
          });
        },
      ],
      invoke: {
        src: 'runDownload',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
          pauseState: context.pauseState,
        }),
      },
      on: {
        DOWNLOAD_PROGRESS: {
          actions: assign({
            progress: ({ event }) => ({ bytesWritten: event.bytesWritten, totalBytes: event.totalBytes }),
          }),
        },
        DOWNLOAD_COMPLETE: { target: 'verifying' },
        PAUSE: { target: 'paused', actions: assign({ pausedReason: 'user' }) },
        APP_BACKGROUND: { target: 'paused', actions: assign({ pausedReason: 'background' }) },
        FAIL: {
          target: 'failed',
          actions: assign({ error: ({ event }) => ({ code: event.code, message: event.message }) }),
        },
      },
    },
    paused: {
      invoke: {
        src: 'pauseTask',
        input: ({ context }) => ({ api: context.api, modelId: context.modelId }),
        onDone: { actions: assign({ pauseState: ({ event }) => event.output }) },
      },
      on: {
        RESUME: { target: 'downloading' },
        APP_FOREGROUND: {
          guard: ({ context }) => context.pausedReason === 'background',
          target: 'downloading',
        },
      },
    },
    verifying: {
      invoke: {
        src: 'verifyTask',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
        }),
        onDone: [
          { guard: ({ event }) => event.output === true, target: 'smokeTest' },
          {
            target: 'failed',
            actions: [
              ({ context }) =>
                context.api.deletePartialFile(getCuratedModel(context.modelId as CuratedModelId).filename),
              assign({
                error: {
                  code: 'verify' as const,
                  message: 'Downloaded file size did not match the expected size.',
                },
              }),
            ],
          },
        ],
      },
    },
    smokeTest: {
      invoke: {
        src: 'smokeTestTask',
        input: ({ context }) => ({
          api: context.api,
          model: getCuratedModel(context.modelId as CuratedModelId),
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.ok === true,
            target: 'complete',
            actions: ({ context }) => {
              void context.api.setModelPath(getCuratedModel(context.modelId as CuratedModelId));
              void context.api.clearDownloadState();
            },
          },
          {
            target: 'selecting',
            actions: assign({
              error: {
                code: 'smoke' as const,
                message: 'This model could not run on your device. Try Fast & Light or import a custom model.',
              },
            }),
          },
        ],
      },
    },
    complete: { type: 'final' },
    customImport: {
      on: {
        IMPORT_SMOKE_OK: { target: 'complete' },
        IMPORT_FAILED: {
          target: 'selecting',
          actions: assign({ error: ({ event }) => ({ code: 'smoke' as const, message: event.message }) }),
        },
      },
    },
    failed: {
      entry: ({ context }) => {
        void context.api.persistDownloadState({
          modelId: context.modelId,
          status: 'failed',
          pauseState: context.pauseState,
        });
      },
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.error?.code === 'disk-full',
            target: 'selecting',
            actions: assign({ modelId: null, pauseState: null, error: null }),
          },
          { guard: ({ context }) => context.pauseState !== null, target: 'downloading' },
          { target: 'selecting' },
        ],
      },
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/modelHubMachine.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add src/machines/modelHubMachine.ts __tests__/modelHubMachine.test.ts
git commit -m "feat: add modelHubMachine driving the onboarding flow"
```

---

### Task 11: `useModelHub` provider — assemble the real `ModelHubApi`, wire `AppState`

**Files:**
- Create: `src/hooks/useModelHub.tsx`
- Test: `__tests__/useModelHub.test.ts`

This mirrors `useJournalWiki.tsx`: a React context wraps `createActor(modelHubMachine, { input: { api } })`, exposes `send` + selected context fields via `useSelector`. The exported `createModelHubApi(store)` factory is the one place that wires the real service modules from Tasks 5, 7, 8, and entity storage into the `ModelHubApi` shape the machine expects (Task 10's `ModelHubApi` type). The provider itself also subscribes to `AppState` and forwards `APP_BACKGROUND`/`APP_FOREGROUND`, exactly like the existing `AppState.addEventListener('change', ...)` call in `src/lib/llamaProvider.ts`.

- [ ] **Step 1: Write the failing test for `createModelHubApi`**

```typescript
import { File, Paths } from 'expo-file-system';
import { createModelHubApi } from '@/hooks/useModelHub';
import * as networkGate from '@/lib/networkGate';
import * as downloadService from '@/services/modelDownloadService';
import * as smokeTest from '@/lib/modelSmokeTest';
import * as entityStorage from '@/lib/entityStorage';
import type { CuratedModel } from '@/catalog/modelManifest';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((..._args: unknown[]) => ({ exists: true, size: 2393231072, delete: jest.fn() })),
  Paths: { document: 'file:///doc' },
}));
jest.mock('@/lib/networkGate');
jest.mock('@/services/modelDownloadService');
jest.mock('@/lib/modelSmokeTest');
jest.mock('@/lib/entityStorage');

const model: CuratedModel = {
  id: 'fast-light',
  displayName: 'Fast & Light',
  tagline: 't',
  sizeLabel: '~2.3 GB',
  sizeBytes: 2393231072,
  hfUrl: 'https://huggingface.co/x/resolve/main/f.gguf',
  filename: 'f.gguf',
  llamaConfig: { contextSize: 4096 },
  deviceHint: 'all',
};

function makeStore() {
  return {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  };
}

describe('createModelHubApi', () => {
  it('checkNetwork delegates to networkGate.checkNetworkGate', async () => {
    jest.mocked(networkGate.checkNetworkGate).mockResolvedValueOnce('wifi');
    const api = createModelHubApi(makeStore() as never);
    await expect(api.checkNetwork()).resolves.toBe('wifi');
  });

  it('startDownload returns true when the service resolves a File, false when it resolves null', async () => {
    const api = createModelHubApi(makeStore() as never);
    jest.mocked(downloadService.startDownload).mockResolvedValueOnce({ size: 1 } as unknown as File);
    await expect(api.startDownload(model, jest.fn())).resolves.toBe(true);
    jest.mocked(downloadService.startDownload).mockResolvedValueOnce(null);
    await expect(api.startDownload(model, jest.fn())).resolves.toBe(false);
  });

  it('verifyDownload constructs a File from Paths.document + filename and delegates', () => {
    jest.mocked(downloadService.verifyDownload).mockReturnValueOnce(true);
    const api = createModelHubApi(makeStore() as never);
    expect(api.verifyDownload(model)).toBe(true);
    expect(File).toHaveBeenCalledWith(Paths.document, 'f.gguf');
  });

  it('runSmokeTest builds modelPath from Paths.document + filename', async () => {
    jest.mocked(smokeTest.runModelSmokeTest).mockResolvedValueOnce({ ok: true });
    const api = createModelHubApi(makeStore() as never);
    const result = await api.runSmokeTest(model);
    expect(result).toEqual({ ok: true });
    expect(smokeTest.runModelSmokeTest).toHaveBeenCalledWith(
      expect.objectContaining({ llamaConfig: model.llamaConfig }),
    );
  });

  it('setModelPath persists both the file uri and the model id', async () => {
    const api = createModelHubApi(makeStore() as never);
    await api.setModelPath(model);
    expect(entityStorage.setModelPath).toHaveBeenCalled();
    expect(entityStorage.setModelId).toHaveBeenCalledWith('fast-light');
  });

  it('persistDownloadState and clearDownloadState delegate to the injected store', async () => {
    const store = makeStore();
    const api = createModelHubApi(store as never);
    await api.persistDownloadState({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    expect(store.set).toHaveBeenCalledWith({ modelId: 'fast-light', status: 'downloading', pauseState: null });
    await api.clearDownloadState();
    expect(store.clear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/useModelHub.test.ts`
Expected: FAIL with "Cannot find module '@/hooks/useModelHub'"

- [ ] **Step 3: Write the implementation**

```typescript
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { createActor } from 'xstate';
import { useSelector } from '@xstate/react';
import {
  modelHubMachine,
  type ModelHubApi,
  type ModelHubMachineEvents,
} from '@/machines/modelHubMachine';
import { checkNetworkGate } from '@/lib/networkGate';
import {
  startDownload,
  resumeDownload,
  pauseDownload,
  verifyDownload,
  deletePartialFile,
} from '@/services/modelDownloadService';
import { runModelSmokeTest } from '@/lib/modelSmokeTest';
import type { createModelDownloadStateStore } from '@/services/modelDownloadState';
import { setModelPath, setModelId } from '@/lib/entityStorage';
import type { CuratedModelId } from '@/catalog/modelManifest';

type Store = ReturnType<typeof createModelDownloadStateStore>;

export function createModelHubApi(store: Store): ModelHubApi {
  return {
    checkNetwork: () => checkNetworkGate(),
    startDownload: async (model, onProgress) => {
      const file = await startDownload(model, { onProgress });
      return file !== null;
    },
    resumeDownload: async (pauseState, onProgress) => {
      const file = await resumeDownload(pauseState, { onProgress });
      return file !== null;
    },
    pauseDownload: () => pauseDownload(),
    verifyDownload: (model) => {
      const file = new File(Paths.document, model.filename);
      return verifyDownload(file, model);
    },
    deletePartialFile: (filename) => deletePartialFile(filename),
    runSmokeTest: (model) => {
      const file = new File(Paths.document, model.filename);
      return runModelSmokeTest({ modelPath: file.uri, llamaConfig: model.llamaConfig });
    },
    persistDownloadState: (record) => store.set(record as { modelId: CuratedModelId; status: typeof record.status; pauseState: typeof record.pauseState }),
    clearDownloadState: () => store.clear(),
    setModelPath: async (model) => {
      const file = new File(Paths.document, model.filename);
      await setModelPath(file.uri);
      await setModelId(model.id);
    },
  };
}

type ModelHubContextValue = {
  send: (event: ModelHubMachineEvents) => void;
  stateValue: string;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: string; message: string } | null;
  pausedReason: 'user' | 'background' | null;
  displayName: string | null;
};

const ModelHubContext = createContext<ModelHubContextValue | null>(null);

export function ModelHubProvider({ api, children }: { api: ModelHubApi; children: ReactNode }) {
  const actor = useMemo(() => createActor(modelHubMachine, { input: { api } }).start(), [api]);

  useEffect(() => {
    return () => {
      actor.stop();
    };
  }, [actor]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        actor.send({ type: 'APP_BACKGROUND' });
      } else if (nextState === 'active') {
        actor.send({ type: 'APP_FOREGROUND' });
      }
    });
    return () => subscription.remove();
  }, [actor]);

  const send = (event: ModelHubMachineEvents) => actor.send(event);
  const stateValue = useSelector(actor, (s) => s.value as string);
  const modelId = useSelector(actor, (s) => s.context.modelId);
  const progress = useSelector(actor, (s) => s.context.progress);
  const error = useSelector(actor, (s) => s.context.error);
  const pausedReason = useSelector(actor, (s) => s.context.pausedReason);
  const displayName = useSelector(actor, (s) => s.context.displayName);

  const value: ModelHubContextValue = {
    send,
    stateValue,
    modelId,
    progress,
    error,
    pausedReason,
    displayName,
  };

  return <ModelHubContext.Provider value={value}>{children}</ModelHubContext.Provider>;
}

export function useModelHub(): ModelHubContextValue {
  const ctx = useContext(ModelHubContext);
  if (!ctx) throw new Error('useModelHub requires ModelHubProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/useModelHub.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModelHub.tsx __tests__/useModelHub.test.ts
git commit -m "feat: add useModelHub provider wiring AppState and real services"
```

---

### Task 12: `ModelHubStack` layout — open SQLite, assemble the API, wrap screens

**Files:**
- Create: `src/app/model-hub/_layout.tsx`

No precedent in this codebase for testing Expo Router layout/screen files (`settings.tsx`, `import.tsx`, `NightShiftScreen.tsx` all ship without test files — only services, storage, and machines are unit tested per the existing `__tests__/` directory). This task follows that convention: implementation only, verified manually in Task 18.

This file mirrors the loading-spinner-then-render pattern already used in `src/app/_layout.tsx` (`useState` + `useEffect` async init, `ActivityIndicator` while pending) and resumes a paused/downloading state if `model_download_state` says so (Bootstrap & Navigation, spec §4.6) by redirecting straight to the download screen.

- [ ] **Step 1: Write the layout**

```typescript
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { createModelDownloadStateStore } from '@/services/modelDownloadState';
import { createModelHubApi, ModelHubProvider } from '@/hooks/useModelHub';
import type { ModelHubApi } from '@/machines/modelHubMachine';

export default function ModelHubStackLayout() {
  const router = useRouter();
  const [api, setApi] = useState<ModelHubApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await SQLite.openDatabaseAsync('curated_journal.db');
      const store = createModelDownloadStateStore(db);
      const downloadState = await store.get();
      if (cancelled) return;
      setApi(createModelHubApi(store));
      if (downloadState && (downloadState.status === 'downloading' || downloadState.status === 'paused')) {
        router.replace('/model-hub/download');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!api) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ModelHubProvider api={api}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="download" />
        <Stack.Screen name="import" options={{ presentation: 'modal', headerShown: true, title: 'Import custom model' }} />
      </Stack>
    </ModelHubProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/model-hub/_layout.tsx
git commit -m "feat: add ModelHubStack layout with resume detection"
```

---

### Task 13: "Choose Your AI" screen

**Files:**
- Create: `src/app/model-hub/index.tsx`

No screen-test precedent in this codebase (see Task 12) — implementation only, verified manually in Task 18.

Network confirmation happens inline on this screen, before navigating anywhere: tapping a card sends `SELECT_MODEL`, the machine's `confirmingNetwork` state auto-checks and lands on `cellularConfirm` (→ native `Alert.alert` two-step per spec §4.7/§7.3), `awaitingWifi` (→ inline blocked banner with retry), or `downloading` (→ push to `/model-hub/download`).

- [ ] **Step 1: Write the screen**

```typescript
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { MODEL_CATALOG, type CuratedModel } from '@/catalog/modelManifest';
import { useModelHub } from '@/hooks/useModelHub';

export default function ModelHubIndexScreen() {
  const router = useRouter();
  const { send, stateValue, error } = useModelHub();
  const [warningFor, setWarningFor] = useState<CuratedModel | null>(null);

  useEffect(() => {
    if (stateValue === 'downloading') {
      router.push('/model-hub/download');
      return;
    }
    if (stateValue === 'cellularConfirm') {
      Alert.alert(
        'Download over cellular',
        'This model is a large file and may use a significant amount of cellular data.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => send({ type: 'CELLULAR_CANCEL' }) },
          { text: 'Download over cellular', onPress: () => send({ type: 'CELLULAR_CONFIRM' }) },
        ],
      );
    }
  }, [stateValue, router, send]);

  const selectModel = (model: CuratedModel) => {
    if (model.deviceWarning) {
      setWarningFor(model);
      return;
    }
    send({ type: 'SELECT_MODEL', modelId: model.id });
  };

  const confirmWarning = () => {
    if (!warningFor) return;
    send({ type: 'SELECT_MODEL', modelId: warningFor.id });
    setWarningFor(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Choose Your AI</ThemedText>
      <ThemedText type="small">
        Your journal stays fully offline. Pick a model to download once — everything after that runs
        on your device.
      </ThemedText>
      {error && <ThemedText themeColor="textSecondary">{error.message}</ThemedText>}
      {stateValue === 'awaitingWifi' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Connect to Wi-Fi to continue</ThemedText>
          <Pressable onPress={() => send({ type: 'CHECK_NETWORK' })}>
            <ThemedText type="link">Try again</ThemedText>
          </Pressable>
        </ThemedView>
      )}
      {MODEL_CATALOG.map((model) => (
        <Pressable key={model.id} onPress={() => selectModel(model)}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">{model.displayName}</ThemedText>
            <ThemedText type="small">{model.tagline}</ThemedText>
            <ThemedText type="smallBold">{model.sizeLabel}</ThemedText>
            {model.deviceHint === 'recommended-high-ram' && (
              <ThemedText type="small" themeColor="textSecondary">
                Recommended for newer devices
              </ThemedText>
            )}
          </ThemedView>
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          send({ type: 'IMPORT_CUSTOM' });
          router.push('/model-hub/import');
        }}>
        <ThemedText type="linkPrimary">Import custom .gguf</ThemedText>
      </Pressable>
      {warningFor && (
        <View style={styles.sheet}>
          <ThemedText type="small">{warningFor.deviceWarning}</ThemedText>
          <Pressable onPress={confirmWarning}>
            <ThemedText type="link">Continue</ThemedText>
          </Pressable>
          <Pressable onPress={() => setWarningFor(null)}>
            <ThemedText type="link">Cancel</ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  sheet: { borderRadius: Spacing.three, padding: Spacing.four, gap: Spacing.two },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/model-hub/index.tsx
git commit -m "feat: add Choose Your AI screen"
```

---

### Task 14: `ModelHubCompletionContext` + Download progress screen

**Files:**
- Create: `src/contexts/ModelHubCompletionContext.tsx`
- Create: `src/app/model-hub/download.tsx`

**Why a completion context is needed:** `RootLayout` (Task 16) only runs its wiki-bootstrap effect once on mount; navigating between nested `/model-hub/*` routes doesn't re-trigger it. Once `modelHubMachine` reaches `complete`, this screen must tell `RootLayout` "re-check `getModelPath()` and bootstrap now" — not just navigate. This context (same trivial pass-through shape as `src/contexts/LlmContext.tsx`) carries that callback down from `RootLayout` to wherever onboarding finishes (this screen and `import.tsx`, Task 15).

- [ ] **Step 1: Write the context**

```typescript
import { createContext, useContext, type ReactNode } from 'react';

type CompletionFn = () => Promise<void>;

const ModelHubCompletionContext = createContext<CompletionFn | null>(null);

export function ModelHubCompletionProvider({
  onComplete,
  children,
}: {
  onComplete: CompletionFn;
  children: ReactNode;
}) {
  return <ModelHubCompletionContext.Provider value={onComplete}>{children}</ModelHubCompletionContext.Provider>;
}

export function useModelHubCompletion(): CompletionFn {
  const ctx = useContext(ModelHubCompletionContext);
  if (!ctx) throw new Error('useModelHubCompletion requires ModelHubCompletionProvider');
  return ctx;
}
```

- [ ] **Step 2: Write the download screen**

No screen-test precedent in this codebase (see Task 12) — implementation only, verified manually in Task 18.

```typescript
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useModelHub } from '@/hooks/useModelHub';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';

const TIPS = [
  'Night Shift runs the librarian pass while your device is charging.',
  'The emergent graph invents its own types as it learns about your notes during maintenance.',
  'Export an OKF backup any time from Settings — your notes are always portable.',
];

const ERROR_COPY: Record<string, string> = {
  'disk-full': 'Not enough storage space. Please free up at least 3GB and try again.',
  network: 'Download failed. Check your connection and try again.',
};

function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const mins = Math.round(seconds / 60);
  return mins <= 1 ? '~1 min remaining' : `~${mins} mins remaining`;
}

export default function ModelHubDownloadScreen() {
  const router = useRouter();
  const { send, stateValue, progress, error, pausedReason, displayName } = useModelHub();
  const completeOnboarding = useModelHubCompletion();
  const [name, setName] = useState(displayName ?? '');
  const [tipIndex, setTipIndex] = useState(0);
  const samples = useRef<{ t: number; bytes: number }[]>([]);

  useEffect(() => {
    void activateKeepAwakeAsync('model-download');
    return () => deactivateKeepAwake('model-download');
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    samples.current.push({ t: Date.now(), bytes: progress.bytesWritten });
    if (samples.current.length > 5) samples.current.shift();
  }, [progress.bytesWritten]);

  useEffect(() => {
    if (stateValue === 'complete') {
      void completeOnboarding().then(() => router.replace('/'));
    }
  }, [stateValue, completeOnboarding, router]);

  const oldest = samples.current[0];
  const newest = samples.current.at(-1);
  const elapsedSeconds = oldest && newest ? (newest.t - oldest.t) / 1000 : 0;
  const bytesDelta = oldest && newest ? newest.bytes - oldest.bytes : 0;
  const speedBps = elapsedSeconds > 0 ? bytesDelta / elapsedSeconds : 0;
  const remainingBytes = progress.totalBytes - progress.bytesWritten;
  const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : -1;
  const pct = progress.totalBytes > 0 ? Math.min(100, (progress.bytesWritten / progress.totalBytes) * 100) : null;

  return (
    <View style={styles.container}>
      <ThemedText type="title">Downloading your AI</ThemedText>
      <ThemedText type="small">Keep this screen open for the fastest download.</ThemedText>

      {pct === null ? (
        <ThemedText type="small">Starting download…</ThemedText>
      ) : (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      )}

      {speedBps > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {formatSpeed(speedBps)} — {formatEta(etaSeconds)}
        </ThemedText>
      )}

      {stateValue === 'downloading' && (
        <Pressable onPress={() => send({ type: 'PAUSE' })}>
          <ThemedText type="link">Pause</ThemedText>
        </Pressable>
      )}
      {stateValue === 'paused' && (
        <View style={styles.row}>
          <ThemedText type="small">{pausedReason === 'background' ? 'Paused (resuming…)' : 'Paused'}</ThemedText>
          <Pressable onPress={() => send({ type: 'RESUME' })}>
            <ThemedText type="link">Resume</ThemedText>
          </Pressable>
        </View>
      )}
      {stateValue === 'failed' && error && (
        <View style={styles.row}>
          <ThemedText type="small">{ERROR_COPY[error.code] ?? error.message}</ThemedText>
          <Pressable onPress={() => send({ type: 'RETRY' })}>
            <ThemedText type="link">Retry</ThemedText>
          </Pressable>
        </View>
      )}

      <Animated.View key={tipIndex} entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)}>
        <ThemedView type="backgroundElement" style={styles.tip}>
          <ThemedText type="small">{TIPS[tipIndex]}</ThemedText>
        </ThemedView>
      </Animated.View>

      <TextInput
        placeholder="Name your journal (optional)"
        value={name}
        onChangeText={setName}
        onBlur={() => name.trim() && send({ type: 'SET_DISPLAY_NAME', displayName: name.trim() })}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#3338', overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#3c87f7' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tip: { borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 1, borderColor: '#8888', borderRadius: Spacing.two, padding: Spacing.two },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/ModelHubCompletionContext.tsx src/app/model-hub/download.tsx
git commit -m "feat: add Model Hub download progress screen"
```

---

### Task 15: Custom `.gguf` import screen

**Files:**
- Create: `src/app/model-hub/import.tsx`

Distinct from the existing `src/app/import.tsx` (OKF zip import, unrelated). This screen reuses the doc-picker + copy logic already in `src/app/(tabs)/settings.tsx`'s `pickModel` (lines 14–21), but adds the §4.9/§4.11 smoke-test gate before completing onboarding — no byte-count check, since custom files have no known `sizeBytes`.

No screen-test precedent in this codebase (see Task 12) — implementation only, verified manually in Task 18.

- [ ] **Step 1: Write the screen**

```typescript
import { useEffect, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ThemedText } from '@/components/themed-text';
import { runModelSmokeTest } from '@/lib/modelSmokeTest';
import { setModelPath, setModelId } from '@/lib/entityStorage';
import { useModelHub } from '@/hooks/useModelHub';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';

export default function ModelHubImportScreen() {
  const router = useRouter();
  const { send, stateValue } = useModelHub();
  const completeOnboarding = useModelHubCompletion();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (stateValue === 'complete') {
      void completeOnboarding().then(() => router.replace('/'));
    }
  }, [stateValue, completeOnboarding, router]);

  const runImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const name = picked.assets[0].name ?? `model-${Date.now()}.gguf`;
    const dest = new File(Paths.document, name);
    const source = new File(picked.assets[0].uri);
    source.copy(dest);
    setStatus('Checking the model can run on this device…');
    const result = await runModelSmokeTest({ modelPath: dest.uri, llamaConfig: { contextSize: 4096 } });
    if (!result.ok) {
      setStatus('');
      send({ type: 'IMPORT_FAILED', message: 'This model could not run on your device.' });
      router.back();
      return;
    }
    await setModelPath(dest.uri);
    await setModelId('custom');
    send({ type: 'IMPORT_SMOKE_OK' });
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">
        Pick any compatible `.gguf` file from your device. It will be checked with a short test
        completion before your journal opens.
      </ThemedText>
      <ThemedText>{status}</ThemedText>
      <Button title="Pick a .gguf file" onPress={() => void runImport()} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/model-hub/import.tsx
git commit -m "feat: add custom .gguf import screen for Model Hub"
```

---

### Task 16: `RootLayout` gate — remove the mock-LLM production fallback, route to Model Hub

**Files:**
- Modify: `src/app/_layout.tsx`

**Behavior change:** today, `RootLayout` always bootstraps the wiki — falling back to `createMockLlmProvider()` when `getModelPath()` is null (NG4 violation). After this task, no model path means the app renders the `model-hub` Stack screen instead of bootstrapping at all; the mock provider is never imported here. This conditional-`Stack.Screen`-set pattern is the same one Expo Router's own docs recommend for auth/onboarding gates, and it's a direct extension of the existing `if (!wiki) return <ActivityIndicator/>` gate already in this file — one more phase, same shape.

The `bootstrap` callback is exposed via `ModelHubCompletionProvider` (Task 14) so `download.tsx`/`import.tsx` can call it again once onboarding finishes, re-running the same `getModelPath()` check and flipping `phase` to `'ready'`.

- [ ] **Step 1: Replace the full contents of `src/app/_layout.tsx`**

```typescript
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { bootstrapWiki } from '@/services/wikiBootstrap';
import { getModelPath, getModelId } from '@/lib/entityStorage';
import { createLlamaProvider } from '@/lib/llamaProvider';
import { MODEL_CATALOG } from '@/catalog/modelManifest';
import { JournalProvider } from '@/contexts/JournalContext';
import { CitationNavigationProvider } from '@/contexts/CitationNavigationContext';
import { LlmProvider } from '@/contexts/LlmContext';
import { ModelHubCompletionProvider } from '@/contexts/ModelHubCompletionContext';
import { JournalWikiProvider } from '@/hooks/useJournalWiki';

type Phase = 'loading' | 'needsModelHub' | 'ready';

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [wiki, setWiki] = useState<WikiMemory | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null);

  const bootstrap = useCallback(async () => {
    const modelPath = await getModelPath();
    if (!modelPath) {
      setPhase('needsModelHub');
      return;
    }
    const modelId = await getModelId();
    const model = MODEL_CATALOG.find((entry) => entry.id === modelId);
    const provider = createLlamaProvider({
      modelPath,
      contextSize: model?.llamaConfig.contextSize,
      nGpuLayers: model?.llamaConfig.nGpuLayers,
      useMlock: model?.llamaConfig.useMlock,
    });
    const boot = await bootstrapWiki(provider);
    setWiki(boot.wiki);
    setEntityId(boot.entityId);
    setLlmProvider(provider);
    setPhase('ready');
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ModelHubCompletionProvider onComplete={bootstrap}>
        {phase === 'needsModelHub' || !wiki || !entityId || !llmProvider ? (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="model-hub" />
          </Stack>
        ) : (
          <WikiProvider wiki={wiki}>
            <LlmProvider provider={llmProvider}>
              <JournalWikiProvider wiki={wiki} entityId={entityId}>
                <JournalProvider entityId={entityId}>
                  <CitationNavigationProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen
                        name="entry/[factId]"
                        options={{ presentation: 'card', headerShown: true, title: 'Note' }}
                      />
                      <Stack.Screen name="night-shift" options={{ presentation: 'fullScreenModal' }} />
                      <Stack.Screen
                        name="import"
                        options={{ presentation: 'modal', headerShown: true, title: 'Import' }}
                      />
                    </Stack>
                  </CitationNavigationProvider>
                </JournalProvider>
              </JournalWikiProvider>
            </LlmProvider>
          </WikiProvider>
        )}
      </ModelHubCompletionProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Confirm the mock provider is no longer reachable from production code**

```bash
grep -rn "mockLlmProvider" src/app src/services src/hooks src/contexts
```

Expected: no output (zero matches) — confirms `createMockLlmProvider` is no longer imported anywhere under `src/app`, `src/services`, `src/hooks`, or `src/contexts`. (It remains imported only in test files, which is correct — NG4 / acceptance criterion "Mock LLM not mounted in production RootLayout".)

- [ ] **Step 3: Run the full test suite to catch any other breakage**

Run: `npx jest`
Expected: all existing suites still PASS (no test directly exercises `RootLayout`, so this step is a regression check on everything else, not this file).

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: gate RootLayout on Model Hub completion, drop mock LLM fallback"
```

---

### Task 17: Settings — "Change AI model" flow (§4.10)

**Files:**
- Modify: `src/app/(tabs)/settings.tsx`

Replaces the old "Pick GGUF model" doc-picker button (superseded per spec §1's decision table). Storage sequencing is strict per spec: **delete the old GGUF file first**, then clear `modelPath`, then route back into Model Hub — never download the replacement while the old file still occupies disk.

`rebootstrap()` (the same function passed as `ModelHubCompletionProvider`'s `onComplete` in Task 16) re-runs `getModelPath()`; since storage was just cleared, it now resolves to `null` and flips `RootLayout`'s `phase` to `'needsModelHub'`, which is what makes the `model-hub` Stack screen reachable again.

- [ ] **Step 1: Replace the full contents of `src/app/(tabs)/settings.tsx`**

```typescript
import { useRouter } from 'expo-router';
import { Alert, Button, StyleSheet, View } from 'react-native';
import { File } from 'expo-file-system';
import { useWikiExport } from '@equationalapplications/expo-llm-wiki';
import { ThemedText } from '@/components/themed-text';
import { exportOkfFromDump } from '@/lib/okfExport';
import { getModelPath, clearModelPath } from '@/lib/entityStorage';
import { useJournal } from '@/contexts/JournalContext';
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';
import { useNightShiftGates } from '@/hooks/useNightShiftGates';

export default function SettingsScreen() {
  const router = useRouter();
  const { entityId } = useJournal();
  const { canStart } = useNightShiftGates();
  const { execute: exportDump } = useWikiExport();
  const rebootstrap = useModelHubCompletion();

  const performChangeModel = async () => {
    const path = await getModelPath();
    if (path) {
      const file = new File(path);
      if (file.exists) file.delete();
    }
    await clearModelPath();
    await rebootstrap();
    router.replace('/model-hub');
  };

  const changeModel = () => {
    Alert.alert(
      'Change AI model',
      'This will delete your current model immediately. You will not be able to use the AI until the new download completes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => void performChangeModel() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle">Settings</ThemedText>
      <Button
        title="Run Night Shift"
        disabled={!canStart}
        onPress={() => router.push('/night-shift')}
      />
      <Button title="Import OKF" onPress={() => router.push('/import')} />
      <Button
        title="Export OKF"
        onPress={async () => {
          const dump = await exportDump([entityId]);
          await exportOkfFromDump(dump);
        }}
      />
      <Button title="Change AI model" onPress={changeModel} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16, gap: 12 } });
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(tabs)/settings.tsx"
git commit -m "feat: replace GGUF picker with Change AI model flow"
```

---

### Task 18: Full verification pass + manual QA stub (M6)

**Files:**
- Create: `docs/qa/model-hub-device-matrix.md`

Spec §9.2 requires an on-device Jetsam soak that **simulators cannot enforce** — this is not automatable in this plan or in CI. This task closes out the automated acceptance criteria (§9.3) and stubs the manual artifact so the soak has somewhere to land before ship.

- [ ] **Step 1: Run the full automated suite**

```bash
npx jest
```

Expected: every suite from Tasks 2–11 passes, plus all pre-existing suites (`journalWikiMachine`, `chatMessages`, `entityStorage`, etc.) still pass.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: zero errors. If `tsc` flags anything in the new files, fix it in place before proceeding — do not suppress with `@ts-ignore`.

- [ ] **Step 3: Re-confirm the acceptance criteria that are automatable from §9.3**

Cross-check against the test suites already written:

| Acceptance criterion | Covered by |
|---|---|
| Main app unreachable without valid model | Task 16 (`RootLayout` phase gate) — manual check in Step 4 |
| Wi-Fi gate blocks cellular without confirmation | `modelHubMachine.test.ts` — "routes to cellularConfirm..." |
| Pause/resume survives app restart via SQLite | `modelDownloadState.test.ts` + `modelHubMachine.test.ts` pause/resume tests |
| Byte verification | `modelDownloadService.test.ts` + `modelHubMachine.test.ts` verify-failure test |
| AppState background pause / foreground reason-gated resume | `modelHubMachine.test.ts` APP_BACKGROUND/APP_FOREGROUND tests |
| Disk-full → `failed` with specific copy, partial file deleted | `modelDownloadService.test.ts` `classifyDownloadError`, `modelHubMachine.test.ts` disk-full test |
| Custom User-Agent on all HF requests | `buildUserAgent.test.ts` + `modelDownloadService.test.ts` |
| Change-model deletes old GGUF before new download | Task 17 manual check in Step 4 (no automated UI test in this codebase) |
| Smoke test runs before `setModelPath` | `modelHubMachine.test.ts` happy-path + smoke-failure tests |
| No >3GB catalog entry on phone tier | `modelManifest.test.ts` |
| Mock LLM not mounted in production `RootLayout` | Task 16 Step 2 grep check |

- [ ] **Step 4: Manual smoke pass in the simulator/dev client**

```bash
npx expo start --dev-client
```

Walk through:
1. Clear app storage (or fresh install) → app should land on "Choose Your AI", not the journal.
2. Tap "Fast & Light" → on simulator Wi-Fi, should proceed straight to the download screen (simulators don't have cellular, so the cellular-confirm path can't be exercised here — defer to a physical device with cellular for that leg).
3. Let the download run a few seconds, tap Pause, background the app (Cmd+Shift+H on simulator or device home button), foreground it again — confirm it auto-resumes only when paused by backgrounding, not when paused manually.
4. After a real model finishes downloading and the smoke test passes, confirm the journal opens.
5. Settings → "Change AI model" → confirm the alert, confirm the old file is gone (check via `ls $(xcrun simctl get_app_container booted <bundle-id> data)/Documents`) before the new download starts.

This step cannot be fully scripted — record the outcome in conversation/PR description, not in this file.

- [ ] **Step 5: Create the manual QA stub for the M6 device soak**

```markdown
# Model Hub — On-Device Jetsam Soak Matrix

Status: **not yet run**. Required before shipping per spec §9.2 / §9.3 acceptance criteria
("Deep Thinker completes 3 consecutive Night Shift soaks on floor-tier physical device
without Jetsam kill"). Simulators do not enforce iOS Jetsam — this matrix can only be
filled in on physical hardware.

## Reference device matrix

| Tier | Example | Result | Notes |
|------|---------|--------|-------|
| Floor | 4 GB RAM Android budget phone | _pending_ | |
| Mid | 6 GB phone | _pending_ | |
| Ceiling | 8 GB flagship phone + one iPad | _pending_ | |

## Soak protocol

See spec `docs/superpowers/specs/2026-06-24-in-app-model-hub-design.md` §9.2 for the full
per-model, per-device, 3-consecutive-run protocol (50-note setup, Night Shift trigger,
worst-case backgrounding variant, instrumentation via Xcode Allocations / Android Memory
Profiler).

## Manifest tuning loop (if a soak fails)

1. Lower `contextSize` for the failing model in `src/catalog/modelManifest.ts` (4096 → 2048).
2. Set `useMlock: false` in that model's `llamaConfig`.
3. Reduce `nGpuLayers` on Android.
4. Re-run the soak; do not ship until the floor tier passes 3/3.
```

- [ ] **Step 6: Commit**

```bash
git add docs/qa/model-hub-device-matrix.md
git commit -m "docs: add Model Hub device soak QA stub (M6, manual)"
```

---

## Self-Review Notes

**Spec coverage:** G1–G8 (Task 16 gate, Task 2 catalog, Task 5/13 network gate + cellular UI, Task 7/14 download+progress, Task 14 tips/display-name, Task 15 custom import, Task 7/10 byte verification, Task 8/10 smoke test) — all covered. NG1–NG7 respected (no bundled weights, no background download, manifest bundled not remote, mock Jest-only per Task 16, no >3GB entries per Task 2 test, no SHA-256 — only byte count per Task 7, no skip path — `selecting` has no skip transition). §4.10 Change Model (Task 17), §4.12 keep-awake + AppState (Task 10 machine + Task 14 screen), §4.13 disk-full (Task 7/10), §4.4 SecureStore/SQLite split (Tasks 4/6) all covered.

**Placeholder scan:** no TBD/TODO markers; the one external fact that looked placeholder-shaped (`sizeBytes`) was resolved by live `curl -I -L` HEAD requests against the real HF URLs before writing Task 2 — both values and commit SHAs are real, not guessed.

**Type consistency:** `ModelHubApi` (defined in Task 10, consumed in Task 11) matches exactly — same method names and signatures in both. `ModelDownloadStatus`/`DownloadPauseStateRecord` (Task 6) are imported by name into both `modelDownloadService.ts` (Task 7) and `modelHubMachine.ts` (Task 10) without renaming. `CuratedModel`/`CuratedModelId`/`LlamaModelConfig` (Task 2) are the single source of truth referenced unchanged through Tasks 7–17.

