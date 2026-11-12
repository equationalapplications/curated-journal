# iOS Model Memory and Download Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tick the matching line in `LEDGER.md` as each task lands.

**Goal:** A model that does not fit the device fails with a message instead of an app kill, the user is warned before the download, and an interrupted download always resumes, restarts or fails in a way the user can act on.

**Architecture:** One pure function (`resolveModelLoadParams`) decides every `initLlama` call from the manifest config, the platform and the device's RAM. The model hub state machine gains three things: a check for a complete file before any download, a persisted marker around the smoke test, and a `smokeFailed` state with two user actions. Pause state without resume data is normalized to `null` at the store and service boundaries so the machine never sees it.

**Tech Stack:** Expo SDK 58, React Native, TypeScript, XState v5, `llama.rn` 0.12.9, `expo-file-system` (`DownloadTask`), `expo-device`, `expo-sqlite`, Jest (`jest-expo`).

**Spec:** `specs/2026-11-12-ios-model-memory/spec.md` (Status: Reviewed). Read it first. INTENT.md beats the spec, the spec beats this plan. If neither answers a question, stop and ask.

## Global Constraints

- JS/TS only. No native change, no new dependency, no `app.json` change other than the version. No entitlement.
- Android load parameters stay byte-identical to today: `use_mlock` from the manifest (default `true`), `n_gpu_layers` default `0`, no KV or context change.
- The memory check warns and lets the user continue. Nothing hard-blocks a model.
- A complete downloaded model file is deleted only by a user action (Choose another model, or starting to install a different model). A custom import's own failed copy is not a download and is deleted on failure.
- A load that killed the app is never retried automatically.
- When `Device.totalMemory` is `null`, behavior is exactly today's.
- RAM thresholds: Fast & Light 5 GiB, Smarter & Slower 7 GiB (`GiB = 1024 ** 3`).
- Read the versioned docs at https://docs.expo.dev/versions/v58.0.0/ for `expo-device` and `expo-file-system` before writing code against them, and check the installed types (AGENTS.md).
- XState v5: write `actions: [...]` as an array, never a bare string; fields in one `assign` all see the pre-event context (AGENTS.md).
- Tests live flat in `__tests__/`. Prefer `testID` / label queries for native-backed components (AGENTS.md).
- Commit after each task on `fix/ios-model-memory`. Do not push, open a PR, or start any build without asking the user.
- Commands: `npx jest <file>`; type-check `npx tsc -p tsconfig.test.json --noEmit`; lint `npm run lint`.

## Review Focus

Conditions the spec implies but does not spell out. Each is pinned by a test in the task named.

1. **Resume data that looks valid but is stale** (iOS discarded the temp file after a kill). Resume fails; Retry must not replay the same resume data forever. Expected: the failure clears the pause state. → Task 6.
2. **`Device.totalMemory` is `null`, `0` or `NaN`.** Expected: treated as unknown; no low-memory profile, and warnings as today. → Tasks 1 and 4.
3. **A saved record names a model that is no longer in the catalog**, or carries a status this bundle does not know. Expected: the hub opens on the list and the record is cleared, with no thrown `Unknown curated model id`. → Task 8.
4. **Try again after the file has gone or changed size** (storage cleared, offloaded). Expected: one verify failure message, saved state leaves `smoke-failed`, no loop back into the smoke test. → Task 7.
5. **Android on a low-RAM device.** Expected: the warning shows, but load parameters are the same as today. → Task 1.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/modelLoadParams.ts` (new) | Pure load-parameter decision, RAM comparison, current device reading |
| `src/lib/modelRamWarning.ts` (new) | Warning text for a model on this device, or `null` |
| `src/services/modelFiles.ts` (new) | Delete curated model files that are neither current nor being installed |
| `src/catalog/modelManifest.ts` | Adds `minComfortableRamBytes` per model |
| `src/lib/modelSmokeTest.ts`, `src/lib/llamaProvider.ts` | Call `resolveModelLoadParams`; smoke test stops deleting files |
| `src/services/modelDownloadState.ts` | New statuses; `normalizePauseState` on read and write |
| `src/services/modelDownloadService.ts` | `pauseDownload` returns `null` without resume data |
| `src/machines/modelHubMachine.ts` | Restore, pause, error paths, `checkingExisting`, `smokeFailed` |
| `src/hooks/useModelHub.tsx` | API additions, `toRestoreState`, background-only pause |
| `src/app/model-hub/{_layout,index,download,import}.tsx`, `src/app/_layout.tsx` | Wiring and UI |

---

### Task 1: Load-parameter function and manifest RAM field (A1, A2, A3, A5 lever 1)

**Files:**
- Create: `src/lib/modelLoadParams.ts`, `__tests__/modelLoadParams.test.ts`
- Modify: `src/catalog/modelManifest.ts`, `__tests__/modelManifest.test.ts`
- Modify (fixtures only, add the new field): `__tests__/modelHubMachine.test.ts`, `__tests__/useModelHub.test.ts`, any other test with a `CuratedModel` literal that `tsc` flags

**Interfaces — Produces:**

```ts
// src/catalog/modelManifest.ts
export type CuratedModel = { /* existing fields */ minComfortableRamBytes: number };
// fast-light: 5 * 1024 ** 3      smarter-slower: 7 * 1024 ** 3

