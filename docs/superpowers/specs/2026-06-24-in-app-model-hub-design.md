# In-App Model Hub — Technical Specification

Date: 2026-06-24  
Status: Approved
Parent spec: [Curated Journal demo app](./2026-06-24-curated-journal-demo-app.md)  
Target platform: Expo SDK 56 (React Native 0.85, React 19)

---

## 1. Problem Statement

The current Curated Journal onboarding path hides multi-gigabyte model setup behind **Settings → Pick GGUF model** and falls back to a **mock LLM** when no model is configured. This creates three problems:

1. **User confusion.** A document picker is the wrong mental model for a consumer journal app. Users do not know which `.gguf` to sideload, where to get it, or whether their file is compatible.
2. **Unpredictable performance.** Untested quantizations and context sizes cause silent OOM kills (iOS Jetsam) during Night Shift librarian passes — the worst possible moment to crash.
3. **Trust violations avoided correctly, but incompletely.** The current flow correctly rejects silent background downloads (NG7), but offers no polished foreground alternative.

**In-App Model Hub** replaces the Settings-first picker with an explicit, beautiful first-launch flow: choose a curated model, download over Wi-Fi (with cellular override), stay engaged while the transfer runs, and enter the journal only when a verified on-device model is ready.

This spec **supersedes** the following existing decisions:

| Existing decision | Model Hub change |
|-------------|------------------|
| NG7 — no automatic model download | **Removed.** Curated Hugging Face download is core onboarding. |
| First launch: optional Settings GGUF picker | **Required** Model Hub gate before main app. |
| Mock LLM in production bootstrap | **Removed.** Mock provider remains **Jest-only**. |
| `expo-keep-awake` on Night Shift only | Also active during model download. |

---

## 2. Goals

| ID | Goal |
|----|------|
| G1 | Block main app until a valid GGUF is installed (curated download or custom import). |
| G2 | Offer **2** curated, device-tested models via Hugging Face `resolve/main` direct URLs. |
| G3 | Wi-Fi gate with explicit cellular override confirmation. |
| G4 | Foreground resumable download with determinate progress, keep-awake, and pause/resume across app restarts. |
| G5 | Engage the user during download (Night Shift tips, optional journal display name). |
| G6 | Preserve **Import custom .gguf** as a power-user escape hatch. |
| G7 | Validate downloads with exact byte-count match (no multi-GB SHA-256 on device). |
| G8 | Post-download smoke test before marking onboarding complete. |

---

## 3. Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Bundled GGUF weights in the App Store binary | Keeps binary small; licensing clarity. |
| NG2 | Background / silent download | OS constraints and user trust; foreground-only. |
| NG3 | Remote catalog CDN | Manifest ships in app; HF hosts weights. |
| NG4 | Mock LLM in production | Required-download gate; mock stays in unit tests. |
| NG5 | Llama-3-8B (or any > 3 GB file) on phone catalog in this release | Jetsam risk on iOS; see §4.4. |
| NG6 | Full-file SHA-256 verification on device | 4 GB hash freezes UI and drains battery; byte count + Expo download integrity is sufficient for this release. |
| NG7 | Skip / "Try without AI" path | User chose required download. |

---

## 4. Architecture

### 4.1 Layered Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                     UI Layer (expo-router)                       │
│  Model Hub (onboarding stack) │ Journal │ Graph │ Night Shift   │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│   App Orchestration                                              │
│   modelHubMachine (XState)     journalWikiMachine (existing)     │
│   modelDownloadService         networkGate                       │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│   Persistence                                                    │
│   model_download_state (SQLite)   SecureStore (modelPath, ids)   │
│   expo-file-system DownloadTask   Paths.document / File            │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│   External                                                       │
│   Hugging Face LFS (resolve/main URLs, HTTP Range resume)        │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Approach

**Bundled manifest catalog + XState `modelHubMachine` + Expo SDK 56 `DownloadTask`.**

Rejected alternatives:

- **Inline screens without a machine** — resume/error logic becomes untestable spaghetti.
- **Remote manifest + background fetch** — violates foreground trust model; adds network dependency before onboarding.

