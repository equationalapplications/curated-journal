# Curated Journal — Technical Specification

Date: 2026-06-24  
Status: Implemented
Working title: **Curated Journal**  
Repository: `equationalapplications/curated-journal`  
Target platform: Expo SDK 56 (React Native 0.85, React 19)

---

## 1. Problem Statement

Developers evaluating the `@equationalapplications/expo-llm-wiki` ecosystem lack a **reference mobile application** that demonstrates how to build a privacy-first, fully offline "second brain" on iOS and Android. Existing demos (ScopeLab, WikiDemo) target the web or omit critical mobile constraints:

- **OS memory limits.** iOS Jetsam terminates background processes that hold large GGUF weights or run long SQLite + LLM maintenance passes. A naive "run librarian in the background" approach crashes or silently fails.
- **Battery cost.** `runLibrarian` and `runHeal` invoke repeated on-device inference and large transactional writes. Running them opportunistically drains battery and competes with foreground UX.
- **Interoperability gap.** OKF v0.1 bundles are the lingua franca for portable knowledge, but mobile import/export requires fast zip extraction (JSI/Nitro), chunked SQLite ingestion, and share-sheet handoff — none of which are documented end-to-end for Expo.
- **Graph UX gap.** Emergent ontology mode dynamically invents `node_types` and `edge_types` during maintenance, but no mobile demo visualizes that self-organizing graph at 60fps.

**Curated Journal** closes these gaps: a flagship open-source Expo app that is simultaneously a practical personal journal and a canonical integration sample for offline LLM memory on mobile.

---

## 2. Goals

| ID | Goal |
|----|------|
| G1 | **100% offline operation** — zero backend, zero network requirement after initial model download. All memory in local SQLite via `@equationalapplications/expo-llm-wiki`. |
| G2 | **BYOI inference** — on-device GGUF execution through `llama.rn`, wrapped to satisfy the `LLMProvider.generateText` contract. v1 uses MiniSearch keyword retrieval only (no second embedding GGUF). |
| G3 | **NotebookLM-style UX** — split-pane journal + synthesis chat with tappable citations that scroll to source notes. |
| G4 | **Safe maintenance** — foreground "Night Shift" / "Librarian Mode" for heavy `runLibrarian` / `runHeal` work, gated on charging and keep-awake. |
| G5 | **OKF portability** — import/export zipped OKF v0.1 bundles using `@equationalapplications/core-okf` + wiki `parseOkfBundle` / `formatOkfBundle`. |
| G6 | **Emergent ontology showcase** — default every journal entity to `mode: 'emergent'` and visualize invented types in a Skia + D3 graph explorer. |
| G7 | **Reference quality** — readable source, documented architecture, suitable for conference demos and ecosystem onboarding. |

---

## 3. Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Cloud sync, accounts, or multi-device replication | Out of scope for v1; `@equationalapplications/prisma-outbox` may be referenced in docs but not implemented. |
| NG2 | Background fetch / silent maintenance | Violates G4; OS will kill or throttle. |
| NG3 | Bundled GGUF weights in the app store binary | Models are BYOI — user sideloads or downloads to app sandbox; keeps binary small and licensing clear. |
| NG4 | Web parity for graph explorer or Night Shift | Web build may render read-only journal; Skia graph and llama.rn are native-first. |
| NG5 | Real-time collaborative editing | Single-user local journal only. |
| NG6 | Custom ontology taxonomy editor (strict mode UI) | v1 focuses on emergent mode; strict mode is supported by the engine but not exposed in settings. |
| NG7 | Automatic model download from remote registry | User picks a local `.gguf` via document picker; no CDN coupling. |
| NG8 | Local embedding GGUF in v1 | Running two GGUF models simultaneously spikes RAM and OOM risk; defer to v1.1. |

---

## 4. System Architecture