// src/lib/modelLoadParams.ts
export const GIB = 1024 ** 3;
export const LOW_MEMORY_KV_CACHE_TYPE = 'q8_0' as const;
export const LOW_MEMORY_CONTEXT_SIZE: number | null = null; // Task 3 sets this
export type DeviceMemory = { platform: string; totalMemoryBytes: number | null };
export type ModelLoadParams = {
  n_ctx: number;
  n_gpu_layers: number;
  use_mlock: boolean;
  cache_type_k?: 'q8_0';
  cache_type_v?: 'q8_0';
  flash_attn_type?: 'on';
};
export function isBelowComfortableRam(
  minComfortableRamBytes: number | undefined,
  totalMemoryBytes: number | null,
): boolean;
export function resolveModelLoadParams(input: {
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
  device: DeviceMemory;
}): ModelLoadParams;
export function currentDeviceMemory(): DeviceMemory; // Platform.OS + Device.totalMemory
```

Rules the tests pin:
- `n_ctx` = `llamaConfig.contextSize ?? 4096`. `n_gpu_layers` = `llamaConfig.nGpuLayers ?? (ios ? 99 : 0)`.
- `use_mlock` = `false` on iOS always; elsewhere `llamaConfig.useMlock ?? true`.
- `isBelowComfortableRam` is `false` unless both numbers are finite and positive and `totalMemoryBytes < minComfortableRamBytes`.
- Low-memory profile = iOS and below comfortable RAM: adds `cache_type_k`, `cache_type_v` = `'q8_0'` and `flash_attn_type: 'on'`. When `LOW_MEMORY_CONTEXT_SIZE` is a number, `n_ctx` = `min(n_ctx, LOW_MEMORY_CONTEXT_SIZE)`.
- Outside the low-memory profile the three optional keys are absent, not `undefined`.

- [ ] **Step 1: Write the failing tests** in `__tests__/modelLoadParams.test.ts`

```ts
const ios3 = { platform: 'ios', totalMemoryBytes: 2.9 * GIB };
const ios8 = { platform: 'ios', totalMemoryBytes: 7.5 * GIB };
const android3 = { platform: 'android', totalMemoryBytes: 2.9 * GIB };
const fl = { llamaConfig: { contextSize: 8192, useMlock: true }, minComfortableRamBytes: 5 * GIB };