### 4.3 Curated Model Catalog

Manifest lives at `src/catalog/modelManifest.ts` (bundled, versioned with app releases). Each entry points to a Hugging Face direct download URL:

```text
https://huggingface.co/{org}/{repo}/resolve/main/{filename}.gguf
```

Hugging Face LFS supports HTTP Range requests; Expo `DownloadTask` handles Range headers for pause/resume.

```typescript
export type CuratedModelId = 'fast-light' | 'deep-thinker';

export type CuratedModel = {
  id: CuratedModelId;
  displayName: string;
  tagline: string;
  sizeLabel: string;       // human-readable, e.g. "~2.3 GB"
  sizeBytes: number;       // exact expected file size for verification
  hfUrl: string;
  filename: string;
  llamaConfig: {
    contextSize: number;
    nGpuLayers?: number;   // default: 99 iOS, 0 Android
    useMlock?: boolean;    // default false for deep-thinker on floor devices
  };
  deviceHint: 'all' | 'recommended-high-ram';
  deviceWarning?: string;  // platform-agnostic; soft gate only
};
```

#### Initial catalog entries

| ID | Display name | Base model | Quant | Approx size | Device hint |
|----|--------------|------------|-------|-------------|-------------|
| `fast-light` | Fast & Light | Phi-3-mini-4k-instruct | Q4_K_M | ~2.3 GB | `all` |
| `deep-thinker` | Deep Thinker | Qwen2.5-3B-Instruct | Q4_K_M | ~2.0 GB | `all` |

**Taglines (example copy):**

- **Fast & Light:** *"Best for everyday journaling. Fast responses, gentle on battery."*
- **Deep Thinker:** *"Richer synthesis and emergent ontology. Works on most modern phones and tablets."*

#### Jetsam rationale (Deep Thinker model choice)

Llama-3-8B Q4_K_M (~4.7 GB file) is **excluded from the initial phone catalog**. Even with `mmap`, context caching and librarian JSON generation spike working set; iOS often caps a single process around 3–4 GB on 8 GB devices. A 4.7 GB weight plus inference overhead is a Jetsam trap during Night Shift.

**Resolution:** Deep Thinker uses **Qwen2.5-3B-Instruct Q4_K_M** (~2 GB) — materially better emergent ontology than Phi-3-mini without phone-tier Jetsam risk.

**Future (tablet tier):** Optional iPad-only tier (e.g. Llama-3-8B **Q3_K_M** ~3 GB, or M-series iPad only) with `deviceHint: 'recommended-high-ram'` and hard tablet detection via `expo-device`.

#### Device warnings (soft, platform-agnostic)

`deviceHint: 'recommended-high-ram'` entries show a dismissible sheet before download:

> *"This model works best on newer phones and tablets with 8 GB or more RAM. It may be slow or unstable on older devices."*

No iPhone-specific model names. User can proceed after acknowledging — **no hard block** in this release.

### 4.4 Download Service

**API:** Expo SDK 56 `DownloadTask` from `expo-file-system` (modern `File` / `Paths` API — **not** deprecated top-level `createDownloadResumable`, which throws at runtime).

```typescript
import { DownloadTask, File, Paths } from 'expo-file-system';

const dest = new File(Paths.document, manifest.filename);
const task = new DownloadTask(manifest.hfUrl, dest, {
  headers: { 'User-Agent': buildUserAgent() },
  onProgress: (p) => { /* bytesWritten / totalBytes */ },
});
await task.downloadAsync();
```

**User-Agent (required):** Hugging Face may rate-limit anonymous or generic agents.

```typescript
function buildUserAgent(): string {
  // e.g. "CuratedJournal/1.0 (Expo; ios)" or "CuratedJournal/1.0 (Expo; android)"
  return `CuratedJournal/${Application.nativeApplicationVersion ?? '1.0'} (Expo; ${Platform.OS})`;
}
```

Pass via `DownloadTaskOptions.headers`. Re-attach on `DownloadTask.fromSavable()` restore.