### 4.1 Layered Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                     UI Layer (expo-router)                       │
│  Journal │ Chat/Synthesis │ Graph Explorer │ Night Shift │ I/O  │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
┌───────────────▼───────────────┐   ┌───────────▼─────────────────┐
│   App Orchestration           │   │   Presentation Helpers       │
│   journalWikiMachine (XState) │   │   formatGraphContext         │
│   useEntityStatus             │   │   CitationParser / ScrollSync│
│   useWikiMaintenance          │   │   SkiaGraphCanvas + d3-force │
└───────────────┬───────────────┘   └───────────┬─────────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼─────────────────┐
│              @equationalapplications/expo-llm-wiki                 │
│   WikiProvider → WikiMemory (expo-sqlite)                        │
│   read / write / ingestDocument / runLibrarian / runHeal         │
│   exportDump / importDump / traverseGraph / setOntologyManifest  │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
┌───────────────▼───────────────┐   ┌───────────▼─────────────────┐
│   llama.rn LLM Adapter        │   │   File / OKF Pipeline        │
│   LLMProvider.generateText    │   │   expo-document-picker       │
│   (no embed in v1)            │   │   react-native-nitro-unzip   │
│                               │   │   react-native-zip-archive   │
│                               │   │   expo-file-system           │
│                               │   │   @equationalapplications/   │
│                               │   │     core-okf + parseOkfBundle│
└───────────────────────────────┘   └─────────────────────────────┘
```

### 4.2 State Orchestration (`journalWikiMachine`)

The ecosystem package exports `WikiProvider`, `useWiki`, `useWikiMaintenance`, and `useEntityStatus` — not a `useWikiMachine` hook. Curated Journal defines an **app-local XState machine** (`src/machines/journalWikiMachine.ts`), patterned after Clanker's `wikiMachine`, to serialize conflicting wiki operations and drive Night Shift queue progress.

**Responsibilities:**

- Single-flight guard: reject overlapping `INGEST`, `LIBRARIAN`, `HEAL`, `IMPORT`, `EXPORT` while `WikiBusyError` would fire.
- Night Shift queue: ordered `{ operation: 'librarian' | 'heal' | 'reembed' | 'prune', entityId }[]` executed sequentially on the foreground Night Shift screen.
- Surface `EntityStatus` transitions to UI via `useEntityStatus(entityId)` subscription (ingesting / librarian / heal flags from the wiki engine).
- Emit structured events for progress UI (`QUEUE_STEP_START`, `QUEUE_STEP_DONE`, `QUEUE_ABORT`).

**Package hooks used directly (not via machine):**

| Hook | Usage |
|------|-------|
| `WikiProvider` | Root layout wraps app after `createWiki()` + `wiki.setup()`. |
| `useMemoryRead` | Chat retrieval + journal search. |
| `useWikiWrite` | Quick capture from journal editor. |
| `useWikiIngest` | Markdown file / paste ingestion. |
| `useWikiMaintenance` | `runLibrarian`, `runHeal`, `runPrune`, `runReembed` invoked by machine actors. |
| `useWikiExport` | OKF export pipeline entry. |
| `useEntityStatus` | Night Shift + global status chip. |
| `useOntologyManifest` / `useSetOntologyManifest` | Graph explorer legend + bootstrap. |
| `useWikiTraversal` | Chat context expansion + graph focus. |

### 4.3 Entity Model

One **Journal** maps to one wiki `entity_id` (UUID v4 generated on first launch, persisted in `expo-secure-store` or SQLite meta table).

| Concept | Storage | Notes |
|---------|---------|-------|
| Journal entries | Wiki facts with `source_type: 'immutable_document'` or user writes | Rendered as markdown in left pane. |
| Synthesis chat turns | SQLite `chat_messages` table (app-owned, not wiki) | User/assistant messages; assistant carries citation metadata. Queryable for backup and future synthesis into permanent facts. |
| Ontology | `wiki.setOntologyManifest(entityId, null, { mode: 'emergent' })` on bootstrap | Empty manifest + emergent mode lets LLM invent types during librarian. |
| GGUF model path | `expo-file-system` documentDirectory + SecureStore pointer | Validated on Night Shift entry. |

### 4.4 Memory & Battery Constraints

| Constraint | Mitigation |
|------------|------------|
| iOS Jetsam (~1.5–2 GB practical for foreground) | Quantized GGUF default (Q4_K_M); unload llama context when leaving chat/Night Shift; graph renders node cap (≤ 200 visible). |
| SQLite write lock during `importDump` | Chunked transactions (see §7.3); `requestAnimationFrame` yield between chunks; progress bar on import screen. |
| LLM latency | Stream tokens to chat UI where llama.rn supports streaming; Night Shift shows indeterminate + phase labels, not per-token. |
| Thermal throttling | Night Shift requires `expo-battery` `PowerState.CHARGING`; show dismissible warning if unplugged mid-run. |
| Screen sleep | `expo-keep-awake` (`activateKeepAwakeAsync` / `deactivateKeepAwake`) on Night Shift route only; deactivated on blur/unmount. |

### 4.5 Navigation (expo-router)

```text
src/app/
  _layout.tsx              # WikiProvider, theme, model bootstrap
  (tabs)/
    _layout.tsx            # Bottom tabs: Journal, Graph, Settings
    index.tsx              # Journal home (list → entry)
    graph.tsx              # Graph Explorer (Feature D)
    settings.tsx           # Model path, export/import, Night Shift entry
  entry/[factId].tsx       # Single note reader (markdown)
  night-shift.tsx          # Full-screen modal (Feature A)
  import.tsx               # OKF import progress (Feature C)