it('never pins weights on iOS, whatever the manifest says', () => {
  expect(resolveModelLoadParams({ ...fl, device: ios8 })).toEqual({ n_ctx: 8192, n_gpu_layers: 99, use_mlock: false });
});
it('adds the quantized KV cache on low-memory iOS', () => {
  expect(resolveModelLoadParams({ ...fl, device: ios3 })).toMatchObject({
    use_mlock: false, cache_type_k: 'q8_0', cache_type_v: 'q8_0', flash_attn_type: 'on',
  });
});
it('leaves Android exactly as today, even below comfortable RAM', () => {          // Review Focus 5
  expect(resolveModelLoadParams({ ...fl, device: android3 })).toEqual({ n_ctx: 8192, n_gpu_layers: 0, use_mlock: true });
});
it('custom import: 4096 context, no pinning on iOS, no low-memory profile', () => {
  expect(resolveModelLoadParams({ llamaConfig: { contextSize: 4096 }, device: ios3 }))
    .toEqual({ n_ctx: 4096, n_gpu_layers: 99, use_mlock: false });
});
it('falls back to a 4096 context when none is given', () => {
  expect(resolveModelLoadParams({ device: ios8 }).n_ctx).toBe(4096);
});
it.each([null, 0, NaN, -1])('treats total memory %p as unknown', (m) => {            // Review Focus 2
  expect(isBelowComfortableRam(5 * GIB, m as number | null)).toBe(false);
  expect(resolveModelLoadParams({ ...fl, device: { platform: 'ios', totalMemoryBytes: m as number | null } }))
    .toEqual({ n_ctx: 8192, n_gpu_layers: 99, use_mlock: false });
});
it('compares strictly below the threshold', () => {
  expect(isBelowComfortableRam(5 * GIB, 5 * GIB)).toBe(false);
  expect(isBelowComfortableRam(5 * GIB, 5 * GIB - 1)).toBe(true);
});
```

Add to `__tests__/modelManifest.test.ts`: `fast-light` has `minComfortableRamBytes === 5 * 1024 ** 3`, `smarter-slower` has `7 * 1024 ** 3`.

- [ ] **Step 2: Run** `npx jest __tests__/modelLoadParams.test.ts __tests__/modelManifest.test.ts` — expected: FAIL (module not found; field undefined).
- [ ] **Step 3: Implement** the manifest field and `src/lib/modelLoadParams.ts` to the signatures above. `currentDeviceMemory` is the only impure export.
- [ ] **Step 4: Check lever 1 against the installed package.** Confirm in `node_modules/llama.rn/src/index.ts` that `'q8_0'` is in the valid cache types and `flash_attn_type` accepts `'on'`, and in `node_modules/llama.rn/cpp/jsi/JSIParams.cpp` that all three keys are read. Record the file:line evidence in `LEDGER.md`. If any is missing, stop and ask. The runtime check is the iPad run in Task 9; a rejected load there lands in the `smokeFailed` state, not a crash.
- [ ] **Step 5: Run** the two test files, then `npx tsc -p tsconfig.test.json --noEmit`. Add `minComfortableRamBytes` to every `CuratedModel` fixture `tsc` flags. Expected: PASS, tsc clean.
- [ ] **Step 6: Commit** `feat(model): decide load parameters in one place, never pin weights on iOS`. Include `spec.md`, `plan.md` and `LEDGER.md` in this first commit.

---

### Task 2: Use the function everywhere a model loads (A1, B5 file-keeping)

**Files:**
- Modify: `src/lib/modelSmokeTest.ts`, `src/lib/llamaProvider.ts`, `src/app/_layout.tsx:84-89`, `src/hooks/useModelHub.tsx:64-67`, `src/app/model-hub/import.tsx:61-74`
- Test: `__tests__/modelSmokeTest.test.ts`, `__tests__/llamaProvider.test.ts`, `__tests__/modelHubImport.test.tsx`

**Interfaces:**
- Consumes: `resolveModelLoadParams`, `currentDeviceMemory` (Task 1).
- Produces:

```ts
export async function runModelSmokeTest(input: {
  modelPath: string;
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
}): Promise<SmokeTestResult>;               // never deletes the file