**Pause / resume:**

1. `await task.pauseAsync()` → `task.savable()` → persist `DownloadPauseState` to SQLite.
2. On relaunch: `DownloadTask.fromSavable(savedState, { headers, onProgress })` → `resumeAsync()`.

**SecureStore keys** (extend `src/lib/entityStorage.ts`):

| Key | Value |
|-----|-------|
| `curated_journal_model_path` | Existing — absolute URI to active `.gguf` |
| `curated_journal_model_id` | `CuratedModelId` or `'custom'` for imports |
| `curated_journal_display_name` | Optional journal display name from download screen |

**Persistence table** (`model_download_state` — app-owned SQLite, alongside `chat_messages`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | singleton row `id = 1` |
| `model_id` | TEXT | `CuratedModelId` |
| `pause_state_json` | TEXT | serialized `DownloadPauseState` |
| `status` | TEXT | `idle` \| `downloading` \| `paused` \| `failed` |
| `updated_at` | TEXT | ISO timestamp |

URLs and byte offsets are **not** secrets — SQLite is appropriate (not SecureStore).

### 4.5 `modelHubMachine` (XState v5)

App-local machine at `src/machines/modelHubMachine.ts`, patterned after `journalWikiMachine`.

**States:**

```text
selecting → confirmingNetwork → downloading → verifying → smokeTest → complete
                ↓                    ↓
           awaitingWifi          paused
                ↓                    ↓
           cellularConfirm       downloading (resume)
                ↓
              failed
```

**Events (representative):**

| Event | Transition |
|-------|------------|
| `SELECT_MODEL` | `selecting` → `confirmingNetwork` |
| `NETWORK_WIFI` | → `downloading` |
| `NETWORK_CELLULAR` | → `cellularConfirm` (UI alert) → `downloading` on confirm |
| `NETWORK_OFFLINE` | stay; UI disabled |
| `DOWNLOAD_PROGRESS` | update context |
| `PAUSE` | `downloading` → `paused` |
| `RESUME` | `paused` → `downloading` |
| `DOWNLOAD_COMPLETE` | → `verifying` |
| `VERIFY_OK` | → `smokeTest` |
| `SMOKE_OK` | → `complete` |
| `FAIL` | → `failed` |
| `IMPORT_CUSTOM` | side exit to document-picker flow |
| `RETRY` | `failed` → `downloading` or `selecting` |
| `APP_BACKGROUND` | `downloading` → `paused` (auto, via `AppState`) |
| `APP_FOREGROUND` | `paused` (if paused by `APP_BACKGROUND`) → `downloading` (auto resume) |

**Context:** `{ modelId, progress, error, pauseState }`.

### 4.6 Bootstrap & Navigation

```text
RootLayout
  ├─ getModelPath() valid?
  │     → WikiProvider + main Stack (existing)
  ├─ model_download_state.status in (downloading, paused)?
  │     → ModelHubStack → resume download screen
  └─ else
        → ModelHubStack (blocks WikiProvider; no mock LLM)
```

**New routes:**

```text
src/app/
  model-hub/
    _layout.tsx           # ModelHubStack
    index.tsx             # Choose Your AI
    download.tsx          # Progress + tips + optional profile
    import.tsx            # Custom .gguf (reuses document-picker logic)
```

`expo-router` redirect guard in root `_layout.tsx`: if no `modelPath`, render `ModelHubStack` instead of wiki bootstrap spinner.

### 4.7 Network Gate

Package: `expo-network` (SDK 56 bundled module).

```typescript
import * as Network from 'expo-network';

const state = await Network.getNetworkStateAsync();
```

| Condition | Behavior |
|-----------|----------|
| `isConnected && type === WIFI` | Proceed to download |
| `isConnected && type === CELLULAR` | Show confirmation: *"Download over cellular (warning: large file)"* — two-step alert before proceed |
| `!isConnected` | Block with *"Connect to Wi-Fi to continue"*; Resume disabled |

Re-check network on Resume if last failure was network-related.

### 4.8 File Verification

On `DOWNLOAD_COMPLETE`:

1. `dest.exists` must be true.
2. **Exact byte match:** `dest.size === manifest.sizeBytes`.

No SHA-256 in this release. Rely on Expo download transfer integrity + exact size match. Mismatch → delete partial file → `failed` state → offer Retry or Import custom.

`sizeBytes` in manifest must be updated when pinning a new HF file revision (document in manifest comment with HF commit SHA).

**Manifest/upstream drift:** If a repo owner silently rewrites the pinned `main` `.gguf` (same filename, different bytes — e.g. a quant bugfix) without us re-pinning, every download fails byte verification until we ship a new `modelManifest.ts`. There is **no on-device bypass** of the size check — a silent bypass would defeat the entire purpose of G7 (skipping multi-GB hashing in favor of *some* integrity signal) and let a corrupt or tampered download through. Mitigation is process, not a fallback code path:

1. **Detect early:** CI runs a scheduled job (e.g. weekly) that `HEAD`s each catalog `hfUrl` and diffs `Content-Length` against `manifest.sizeBytes`. A mismatch opens an issue before users hit it.
2. **Ship the fix as a normal app update:** bump `modelManifest.ts` with the new `sizeBytes` + HF commit SHA, release through the App Store / Play Store. No emergency/expedited process needed in the common case since the existing install keeps working (only *new* downloads of that model fail) — this is not a crash-level incident.
3. **User escape valve (already exists, not new):** a user who repeatedly fails verification on a curated model can use **Import custom .gguf** (§4.11) with the same already-downloaded file moved into place manually, or a fresh download — that path has no `sizeBytes` check and is gated only by the smoke test (§4.9). This is the de facto fallback; it does not require any change to the verification logic itself.

### 4.9 Post-Download Smoke Test

Before `setModelPath()` and onboarding complete:

1. `initLlama` with manifest `llamaConfig`.
2. Single short completion (≤ 10 tokens, e.g. system: "Reply with OK", user: "Go").
3. On success → persist path, clear `model_download_state`, navigate to journal tutorial.
4. On OOM / load failure → delete downloaded file, return to `selecting` with message: *"This model could not run on your device. Try Fast & Light or import a custom model."*

Catches corrupt downloads **and** devices that mmap but cannot sustain inference.

### 4.10 Change AI Model Flow

**Settings → Change AI model** re-enters Model Hub.

**Storage sequencing (required):**

1. Show warning: *"This will delete your current model immediately. You will not be able to use the AI until the new download completes."*
2. On confirm: **delete existing GGUF file first** (`File.delete()`), clear `modelPath` in SecureStore, then start `modelHubMachine` for the new selection.
3. Never download the new model while the old file occupies disk — avoids needing 2× model size free space mid-switch.

Wiki and journal data are **not** deleted — only the weight file.

### 4.11 Custom Import Escape Hatch

Footer link on Choose Your AI: *"Import custom .gguf"*

Reuses the existing document-picker flow (`expo-document-picker` → copy to `Paths.document` → `setModelPath`). Skips HF download but still runs smoke test before completing onboarding.

No byte-count verification for custom imports (unknown size) — smoke test is the gate.

### 4.12 Keep-Awake & Foreground

- `activateKeepAwakeAsync('model-download')` on `/model-hub/download` mount.
- `deactivateKeepAwake('model-download')` on unmount or completion.
- Download UI warns: *"Keep this screen open for the fastest download."*

**iOS app-suspension trap:** Backgrounding does not "slow" a `DownloadTask` — iOS suspends the JS thread and severs foreground sockets within ~5–10s. `expo-keep-awake` only prevents screen-lock while on-screen; it has no effect once backgrounded. Treat background as a hard pause boundary, not a degraded-throughput state:

- Wire `AppState` (`react-native`) into `modelHubMachine`.
- On `AppState` → `inactive` / `background` while `downloading`: dispatch `APP_BACKGROUND` → `task.pauseAsync()` → persist `DownloadPauseState` to SQLite (same path as manual `PAUSE`).
- On `AppState` → `active`: dispatch `APP_FOREGROUND` → if the machine was paused by `APP_BACKGROUND` (not by manual user `PAUSE`), automatically `task.resumeAsync()`. Track this distinction in context (e.g. `pausedReason: 'user' | 'background'`) so a manually-paused download does not auto-resume just because the app returned to foreground.

### 4.13 Disk-Full Handling

`modelDownloadService` must explicitly catch file-system write failures during an active download, not just network errors (§7.2):

- Platform write errors (`ENOSPC` on Android, `NSFileWriteOutOfSpaceError` on iOS) surface from the underlying `DownloadTask` write, typically mid-transfer after the HTTP request itself already succeeded.
- Catch these distinctly from network failures in the service layer; map both to `FAIL` but with a specific `context.error` code (`'disk-full'` vs `'network'`) so the `failed` state can render targeted copy.
- `failed` state UI for `disk-full`: *"Not enough storage space. Please free up at least 3GB and try again."* (3 GB ≈ largest catalog entry + headroom, not bound to the literal file remaining.)
- Delete the partial file on disk-full failure (same cleanup as byte-mismatch in §4.8) — do not leave a truncated `.gguf` occupying the space the user is trying to free.

---

## 5. UI Specifications

### 5.1 Choose Your AI (`/model-hub`)

- Full-bleed layout; hero title **"Choose Your AI"**; subtitle explaining offline privacy.
- Two model cards: name, tagline, size badge, device hint badge if applicable.
- Tap card → soft warning sheet (if `deviceWarning`) → network confirmation step.
- Footer text link: **Import custom .gguf**.
- No skip button. No mock/demo mode.

### 5.2 Download Screen (`/model-hub/download`)

- Determinate progress bar: `bytesWritten / totalBytes` (handle `totalBytes === -1` with indeterminate fallback + copy).
- Download speed and estimated time remaining (ETA): in `onProgress`, sample `(bytesWritten, timestamp)` against the previous sample to compute current Mbps (smoothed, e.g. rolling average over last 3–5 samples to avoid jitter); derive ETA from remaining bytes / current rate. Display as *"15 MB/s — ~2 mins remaining"*. A 2 GB download on mediocre Wi-Fi can run 15+ minutes — a bare progress bar that barely moves reads as frozen and invites force-quits.
- Primary: **Pause** / **Resume** toggle.
- Rotating tips carousel (Reanimated cross-fade):
  - Night Shift runs librarian while charging.
  - Emergent graph invents types during maintenance.
  - OKF export for portable backups.
- Optional field: **Journal display name** (SecureStore; does not block completion).
- Error states: Paused, Failed (with Retry), Offline.

### 5.3 Onboarding Complete

- Brief success animation.
- Navigate to empty journal tutorial card (existing flow).
- Wiki bootstrap uses `createLlamaProvider` with manifest `llamaConfig` for selected model id.

---

## 6. Package Dependencies (additions)

| Package | Role |
|---------|------|
| `expo-network` | Wi-Fi / cellular detection |
| `expo-application` | `nativeApplicationVersion` for User-Agent |
| `expo-keep-awake` | Already present — extend to download screen |
| `expo-file-system` | Already present — `DownloadTask`, `File`, `Paths` |
| `expo-device` | Optional future tablet-tier detection |

---

## 7. Key Workflows

### 7.1 First Launch (happy path)

1. Splash → no `modelPath` → `/model-hub`.
2. User selects **Fast & Light** → Wi-Fi confirmed → `/model-hub/download`.
3. `DownloadTask` runs with User-Agent header; keep-awake active; tips shown.
4. Download completes → `dest.size === sizeBytes` → smoke test passes.
5. `setModelPath`, `setSelectedModelId('fast-light')` → wiki bootstrap → journal home.

### 7.2 Interrupted Download

1. Network drop, app backgrounded (`APP_BACKGROUND`, §4.12), or user taps Pause → `pauseAsync()` → save `DownloadPauseState` to SQLite.
2. User relaunches app, or app returns to foreground (`APP_FOREGROUND` auto-resumes if paused for that reason) → resume screen with progress preserved.
3. Tap **Resume** → `DownloadTask.fromSavable()` → `resumeAsync()`.
4. Disk-full mid-download (§4.13) is **not** resumable — partial file is deleted, machine goes to `failed` with disk-full copy; user must free space and restart the download from `selecting`.

### 7.3 Cellular Override

1. User on cellular → blocked until tapping **Download over cellular**.
2. Alert warns of data usage → confirm → download proceeds.

### 7.4 Change Model

1. Settings → **Change AI model** → warning alert.
2. Confirm → delete old GGUF → clear path → Model Hub → select new → download.

### 7.5 Custom Import

1. **Import custom .gguf** → document picker → copy to sandbox.
2. Smoke test → set path → main app (no `sizeBytes` check).

---

## 8. Security & Privacy

- GGUF downloads are public HF URLs; no API keys in app.
- Downloaded weights stay in app sandbox (`Paths.document`).
- User-Agent identifies the app; no user PII in headers.
- Custom imports treated as untrusted binaries; smoke test limits blast radius.

---

## 9. Testing Strategy

### 9.1 Automated (CI)

| Layer | Approach |
|-------|----------|
| `modelHubMachine` | XState v5 `createActor` + `waitFor` — select → wifi → progress → verify → smoke → complete |
| `networkGate` | Mock `expo-network` — wifi / cellular / offline branches |
| `modelDownloadStorage` | Round-trip `DownloadPauseState` JSON to SQLite |
| `buildUserAgent` | Snapshot test |
| Byte verification | Unit test: mock `File.size` vs `manifest.sizeBytes` |
| `AppState` pause/resume | Mock `AppState` change events — `background` while `downloading` → `paused` (`pausedReason: 'background'`); `active` → auto `RESUME`; verify manual-`PAUSE` state does **not** auto-resume on foreground |
| Disk-full handling | Mock service-layer write throwing `ENOSPC`/`NSFileWriteOutOfSpaceError` → `failed` with `error.code === 'disk-full'`; assert partial file deleted |
| `DownloadTask` | **Mocked at service boundary** — do not hit HF in CI |

Mock LLM provider remains for wiki/chat unit tests only — not mounted in production `RootLayout`.

### 9.2 On-Device Jetsam Soak (manual QA gate)

Simulators **do not** enforce iOS Jetsam. Physical devices are required before shipping manifest URLs.

#### Reference device matrix

| Tier | Example | Purpose |
|------|---------|---------|
| **Floor** | 4 GB RAM Android budget phone | Worst-case phone |
| **Mid** | 6 GB phone | Typical user |
| **Ceiling** | 8 GB flagship phone + one iPad | Upper bound |

Document results in `docs/qa/model-hub-device-matrix.md` (manual artifact).

#### Soak protocol (per model, per device — 3 consecutive runs)

**Setup:** Import or ingest **50 markdown notes** (~500 words each) so Night Shift librarian has realistic work.

**Run:**

1. Complete Model Hub onboarding with target model.
2. Confirm post-download smoke test passed on this device.
3. Plug in → start **Night Shift** (full `librarian` → `heal` queue).
4. Keep screen on until completion.
5. Repeat steps 3–4 twice more **without** cold-restarting the app between runs 2 and 3.

**Pass:** All 3 runs complete; no silent relaunch; no Jetsam in device logs.

**Worst-case variant (once per tier):** Background app 10s mid-librarian → return to foreground → finish run.

**Failure signals:**

- App relaunches on resume with no crash dialog (iOS Jetsam).
- iOS: Xcode Device Logs → `JetsamEvent` for bundle ID.
- Android: `lowmemorykiller` / process death in logcat.

#### Instrumentation

- **iOS:** Xcode Instruments → Allocations during Night Shift; note peak resident size. If > ~2.5 GB on floor phone, tune manifest (`contextSize` 2048, `useMlock: false`).
- **Android:** Android Studio Memory Profiler during librarian pass.

#### Manifest tuning loop (if soak fails)

1. Lower `contextSize` for failing model (4096 → 2048).
2. Set `useMlock: false` in `llamaConfig`.
3. Reduce `nGpuLayers` on Android.
4. Re-run soak; do not ship until floor tier passes 3/3.

### 9.3 Acceptance Criteria

- [ ] Main app unreachable without valid model (curated or custom import).
- [ ] Wi-Fi gate blocks cellular without explicit confirmation.
- [ ] `DownloadTask` pause/resume survives app restart via SQLite `DownloadPauseState`.
- [ ] Completed download verified with `dest.size === manifest.sizeBytes`.
- [ ] Backgrounding the app during an active download pauses it via `AppState`; returning to foreground auto-resumes only if paused for that reason (not a manual pause).
- [ ] Disk-full write failure during download yields `failed` with disk-full-specific copy and deletes the partial file.
- [ ] Custom User-Agent sent on all HF requests.
- [ ] Change-model flow deletes old GGUF **before** new download starts.
- [ ] Post-download smoke test runs before `setModelPath`.
- [ ] Deep Thinker (Qwen2.5-3B) completes 3 consecutive Night Shift soaks on floor-tier physical device without Jetsam kill.
- [ ] No Llama-8B or > 3 GB catalog entry on phone tier in this release.
- [ ] Mock LLM not mounted in production `RootLayout`.

---

## 10. Milestones

| Phase | Deliverable |
|-------|-------------|
| M1 | `modelManifest.ts`, `modelHubMachine`, SQLite download state |
| M2 | Choose Your AI + network gate UI |
| M3 | `DownloadTask` service + progress screen + keep-awake |
| M4 | Verification + smoke test + bootstrap gate |
| M5 | Change-model flow + Settings update; remove production mock LLM |
| M6 | Manual device matrix QA + manifest URL pin with exact `sizeBytes` |

---

## 11. Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Model hosting | Hugging Face `resolve/main` direct URLs | Zero infra; community standard; LFS supports Range resume. |
| First launch | Required download; no skip | Predictable UX; no demo/mock in production. |
| Device gating | Soft warning; platform-agnostic copy | User choice; avoid false negatives on capable older devices. |
| Resume API | Expo SDK 56 `DownloadTask` + SQLite `DownloadPauseState` | Modern File API; native Range handling; testable persistence. |
| Deep Thinker model | Qwen2.5-3B Q4_K_M, not Llama-8B | Jetsam safety on phones during Night Shift. |
| Integrity check | Exact `sizeBytes` match | Pragmatic for this release; no 4 GB SHA-256 on CPU. |
| HF rate limits | Custom `User-Agent: CuratedJournal/{version} (Expo; {os})` | Netiquette; reduces anonymous throttling. |
| Change model | Delete old file before new download | Prevents 2× disk requirement mid-switch. |
| Download API | `DownloadTask` not legacy `createDownloadResumable` | SDK 56 deprecates legacy imports; throws at runtime from main entry. |
| Background download | Hard pause via `AppState`, auto-resume on foreground | iOS suspends JS thread + sockets within ~5–10s backgrounded; no soft "slows down" middle ground. |
| Disk-full mid-download | Distinct `disk-full` error code; delete partial file; no auto-retry | `ENOSPC`/`NSFileWriteOutOfSpaceError` is not resumable like a network drop. |
| Upstream manifest drift (`sizeBytes`) | No on-device bypass of byte check; fix via normal app-store release + CI drift detector; **Import custom .gguf** is the existing user-facing fallback | A silent bypass defeats G7's integrity purpose; this isn't a crash-level incident since existing installs keep working. |

---

## 12. References

- [Expo SDK 56 — FileSystem / DownloadTask](https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/)
- [Expo SDK 56 — Network](https://docs.expo.dev/versions/v56.0.0/sdk/network/)
- [Curated Journal demo app spec](./2026-06-24-curated-journal-demo-app.md)
- [llama.rn](https://github.com/mybigday/llama.rn)
- Hugging Face direct download URL format: `https://huggingface.co/{repo}/resolve/main/{file}`