```

**Split-pane (Feature B):** On tablet / landscape (`useWindowDimensions`, width ≥ 768), `index.tsx` renders a two-column `View`: left `JournalPane`, right `SynthesisPane`. Phone portrait stacks panes with swipe or tab toggle.

### 4.6 LLM Adapter (`llama.rn`)

```typescript
// src/lib/llamaProvider.ts — conceptual contract
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';

export function createLlamaProvider(config: {
  modelPath: string;
  contextSize?: number;   // default 4096
  nGpuLayers?: number;    // platform-specific
}): LLMProvider {
  return {
    generateText: async ({ systemPrompt, userPrompt }) => {
      // llama.rn completion; return raw string (JSON when wiki prompts require it)
    },
    // v1: omit `embed` — wiki falls back to MiniSearch keyword retrieval.
    // v1.1: optional separate embedding GGUF once single-model pipeline is stable.
  };
}
```

**Lifecycle:** Load model lazily on first inference; release on `AppState` `background` unless Night Shift active. Surface load errors in Settings → Model. **v1 runs exactly one GGUF at a time** — never load an embedding model alongside the chat/librarian model.

---

## 5. Package Dependencies

### 5.1 Required — Ecosystem

| Package | Version (target) | Role |
|---------|------------------|------|
| `@equationalapplications/expo-llm-wiki` | `^4.17.0` | SQLite memory engine + React hooks |
| `@equationalapplications/core-llm-wiki` | `^4.17.0` | Types, `formatGraphContext`, `parseOkfBundle`, `formatOkfBundle` |
| `@equationalapplications/core-okf` | `^4.17.0` | OKF v0.1 primitives (via core-llm-wiki re-export) |

### 5.2 Required — Expo SDK 56

| Package | Role |
|---------|------|
| `expo` ~56.0.12 | Runtime |
| `expo-router` ~56.2.x | File-based routing, split layouts |
| `expo-sqlite` | Wiki database (peer of expo-llm-wiki) |
| `expo-file-system` | Cache dirs, recursive `.md` read, temp export trees |
| `expo-document-picker` | `.zip` / `.gguf` selection |
| `expo-sharing` | Share exported OKF zip |
| `expo-battery` | Night Shift charging gate |
| `expo-keep-awake` | Prevent sleep during maintenance (`activateKeepAwakeAsync` / `deactivateKeepAwake`) |
| `expo-secure-store` | Persist entity id + model path |
| `expo-haptics` | Citation tap feedback (optional polish) |

### 5.3 Required — Inference & I/O

| Package | Role |
|---------|------|
| `llama.rn` | On-device GGUF inference (JSI) |
| `react-native-nitro-unzip` | **Import only** — fast zip → cache extraction via JSI/Nitro (avoids bridge memory spikes) |
| `react-native-zip-archive` | **Export only** — assemble + compress OKF text files (lower Jetsam risk than nested extraction) |

### 5.4 Required — UI & Graph

| Package | Role |
|---------|------|
| `@shopify/react-native-skia` | 60fps graph rendering |
| `d3-force` | Force simulation (runs on JS thread; positions fed to Skia) |
| `react-native-markdown-display` | Journal entry rendering |
| `react-native-gesture-handler` | Graph pan/zoom, split-pane drag |
| `react-native-reanimated` | Pane transitions, Night Shift ambient animations |
| `react-native-safe-area-context` | Already in template |
| `@xstate/react` + `xstate` ^5.x | `journalWikiMachine` |

### 5.5 Dev / Tooling

| Package | Role |
|---------|------|
| `typescript` ~6.0.x | Strict mode |
| `expo-dev-client` | Required for native modules (llama.rn, nitro-unzip, skia) |

### 5.6 Explicitly Excluded

- Firebase, Supabase, any HTTP client for core flows
- `@google/generative-ai` or cloud LLM SDKs
- `expo-background-fetch`
- `@xstate/test` — deprecated; targets XState v4 only. Machine tests use XState v5 `createActor` + `waitFor` instead.

---

## 6. Feature Specifications

### 6.A — Night Shift Maintenance UI

#### Problem

`runLibrarian` and `runHeal` perform unbounded LLM + SQLite work. iOS/Android background execution limits (few seconds CPU, no guaranteed completion, aggressive Jetsam under memory pressure) make background scheduling unsuitable. Opportunistic auto-runs (`autoLibrarianThreshold`, `autoHealThreshold`) may trigger during active journaling and cause jank or OOM.

#### Solution

A dedicated **Night Shift** full-screen route that:

1. **Preconditions (hard gates):**
   - Device charging: `Battery.getPowerState()` → `BatteryState.CHARGING` (or `FULL`).
   - Model loaded and valid.
   - User explicitly started session (no auto-navigation).

2. **Runtime behavior:**
   - `expo-keep-awake`: `activateKeepAwakeAsync()` on mount; `deactivateKeepAwake()` on unmount.
   - `journalWikiMachine` sends `START_NIGHT_SHIFT` with queue built from:
     - Pending events count vs thresholds (librarian if ≥ `autoLibrarianThreshold`, heal if ≥ `autoHealThreshold`).
     - User-selected optional `runReembed` / `runPrune`.
   - Sequential execution: one maintenance op at a time via `useWikiMaintenance`.

3. **UI design (NotebookLM ambient):**
   - Full-bleed dark gradient; large typographic clock (`HH:mm`).
   - Phase indicator derived from `useEntityStatus(entityId)`:
     - `ingesting` → "Reading your notes…"
     - `librarian` → "Synthesizing insights…"
     - `heal` → "Healing memory graph…"
     - idle between steps → "Waiting for next pass…"
   - Sub-progress: current queue index / total (from machine context).
   - Soft pulsing progress ring (Reanimated), not determinate % (LLM duration unpredictable).
   - **Stop** button → `ABORT_NIGHT_SHIFT` (finish current op if mid-LLM-call, then exit; do not start next step).

4. **Entry points:**
   - Settings → "Run Night Shift" (disabled when not charging).
   - Banner on Journal home when `useWikiHasChanged()` + thresholds exceeded: "Your journal is ready for Night Shift."

#### Acceptance Criteria

- [ ] Maintenance never starts without charging + user consent.
- [ ] Screen stays awake for session duration.
- [ ] `useEntityStatus` drives phase copy within 500ms of engine transition.
- [ ] Abort leaves SQLite consistent (wiki engine transactional guarantees preserved).
- [ ] Auto-librarian/heal **disabled in wiki config** (`autoLibrarianThreshold: Infinity`, `autoHealThreshold: Infinity`) — all heavy work routed through Night Shift.

---

### 6.B — NotebookLM-Style Layout & Citations

#### Layout

| Breakpoint | Layout |
|------------|--------|
| Phone portrait | Tab toggle: **Notes** \| **Chat**; citation tap switches to Notes tab and scrolls. |
| Tablet / landscape (≥ 768dp) | Horizontal split: 45% JournalPane \| 55% SynthesisPane; draggable divider optional v1.1. |

**JournalPane:**

- Virtualized list of facts (`wiki.read` with empty query or dedicated list API via exported facts from last dump snapshot).
- Selected entry renders `react-native-markdown-display` with syntax highlighting disabled for v1.
- `ScrollView` ref keyed by `factId` for citation scroll-into-view.

**SynthesisPane:**

- Chat message list (app-owned storage).
- Input composer → retrieval-augmented generation flow:
  1. `useMemoryRead(entityId, userQuery, { maxResults: 8 })`.
  2. Optional anchor expansion via `useWikiTraversal(entityId, { sourceId, maxDepth: 1, maxTraversalNodes: 12, minTraversalConfidence: 'inferred' })` — **hard caps enforced in prompt builder**, not left to hook defaults.
  3. Build prompt: system + `formatGraphContext(neighborhood)` + ranked facts.
  4. `llmProvider.generateText` → assistant message.

**Context window protection:** Mobile `llama.rn` contexts are typically 2048–4096 tokens. The prompt builder MUST:

- Never exceed `maxDepth: 1` for chat-time traversal (no multi-hop expansion in v1).
- Cap `maxTraversalNodes` at **12** (config constant `CHAT_TRAVERSAL_NODE_CAP`).
- Truncate ranked facts to fit remaining token budget after system prompt + graph context (estimate ~4 chars/token; reserve 512 tokens for model output).
- Skip graph context entirely if the top retrieval hit is a highly connected hub that would exceed the cap even at depth 1 (log warning in dev builds).

#### Citation Protocol

`formatGraphContext` returns deterministic text lines:

```text
[fact] My morning routine (ID: fact_abc)
  -[inspired_by]-> [concept] Stoicism (ID: fact_def)