export function createLlamaProvider(config: {
  modelPath: string;
  llamaConfig?: Partial<LlamaModelConfig>;
  minComfortableRamBytes?: number;
}): LLMProvider;
```

Both call `initLlama({ model: modelPath, ...resolveModelLoadParams({ llamaConfig, minComfortableRamBytes, device: currentDeviceMemory() }) })`.

- [ ] **Step 1: Write the failing tests.**
  - `modelSmokeTest.test.ts`: replace "deletes the file when initLlama throws" with "resolves `{ ok: false }` and does **not** delete the file when initLlama throws". Add: with `Platform.OS = 'ios'` and a manifest config `{ contextSize: 8192, useMlock: true }`, `initLlama` is called with `use_mlock: false`.
  - `llamaProvider.test.ts`: on iOS, `initLlama` receives `use_mlock: false`; mock `expo-device` `totalMemory: 3 * 1024 ** 3` with `minComfortableRamBytes: 5 * 1024 ** 3` and assert `cache_type_k: 'q8_0'`.
  - `modelHubImport.test.tsx`: when the smoke test returns `{ ok: false }`, the copied destination file's `delete` is called; same when the smoke test throws.
- [ ] **Step 2: Run** the three files — expected: FAIL on the new assertions.
- [ ] **Step 3: Implement.** Remove the `File` delete from `runModelSmokeTest`'s catch. In `import.tsx`, delete `dest` (if it exists) on both failure branches. Update the two call sites (`_layout.tsx` passes `llamaConfig: model?.llamaConfig, minComfortableRamBytes: model?.minComfortableRamBytes`; `useModelHub.tsx` passes the model's two fields).
- [ ] **Step 4: Run** the three files plus `npx tsc -p tsconfig.test.json --noEmit` — expected: PASS.
- [ ] **Step 5: Commit** `refactor(model): smoke test and provider share load parameters; smoke test keeps the file`.

---

### Task 3: Context lever, only if bounded (A5 lever 2)

**Files:**
- Modify: `src/lib/modelLoadParams.ts` (`LOW_MEMORY_CONTEXT_SIZE`), `__tests__/modelLoadParams.test.ts`, `LEDGER.md`

- [ ] **Step 1: Bound the three prompt types.** From `node_modules/@equationalapplications/core-llm-wiki/dist/index.js` and the app's call sites (`src/components/synthesis/SynthesisPane.tsx` uses `maxResults: 8`), find the maximum character size of: the chat answer prompt, the librarian prompt, the heal prompt. System prompt text counts. Use the engine's own caps (facts carry bodies up to 800 characters; batches are sized from `maxOutputTokens` = 2048).
- [ ] **Step 2: Decide.** For each type: `tokens = ceil(chars / 3) * 1.10`. The lever applies only if all three satisfy `tokens + 2048 <= 4096`. If any prompt type has no derivable cap, the lever does not apply.
- [ ] **Step 3: Record** the three bounds, the arithmetic and the decision in `LEDGER.md`.
- [ ] **Step 4a (lever applies): failing test first** — low-memory iOS with `contextSize: 8192` gives `n_ctx: 4096`; non-low-memory iOS still gives `8192`; a custom `4096` is unchanged. Then set `LOW_MEMORY_CONTEXT_SIZE = 4096`. Run, PASS.
- [ ] **Step 4b (lever does not apply):** leave the constant `null`, add a test that low-memory iOS keeps `n_ctx: 8192`, and add a one-line comment at the constant pointing to the spec's A5.
- [ ] **Step 5: Commit** `feat(model): low-memory context size` or `docs(model): context lever not applied`, matching the outcome.

---

### Task 4: RAM warning before download (A4)

**Files:**
- Create: `src/lib/modelRamWarning.ts`, `__tests__/modelRamWarning.test.ts`, `__tests__/modelHubRamWarning.test.tsx`
- Modify: `src/app/model-hub/index.tsx` (`selectModel`, warning card)

**Interfaces:**
- Consumes: `isBelowComfortableRam`, `currentDeviceMemory` (Task 1).
- Produces: `export function modelRamWarning(model: CuratedModel, totalMemoryBytes: number | null): string | null`

Rules:
- RAM unknown (`null`, `0`, `NaN`): return `model.deviceWarning ?? null` (today's behavior).
- RAM known and below: return `` `${model.displayName} is larger than this device comfortably runs. It may be slow, and it may fail to load.` ``
- RAM known and sufficient: return `null`, including for Smarter & Slower.

- [ ] **Step 1: Write the failing tests.** Unit: the three rules for both catalog models, including `totalMemoryBytes` of `null`, `0` and `NaN` (Review Focus 2). Screen (`modelHubRamWarning.test.tsx`, following the mocks in `__tests__/modelHubChangeContrast.test.tsx`, plus `jest.mock('expo-device', ...)`):
  - 3 GiB device: pressing Fast & Light shows the warning text and does not call `send`; pressing Continue calls `send({ type: 'SELECT_MODEL', modelId: 'fast-light' })`.
  - 8 GiB device: pressing Smarter & Slower shows no warning and calls `send` directly.
  - `totalMemory: null`: Smarter & Slower shows its existing `deviceWarning`; Fast & Light shows none.
- [ ] **Step 2: Run** both files — expected: FAIL.
- [ ] **Step 3: Implement.** `index.tsx` keeps one piece of state, `{ model, message } | null`, set from `modelRamWarning(model, currentDeviceMemory().totalMemoryBytes)`; the card renders `message`. The "Recommended for newer devices" hint line stays as it is.
- [ ] **Step 4: Run** both files — expected: PASS.
- [ ] **Step 5: Commit** `feat(model-hub): warn before downloading a model larger than the device comfortably runs`.

---

### Task 5: Pause state without resume data is no pause state (B1, store and service)

**Files:**
- Modify: `src/services/modelDownloadState.ts`, `src/services/modelDownloadService.ts`, `src/machines/modelHubMachine.ts` (the `ModelHubApi.pauseDownload` type only)
- Test: `__tests__/modelDownloadState.test.ts`, `__tests__/modelDownloadService.test.ts`

**Interfaces — Produces:**

```ts
// modelDownloadState.ts
export type ModelDownloadStatus = 'idle' | 'downloading' | 'paused' | 'failed' | 'smoke-testing' | 'smoke-failed';
export function normalizePauseState(
  pauseState: DownloadPauseStateRecord | null | undefined,
): DownloadPauseStateRecord | null;          // null unless resumeData is a non-empty string
// store.get() and store.set() both pass pauseState through normalizePauseState.