```

**Assistant output contract:** System prompt instructs model to cite using inline tokens:

```text
…as noted in [cite:fact_abc] …
```

**`CitationParser`** (app module):

- Exported pattern: `/\[cite:([a-zA-Z0-9_-]+)\]/g` (`CITE_REGEX`).
- `extractCitationIds` and `splitCitationSegments` iterate via a private `citeMatches()` helper that instantiates `new RegExp(CITE_REGEX.source, 'g')` per call. This avoids stale `lastIndex` on the shared global regex when tests (or UI) call `CITE_REGEX.exec()` and then parse the same string.
- Renders tappable chips in assistant bubbles.
- On press: `router.setParams({ factId })` or shared context `openCitation(factId)` → JournalPane loads entry, calls `scrollTo({ y: anchorOffset })`.

**Scroll sync state:** React context `CitationNavigationContext` holds `{ targetFactId, blockAnchor? }`; JournalPane consumes and clears after scroll.

#### Acceptance Criteria

- [ ] Split pane active on iPad simulator landscape.
- [ ] Citation tap navigates to source note in < 300ms (excluding LLM).
- [ ] `formatGraphContext` output included in chat prompt when traversal returns nodes.
- [ ] v1 uses MiniSearch keyword retrieval exclusively (`LLMProvider.embed` omitted).
- [ ] Chat prompts stay within configured context budget (`maxDepth: 1`, `maxTraversalNodes: 12`).

---

### 6.C — Zipped OKF Pipeline (Import & Export)

#### Import Flow

```text
User picks .zip
    → copy to cache/import-{uuid}.zip
    → react-native-nitro-unzip.extract(zipPath, cache/import-{uuid}/)
    → walkDirectory recursively (*.md only)
    → build OkfFile[] { path: relativePosix, content: utf8 }
    → parseOkfBundle(entityId, files, { defaultSchema: 'fact' })
    → chunkedImportDump(dump, { merge: true })
    → navigate to Journal home