// modelDownloadService.ts
export async function pauseDownload(): Promise<DownloadPauseStateRecord | null>;
// ModelHubApi.pauseDownload: () => Promise<DownloadPauseStateRecord | null>
```

- [ ] **Step 1: Write the failing tests.**
  - State: `normalizePauseState` returns `null` for `null`, for a record with `resumeData` `undefined`, and for `''`; returns the record unchanged when `resumeData` is `'rd'`. `get()` on a row whose `pause_state_json` lacks `resumeData` (what 8.0.1 wrote) returns `pauseState: null` and keeps `status: 'paused'`. `set()` with such a record stores `NULL`. A row with `status: 'smoke-testing'` round-trips.
  - Service: when the task's `savable()` returns no `resumeData`, `pauseDownload()` resolves `null`; with `resumeData: 'rd'` it resolves the record.
- [ ] **Step 2: Run** both files — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and `npx tsc -p tsconfig.test.json --noEmit` — expected: PASS.
- [ ] **Step 5: Commit** `fix(download): a pause with no resume data is saved as no pause state`.

---

### Task 6: Machine — restore, pause, resume, error paths (B1, B2, B6)

**Files:**
- Modify: `src/machines/modelHubMachine.ts`
- Test: `__tests__/modelHubMachine.test.ts`

**Interfaces:**
- Consumes: `pauseDownload` returning `| null` (Task 5).
- Produces: `Context.pausedReason: 'user' | 'background' | 'restored' | null`.

Behavior:
- `RESTORE_DOWNLOAD` with `status: 'paused'` always targets `paused` (with or without a pause state), setting `pausedReason: 'restored'`.
- `pauseTask` input gains `pausedReason` and `pauseState`. When `pausedReason === 'restored'` it returns the given `pauseState` and calls neither `api.pauseDownload` nor `api.persistDownloadState`.
- `runDownload` resumes only when `input.pauseState?.resumeData` is truthy; otherwise it starts fresh.
- `FAIL` in `downloading` also assigns `pauseState: null`.
- New `onError` transitions. The network check runs while the list is on screen, and the list has no Retry button, so it returns to `selecting` with the error in the banner (the same pattern as `retiringCurrent`). The other two run on the download screen and go to `failed`.

| Actor | Target | `error.code` | `error.message` |
| --- | --- | --- | --- |
| `checkNetworkActor` | `selecting` | `network` | `Could not check your connection. Try again.` |
| `pauseTask` | `failed` | `unknown` | `Could not pause the download. Try again.` |
| `verifyTask` (in `verifying`) | `failed` | `verify` | `Could not check the downloaded file. Try again.` |

(`smokeTestTask`'s error path is Task 7.)

- [ ] **Step 1: Write the failing tests.**
  - Restore paused with resume data: state is `paused`, `api.pauseDownload` not called, `RESUME` calls `api.resumeDownload` with that record.
  - Restore paused with `pauseState: null`: state is `paused` (not `downloading`), `api.startDownload` not called until `RESUME`, then called.
  - A pause that returns `null`: after `PAUSE`, `RESUME` calls `api.startDownload`, never `api.resumeDownload`.
  - Stale resume data (Review Focus 1): restore paused with a record, `api.resumeDownload` rejects → state `failed` and `context.pauseState === null`; `RETRY` does not call `api.resumeDownload` again.
  - Each of the three rejecting actors lands in the target state with the code and message in the table, and `actor.getSnapshot().status` is `'active'`. After the network-check failure, `SELECT_MODEL` works again.
- [ ] **Step 2: Run** `npx jest __tests__/modelHubMachine.test.ts` — expected: the new tests FAIL, the 26 existing ones PASS.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file — expected: all PASS.
- [ ] **Step 5: Commit** `fix(model-hub): restored and empty pauses resume cleanly; every task has an error path`.

---

### Task 7: Machine — existing file, smoke marker, smoke-failed state, orphans (B4, B5, B7, A6)

**Files:**
- Modify: `src/machines/modelHubMachine.ts`
- Test: `__tests__/modelHubMachine.test.ts`

**Interfaces — Produces:**

```ts
// events
| { type: 'CHOOSE_ANOTHER' }
| { type: 'RESTORE_DOWNLOAD'; modelId: CuratedModelId;
    status: 'downloading' | 'paused' | 'smoke-testing' | 'smoke-failed';
    pauseState: DownloadPauseStateRecord | null }

// ModelHubApi additions
isLowMemoryFor: (model: CuratedModel) => boolean;
deleteOrphanedModelFiles: (keepModelId: CuratedModelId | null) => Promise<void>;

// Context additions
smokeKilled: boolean;                       // initial false
afterCheck: 'network' | 'download';         // initial 'network'

export function smokeFailureMessage(displayName: string, memoryLikely: boolean): string;
```

Exact copy for `smokeFailureMessage`:
- `memoryLikely` true: `` `This device most likely ran out of memory while loading ${displayName}. Close other apps and try again, or choose another model.` ``
- false: `` `${displayName} could not run on this device. Try again, or choose another model.` ``

States:
- **`checkingExisting`** (new). Entry: `void api.deleteOrphanedModelFiles(context.modelId)`. Invokes `verifyTask`. Output `true` → `smokeTest`. Output `false` or a reject means there is no usable file: go on to `confirmingNetwork` when `afterCheck === 'network'`, or straight to `downloading` when it is `'download'`. Delete nothing here.
- Entry points that go to `checkingExisting` instead of where they go today: `SELECT_MODEL` when the model is the current one and `retiringCurrent` done with `identityCleared` (both assign `afterCheck: 'network'`); `RESTORE_DOWNLOAD` with `status: 'downloading'` (assigns `afterCheck: 'download'`, because a restored download opens on the download screen, which cannot show the wifi and cellular prompts).
- **`smokeTestTask`** awaits `api.persistDownloadState({ modelId, status: 'smoke-testing', pauseState: null })` before calling `api.runSmokeTest`. The write must finish first: the kill can come at any point after the load starts.
- **`smokeTest`**: `ok === true` → `complete` (as today). `ok !== true` or a reject → `smokeFailed`.
- **`smokeFailed`** (new, replaces the transition to `selecting`). Entry: assign `error = { code: 'smoke', message: smokeFailureMessage(displayName, context.smokeKilled || api.isLowMemoryFor(model)) }`, then persist `{ modelId, status: 'smoke-failed', pauseState: null }`.
  - `RETRY` → `verifying`, assigning `error: null, smokeKilled: false`.
  - `CHOOSE_ANOTHER` → `selecting`: `api.deletePartialFile(filename)`, `void api.clearDownloadState()`, assign `modelId: null, error: null, smokeKilled: false`.
- `RESTORE_DOWNLOAD` with `status` `'smoke-testing'` or `'smoke-failed'` → `smokeFailed`, with `smokeKilled: event.status === 'smoke-testing'`.

- [ ] **Step 1: Write the failing tests.** Add `isLowMemoryFor: jest.fn(() => false)` and `deleteOrphanedModelFiles: jest.fn(async () => undefined)` to `makeApi`, and change its default `verifyDownload` to `jest.fn().mockReturnValueOnce(false).mockReturnValue(true)` so the existing tests still exercise a download.
  - Complete file on select: `verifyDownload` true on the first call → reaches `complete` with `api.startDownload` and `api.checkNetwork` never called.
  - Complete file on restore (`status: 'downloading'`): same.
  - No file on select: `verifyDownload` false then true → goes through `confirmingNetwork` and `downloading`; `api.deletePartialFile` not called by `checkingExisting`.
  - No file on restore: goes to `downloading` with `api.checkNetwork` never called.
  - `verifyDownload` throwing in `checkingExisting` is treated as no file.
  - Marker order: `persistDownloadState` is called with `status: 'smoke-testing'` before `runSmokeTest` is called (compare `mock.invocationCallOrder`).
  - The three failure modes all reach `smokeFailed` with `error.code === 'smoke'`, with `persistDownloadState` last called with `status: 'smoke-failed'` and `api.deletePartialFile` not called: (a) `runSmokeTest` resolves `{ ok: false }`; (b) `runSmokeTest` rejects; (c) `RESTORE_DOWNLOAD` with `status: 'smoke-testing'`.
  - Copy: case (c) message equals `smokeFailureMessage('Fast & Light', true)`; case (a) with `isLowMemoryFor` false equals `smokeFailureMessage('Fast & Light', false)`; case (a) with it true equals the `true` message. No message contains "Try Fast & Light".
  - `RESTORE_DOWNLOAD` with `status: 'smoke-failed'` → `smokeFailed`, and `api.runSmokeTest` is not called until `RETRY`.
  - `RETRY` from `smokeFailed` with the smoke test now passing → `complete`, no `startDownload`.
  - Try again after the file is gone (Review Focus 4): `RETRY` with `verifyDownload` false → `failed` with code `verify`; `persistDownloadState` last called with `status: 'failed'`; `runSmokeTest` not called again.
  - `CHOOSE_ANOTHER` → `selecting`; `deletePartialFile` called with the model's filename; `clearDownloadState` called; `context.modelId === null`.
  - Orphans: entering `checkingExisting` calls `deleteOrphanedModelFiles('fast-light')`.
- [ ] **Step 2: Run** `npx jest __tests__/modelHubMachine.test.ts` — expected: new tests FAIL. Update the existing smoke-failure test that expects `selecting` to expect `smokeFailed`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file — expected: all PASS.
- [ ] **Step 5: Commit** `feat(model-hub): reuse a complete download, and fail a model load once instead of on every launch`.

---

### Task 8: Hook, layout and screens (B3, B5 UI, B7, restore)

**Files:**
- Create: `src/services/modelFiles.ts`, `__tests__/modelFiles.test.ts`, `__tests__/modelHubDownloadSmokeFailed.test.tsx`
- Modify: `src/hooks/useModelHub.tsx`, `src/app/model-hub/_layout.tsx`, `src/app/model-hub/index.tsx`, `src/app/model-hub/download.tsx`, `src/app/model-hub/import.tsx`
- Test: `__tests__/useModelHub.test.ts`, `__tests__/modelHubImport.test.tsx`

**Interfaces:**
- Consumes: Task 7's events, API members and statuses; `isBelowComfortableRam`, `currentDeviceMemory` (Task 1).
- Produces:

```ts
// src/services/modelFiles.ts — best-effort; swallows and warns, never throws
export function deleteOrphanedCuratedModelFiles(input: {
  keepModelId: CuratedModelId | null;
  currentModelPath: string | null;
}): void;
// Deletes each MODEL_CATALOG file in Paths.document that exists, is not keepModelId's,
// and whose uri is not currentModelPath.