```

**`walkDirectory`:** `expo-file-system` `readDirectoryAsync` recursive; skip `index.md` at bundle root if duplicate of catalog.

**OKF parser expectations (`@equationalapplications/core-okf`):** The parser intentionally uses a zero-dependency subset YAML parser and regex-based link extraction — not a full markdown AST. It is a **highly compatible, best-effort** importer: complex multi-line YAML frontmatter or unusual markdown link formats from third-party apps may be gracefully skipped rather than failing the entire import.

**Import UI copy:** Display a non-blocking info callout on `/import`:

> *Complex multi-line YAML or unusual markdown link formats from other apps may be gracefully skipped during import.*

**`chunkedImportDump`:**

```typescript
async function chunkedImportDump(
  wiki: WikiMemory,
  dump: MemoryDump,
  opts: { merge: boolean; chunkSize?: number; onProgress: (pct: number) => void }
): Promise<void> {
  const chunkSize = opts.chunkSize ?? 25; // facts per transaction
  const entities = Object.entries(dump.entities);
  let processed = 0;
  const total = countItems(dump);

  for (const [entityId, bundle] of entities) {
    for (const slice of chunkBundle(bundle, chunkSize)) {
      await wiki.importDump({ version: dump.version, entities: { [entityId]: slice } }, { merge: opts.merge });
      processed += sliceItemCount(slice);
      opts.onProgress(processed / total);
      await yieldToUI(); // setImmediate + requestAnimationFrame
    }
  }
}
```

**UI (`import.tsx`):** Progress bar, file name, cancel (best-effort — finish current chunk).

**Post-import:** If emergent mode not set, call `setOntologyManifest(entityId, null, { mode: 'emergent' })`.

#### Export Flow

```text
useWikiExport.execute([entityId])
    → formatOkfBundle(dump)
    → write files to cache/export-{uuid}/entities/{entityId}/...
    → zip tree via react-native-zip-archive (export path only; nitro-unzip is import-only)
    → expo-sharing.shareAsync(zipUri, { mimeType: 'application/zip', UTI: 'com.pkware.zip-archive' })
    → cleanup temp dir after share sheet dismiss