// src/hooks/useModelHub.tsx
export type ModelHubRestoreState = {
  modelId: CuratedModelId;
  status: 'downloading' | 'paused' | 'smoke-testing' | 'smoke-failed';
  pauseState: DownloadPauseStateRecord | null;
};
export function toRestoreState(record: ModelDownloadStateRecord | null): ModelHubRestoreState | null;
// null unless status is one of the four above AND modelId is in MODEL_CATALOG.
```

- [ ] **Step 1: Write the failing tests.**
  - `modelFiles.test.ts`: with both catalog files present, `keepModelId: 'fast-light'` and `currentModelPath` null deletes only the Smarter & Slower file; a file whose uri equals `currentModelPath` is kept; a `delete` that throws does not propagate.
  - `useModelHub.test.ts`:
    - `toRestoreState`: returns the state for each of the four statuses; returns `null` for `idle`, `failed`, a status string it does not know, `modelId: null`, and `modelId: 'removed-model'` (Review Focus 3).
    - `createModelHubApi(store).isLowMemoryFor(model)` is true with `expo-device` mocked at 3 GiB and a 5 GiB model, false at 8 GiB, false at `null`.
    - `deleteOrphanedModelFiles('fast-light')` calls `deleteOrphanedCuratedModelFiles` with `keepModelId: 'fast-light'` and the stored model path.
    - AppState: an `inactive` change sends nothing; `background` sends `APP_BACKGROUND`; `active` sends `APP_FOREGROUND`.
  - `modelHubDownloadSmokeFailed.test.tsx` (mocks as in `__tests__/modelHubDownloadContrast.test.tsx`): with `stateValue: 'smokeFailed'` and an error message, the message, a "Try again" button and a "Choose another model" button render; pressing them sends `RETRY` and `CHOOSE_ANOTHER`. With `stateValue: 'smokeTest'`, the text `Checking the model runs on this device…` renders and no Pause button does.
  - `modelHubImport.test.tsx`: after a file is picked, `deleteOrphanedCuratedModelFiles` is called with `keepModelId: null` and the current model path, before the copy.
- [ ] **Step 2: Run** the five files — expected: FAIL.
- [ ] **Step 3: Implement.**
  - `useModelHub.tsx`: the AppState listener sends `APP_BACKGROUND` on `background` only. Widen the `pausedReason` type in `ModelHubContextValue`.
  - `_layout.tsx`: build the restore state with `toRestoreState(downloadState)`. When it returns a state, set it and `router.replace('/model-hub/download')`. When the saved status is one of the four but `toRestoreState` returns `null`, call `store.clear()` and stay on the list.
  - `index.tsx`: navigate to the download screen when the state enters the install set `downloading | paused | failed | verifying | smokeTest | smokeFailed` from outside it. Key the effect on that boolean, not on `stateValue`, so moving between install states does not push a second screen.
  - `download.tsx`: for `verifying` and `smokeTest` show `Checking the model runs on this device…` in place of the speed line. For `smokeFailed` show `error.message` with the two buttons. After `CHOOSE_ANOTHER`, go to the list: `router.back()` when it can go back, else `router.replace('/model-hub')`. Show "Paused" for `pausedReason === 'restored'`.
  - `import.tsx`: call `deleteOrphanedCuratedModelFiles({ keepModelId: null, currentModelPath: currentPath })` after the pick.
- [ ] **Step 4: Run** the five files, then the whole suite `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat(model-hub): smoke-failed screen, background-only pause, orphan cleanup`.

---

### Task 9: Version, full verification, hand-off

**Files:**
- Modify: `package.json`, `package-lock.json` (both `version` fields at the top), `app.json`, `LEDGER.md`

- [ ] **Step 1: Pick the version.** `git fetch origin main` and read `main`'s version. Use the next MINOR above it: 8.1.0 if `main` is 8.0.1; 8.2.0 if #106 has merged; 9.1.0 if #107 has merged. If the branch is behind `main`, rebase first and re-run the suite.
- [ ] **Step 2: Bump** the three files.
- [ ] **Step 3: Verify, and paste the output tails into `LEDGER.md`:** `npm test` (all pass), `npx tsc -p tsconfig.test.json --noEmit` (no output), `npm run lint` (clean).
- [ ] **Step 4: Trace each spec requirement** A1–A6 and B1–B7 to the test that proves it, one line each, in `LEDGER.md`.
- [ ] **Step 5: Commit** `chore: version X.Y.Z`.
- [ ] **Step 6: Stop and report to the user.** Do not push or open the PR without their go-ahead. The on-device checks in the spec's Verification section are theirs and are owed after delivery:
  1. Fast & Light on the iPad Air 3: the smoke test passes, or fails with the memory message; a second launch after a kill shows the failed screen, not another kill.
  2. Pause, kill the app, relaunch, Resume: no error. Control Center mid-download: the download keeps going.
  3. If the smoke test passes: time to first token and tokens per second for one chat answer.
  If the app is still killed, ask for the new Jetsam report before changing anything (spec, Decisions).

### Task 10: Same-PR cleanup (after the user has reviewed the implementation)

- [ ] Set the spec's status line to `Implemented`, with the version.
- [ ] Delete `plan.md` and `LEDGER.md`.
- [ ] Commit `chore(specs): remove ios-model-memory plan and ledger scaffolding`.