```

**Ontology note:** `MemoryDump` does not embed ontology manifest. Export sidecar optional v1.1: write `ontology.json` beside OKF tree from `wiki.getOntologyManifest(entityId)` for round-trip fidelity; import reads it if present.

#### Acceptance Criteria

- [ ] Import 500-note OKF zip without UI freeze > 100ms per frame (chunked).
- [ ] Export re-import round-trip preserves fact bodies and markdown edges.
- [ ] Share sheet opens on iOS/Android with valid zip.

---

### 6.D — Emergent Ontology Graph Explorer

#### Bootstrap

On first wiki setup for `entityId`:

```typescript
await wiki.setOntologyManifest(entityId, { node_types: [], edge_types: [] }, { mode: 'emergent' });
```

After each Night Shift librarian pass, `useOntologyManifest(entityId)` reflects LLM-invented types.

#### Data Source

- **Nodes:** Facts/tasks with non-null `okf_type` + untyped facts (rendered as gray "note" nodes).
- **Edges:** `wiki.exportDump([entityId]).entities[entityId].edges` or dedicated traversal from `useWikiTraversal` with empty/adhoc source list — prefer bulk edge load for graph tab performance.
- **Legend:** `manifest.node_types`, `manifest.edge_types` with colors assigned by stable hash.

#### Rendering Pipeline

1. **Simulation (d3-force):** `forceSimulation` with `forceLink`, `forceManyBody`, `forceCenter`, `forceCollide` on JS thread; 300 tick warmup, then pause.
2. **Skia canvas:** Map simulation nodes `{ x, y }` → Skia circles + labels; edges as `Line` with arrowheads.
3. **Interaction:** Pinch zoom + pan (gesture-handler); tap node → bottom sheet with fact title + "Open note" / "Focus in chat."
4. **Performance cap:** If nodes > 200, render a **deterministic subset** — never a random sample:
   - Primary sort: `confidence` tier (`certain` > `inferred` > `tentative`), using the same semantics as `minTraversalConfidence`.
   - Secondary sort: `updated_at` descending (most recent first).
   - Take top 200 after sorting; show banner: *"Showing 200 most recent high-confidence notes. Run Night Shift to organize the full graph."*
   - Optionally cluster remaining nodes as a single "N more notes" ghost node at graph periphery.

#### Acceptance Criteria

- [ ] Graph tab renders at 60fps on iPhone 15 simulator with ≤ 100 nodes.
- [ ] New `edge_types` from emergent librarian appear in legend without app restart.
- [ ] Tap node opens corresponding journal entry.
- [ ] When capped, displayed nodes are the 200 highest-confidence / most-recent — not arbitrary.

---

## 7. Key UI Workflows

### 7.1 First Launch

1. Splash → permissions none required beyond file picker.
2. Generate `entityId`, persist.
3. `createWiki(db, { llmProvider, config: { autoLibrarianThreshold: Infinity, autoHealThreshold: Infinity } })`.
4. `wiki.setup()` + emergent ontology bootstrap.
5. Settings prompt: select GGUF model (optional skip — keyword-only mode).
6. Empty journal tutorial card.

### 7.2 Capture Journal Entry

1. User taps **New note** → markdown editor (minimal: title + body).
2. Save → `useWikiIngest` or `useWikiWrite` with `source_type` document semantics.
3. Entry appears in JournalPane list; no automatic LLM until Night Shift.

### 7.3 Ask the Journal (Chat)

1. User types question in SynthesisPane.
2. Retrieve memory + optional graph context.
3. Stream/display assistant reply with citation chips.
4. User taps citation → scroll to note (Feature B).

### 7.4 Run Night Shift

1. User plugs in device → Settings → **Night Shift**.
2. Preconditions checked → navigate `/night-shift`.
3. Queue executes librarian → heal → optional prune.
4. Completion → haptic + "Good morning" summary (facts synthesized count from `MaintenanceResult` / event diff).
5. Graph tab reflects new edges.

### 7.5 Import OKF Archive

1. Settings → **Import** → document picker (`.zip`).
2. `/import` progress screen.
3. Success → Journal populated.

### 7.6 Export Backup

1. Settings → **Export**.
2. Temp zip → share sheet → user saves to Files/Drive.

---

## 8. Security & Privacy

- All data stays in app sandbox (`documentDirectory`, SQLite).
- No analytics SDK in v1.
- OKF imports treated as untrusted: `importDump` already enforces size/field validation in core-llm-wiki; app caps zip uncompressed size (e.g., 200 MB) before extraction.
- GGUF path never leaves device.

---

## 9. Testing Strategy

| Layer | Approach |
|-------|----------|
| `CitationParser`, `chunkedImportDump`, OKF walkers | Jest unit tests (Node) |
| `journalWikiMachine` | XState v5 `createActor` + `waitFor` transition tests (not `@xstate/test`) |
| `formatGraphContext` integration | Snapshot tests with fixture neighborhoods |
| Night Shift gates | Mock `expo-battery` / `expo-keep-awake` |
| E2E smoke | Detox/Maestro: launch → write note → mock LLM → export zip |

Manual QA matrix: iPhone (memory pressure), iPad split-pane, Android charging detection.

---

## 10. Milestones (Suggested)

| Phase | Deliverable |
|-------|-------------|
| M1 | Wiki bootstrap, llama provider stub, journal list + editor |
| M2 | Synthesis chat + citations + split pane |
| M3 | Night Shift screen + maintenance queue |
| M4 | OKF import/export zip pipeline |
| M5 | Skia graph explorer + emergent ontology legend |
| M6 | Polish, README, demo recording assets |

---

## 11. Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Zip creation API | **Import:** `react-native-nitro-unzip` (JSI/Nitro extraction). **Export:** `react-native-zip-archive`. | Nitro unzip avoids bridge memory spikes on nested extraction; compressing flat text files for export is lower Jetsam risk and does not require Nitro. |
| Embedding model | **v1:** MiniSearch keyword fallback only — omit `LLMProvider.embed`. **v1.1:** Revisit local embeddings once single-model inference is stable. | Two simultaneous GGUF models severely spike RAM and OOM risk on mobile. |
| Chat persistence | **SQLite** `chat_messages` table (app-owned schema alongside wiki DB or separate file). | Aligns with the app's durable "second brain" identity; enables query, backup, and future promotion of chat insights into permanent wiki facts. |

---

## 12. References

- [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/)
- [`@equationalapplications/expo-llm-wiki` README](https://github.com/equationalapplications/expo-llm-wiki)
- [OKF v0.1 spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
- [Emergent ontology design (expo-llm-wiki)](https://github.com/equationalapplications/expo-llm-wiki/blob/main/docs/superpowers/specs/2026-06-23-per-entity-seeded-ontology-design.md)
- [Graph traversal API design (expo-llm-wiki)](https://github.com/equationalapplications/expo-llm-wiki/blob/main/docs/superpowers/specs/2026-06-23-graph-traversal-api-design.md)
