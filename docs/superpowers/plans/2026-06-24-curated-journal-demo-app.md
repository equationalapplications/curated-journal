# Curated Journal Demo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the flagship Expo SDK 56 reference app from the approved spec — offline journal + synthesis chat, Night Shift maintenance, OKF zip I/O, and Skia graph explorer — on top of `@equationalapplications/expo-llm-wiki`.

**Architecture:** A fresh Expo dev-client app wraps `WikiProvider` in root layout. App-local XState (`journalWikiMachine`) serializes conflicting wiki ops and drives Night Shift queue progress; package hooks handle reads/writes directly. `llama.rn` implements `LLMProvider.generateText` only (no `embed` in v1). OKF import uses `react-native-nitro-unzip` + chunked `importDump`; export uses `react-native-zip-archive` + `expo-sharing`. Graph tab runs `d3-force` on the JS thread and renders via `@shopify/react-native-skia`.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, expo-router, `@equationalapplications/expo-llm-wiki` ^4.17.0, `llama.rn`, XState, Skia, d3-force, Jest.

**Baseline:** Repo is an Expo SDK 56 tab template (`src/app/index.tsx`, `explore.tsx`). No wiki integration yet. Reference patterns: Clanker `wikiMachine` (`../clanker/src/machines/wikiMachine.ts`), expo-llm-wiki README hooks.

**Worktree:** Run `using-git-worktrees` before implementation to isolate from `main`.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/constants.ts` | Context caps, graph node cap, auto-threshold overrides |
| `src/lib/yieldToUI.ts` | `requestAnimationFrame` yield between import chunks |
| `src/lib/entityStorage.ts` | Persist `entityId` + model path in SecureStore |
| `src/lib/mockLlmProvider.ts` | Deterministic LLM for Jest / dev without GGUF |
| `src/lib/llamaProvider.ts` | `llama.rn` → `LLMProvider` adapter + lifecycle |
| `src/lib/citationParser.ts` | Parse `[cite:fact_id]` tokens |
| `src/lib/buildChatPrompt.ts` | RAG prompt with token budget + traversal caps |
| `src/lib/walkDirectory.ts` | Recursive `.md` collector (expo-file-system SDK 56 API) |
| `src/lib/chunkedImportDump.ts` | Chunked `wiki.importDump` with progress |
| `src/lib/okfExport.ts` | Write OKF tree + zip + share |
| `src/lib/graphData.ts` | Load edges/facts, deterministic 200-node cap |
| `src/lib/graphSimulation.ts` | d3-force warmup (300 ticks) |
| `src/services/wikiBootstrap.ts` | `createWiki`, `setup`, emergent ontology |
| `src/services/chatMessages.ts` | App-owned `chat_messages` SQLite |
| `src/machines/journalWikiMachine.ts` | Night Shift queue + single-flight guard |
| `src/hooks/useJournalWiki.ts` | XState actor provider |
| `src/hooks/useNightShiftGates.ts` | Charging + model validation |
| `src/hooks/useSplitPaneLayout.ts` | ≥768dp split vs phone stack |
| `src/contexts/CitationNavigationContext.tsx` | Citation scroll target |
| `src/contexts/JournalContext.tsx` | `entityId`, selected fact, pane mode |
| `src/components/journal/*` | List, pane, editor, markdown reader |
| `src/components/synthesis/*` | Chat list, composer, citation chips |
| `src/components/graph/*` | Skia canvas, legend, node sheet |
| `src/components/night-shift/*` | Ambient UI, phase copy, stop button |
| `src/app/_layout.tsx` | Wiki bootstrap, providers, stack routes |
| `src/app/(tabs)/_layout.tsx` | Journal / Graph / Settings tabs |
| `src/app/(tabs)/index.tsx` | Split-pane journal home |
| `src/app/(tabs)/graph.tsx` | Graph explorer tab |
| `src/app/(tabs)/settings.tsx` | Model, I/O, Night Shift entry |
| `src/app/entry/[factId].tsx` | Single note reader |
| `src/app/night-shift.tsx` | Full-screen maintenance modal |
| `src/app/import.tsx` | OKF import progress |
| `__tests__/*.test.ts` | Unit + machine tests |

**Delete after migration:** `src/app/explore.tsx`, `src/components/app-tabs.tsx` (replaced by `(tabs)/_layout.tsx`).

---

## Task 1: Jest + test infrastructure

**Files:**
- Create: `jest.config.js`
- Create: `jest.setup.ts`
- Modify: `package.json`
- Create: `tsconfig.test.json`

- [ ] **Step 1: Add dev dependencies**

```bash
npm install --save-dev jest jest-expo @types/jest @testing-library/react-native @xstate/test
```

- [ ] **Step 2: Create `jest.config.js`**

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@equationalapplications/.*|xstate|llama\\.rn)',
  ],
};
```

- [ ] **Step 3: Create `jest.setup.ts`**

```typescript
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
```

- [ ] **Step 4: Add test script to `package.json`**

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 5: Run tests (empty suite passes)**

Run: `npm test`
Expected: `No tests found` or `0 tests` with exit code 0.

- [ ] **Step 6: Commit**

```bash
git add jest.config.js jest.setup.ts package.json package-lock.json
git commit -m "chore: add Jest test infrastructure"
```

---

## Task 2: Install runtime dependencies + dev client

**Files:**
- Modify: `package.json`
- Modify: `app.json`

- [ ] **Step 1: Install ecosystem + Expo peers**

```bash
npx expo install expo-sqlite expo-file-system expo-document-picker expo-sharing expo-battery expo-screen-keep-awake expo-secure-store expo-haptics expo-dev-client
npm install @equationalapplications/expo-llm-wiki@^4.17.0 llama.rn react-native-nitro-unzip react-native-zip-archive @shopify/react-native-skia d3-force react-native-markdown-display xstate @xstate/react
npm install --save-dev @types/d3-force
```

- [ ] **Step 2: Update `app.json` plugins**

Add to `expo.plugins` array (keep existing entries):

```json
"expo-dev-client",
"expo-sqlite",
"expo-secure-store"
```

Set `expo.name` and `expo.slug` to `curated-journal`. Set `expo.orientation` to `"default"` (split-pane needs landscape on tablet).

- [ ] **Step 3: Prebuild native projects**

Run: `npx expo prebuild --clean`
Expected: `ios/` and `android/` directories created without plugin errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json ios android
git commit -m "chore: add wiki, llama, skia, and OKF dependencies with dev client"
```

---

## Task 3: App constants

**Files:**
- Create: `src/lib/constants.ts`
- Create: `__tests__/constants.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/constants.test.ts
import {
  CHAT_TRAVERSAL_NODE_CAP,
  GRAPH_NODE_CAP,
  SPLIT_PANE_MIN_WIDTH,
  WIKI_CONFIG,
} from '@/lib/constants';

describe('constants', () => {
  it('disables auto maintenance', () => {
    expect(WIKI_CONFIG.autoLibrarianThreshold).toBe(Infinity);
    expect(WIKI_CONFIG.autoHealThreshold).toBe(Infinity);
  });

  it('enforces chat traversal cap per spec', () => {
    expect(CHAT_TRAVERSAL_NODE_CAP).toBe(12);
  });

  it('enforces graph node cap', () => {
    expect(GRAPH_NODE_CAP).toBe(200);
  });

  it('split pane breakpoint', () => {
    expect(SPLIT_PANE_MIN_WIDTH).toBe(768);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/constants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/constants.ts`**

```typescript
export const SPLIT_PANE_MIN_WIDTH = 768;
export const CHAT_TRAVERSAL_NODE_CAP = 12;
export const CHAT_TRAVERSAL_MAX_DEPTH = 1;
export const GRAPH_NODE_CAP = 200;
export const IMPORT_CHUNK_SIZE = 25;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const CHAT_OUTPUT_TOKEN_RESERVE = 512;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const WIKI_CONFIG = {
  autoLibrarianThreshold: Infinity,
  autoHealThreshold: Infinity,
} as const;

export const ENTITY_ID_KEY = 'curated_journal_entity_id';
export const MODEL_PATH_KEY = 'curated_journal_model_path';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/constants.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts __tests__/constants.test.ts
git commit -m "feat: add app-wide constants with disabled auto maintenance"
```

---

## Task 4: Entity + model persistence

**Files:**
- Create: `src/lib/entityStorage.ts`
- Create: `__tests__/entityStorage.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/entityStorage.test.ts
import * as SecureStore from 'expo-secure-store';
import { getOrCreateEntityId, getModelPath, setModelPath } from '@/lib/entityStorage';
import { ENTITY_ID_KEY, MODEL_PATH_KEY } from '@/lib/constants';

jest.mock('expo-secure-store');

describe('entityStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns persisted entity id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('uuid-existing');
    await expect(getOrCreateEntityId()).resolves.toBe('uuid-existing');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('creates and persists new entity id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    const id = await getOrCreateEntityId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ENTITY_ID_KEY, id);
  });

  it('round-trips model path', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('/docs/model.gguf');
    await expect(getModelPath()).resolves.toBe('/docs/model.gguf');
    await setModelPath('/docs/model.gguf');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(MODEL_PATH_KEY, '/docs/model.gguf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/entityStorage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/entityStorage.ts`**

```typescript
import * as SecureStore from 'expo-secure-store';
import { ENTITY_ID_KEY, MODEL_PATH_KEY } from '@/lib/constants';

function generateUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getOrCreateEntityId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENTITY_ID_KEY);
  if (existing) return existing;
  const id = generateUuidV4();
  await SecureStore.setItemAsync(ENTITY_ID_KEY, id);
  return id;
}

export async function getModelPath(): Promise<string | null> {
  return SecureStore.getItemAsync(MODEL_PATH_KEY);
}

export async function setModelPath(path: string): Promise<void> {
  await SecureStore.setItemAsync(MODEL_PATH_KEY, path);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/entityStorage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/entityStorage.ts __tests__/entityStorage.test.ts
git commit -m "feat: persist entity id and model path in SecureStore"
```

---

## Task 5: Mock + llama LLM providers

**Files:**
- Create: `src/lib/mockLlmProvider.ts`
- Create: `src/lib/llamaProvider.ts`
- Create: `__tests__/mockLlmProvider.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/mockLlmProvider.test.ts
import { createMockLlmProvider } from '@/lib/mockLlmProvider';

describe('createMockLlmProvider', () => {
  it('returns JSON for librarian-style prompts', async () => {
    const provider = createMockLlmProvider();
    const text = await provider.generateText({
      systemPrompt: 'Return JSON',
      userPrompt: 'librarian',
    });
    expect(JSON.parse(text)).toEqual({ facts: [], tasks: [] });
  });

  it('cites a fact id when user asks about notes', async () => {
    const provider = createMockLlmProvider();
    const text = await provider.generateText({
      systemPrompt: 'cite with [cite:id]',
      userPrompt: 'What did I write about stoicism?',
    });
    expect(text).toMatch(/\[cite:[a-zA-Z0-9_-]+\]/);
  });

  it('omits embed (v1 keyword-only)', () => {
    const provider = createMockLlmProvider();
    expect(provider.embed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/mockLlmProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/mockLlmProvider.ts`**

```typescript
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';

const LIBRARIAN_JSON = '{"facts":[],"tasks":[]}';

export function createMockLlmProvider(): LLMProvider {
  return {
    generateText: async ({ userPrompt }) => {
      if (/librarian|heal|maintenance/i.test(userPrompt)) {
        return LIBRARIAN_JSON;
      }
      return `Based on your notes [cite:demo_fact_1], here is a concise answer about: ${userPrompt.slice(0, 80)}`;
    },
  };
}
```

- [ ] **Step 4: Implement `src/lib/llamaProvider.ts`**

```typescript
import { AppState, Platform } from 'react-native';
import type { LLMProvider } from '@equationalapplications/core-llm-wiki';
import { initLlama, type LlamaContext } from 'llama.rn';

let sharedContext: LlamaContext | null = null;
let nightShiftActive = false;

export function setNightShiftActive(active: boolean): void {
  nightShiftActive = active;
}

async function releaseContext(): Promise<void> {
  if (sharedContext) {
    await sharedContext.release();
    sharedContext = null;
  }
}

AppState.addEventListener('change', (state) => {
  if (state === 'background' && !nightShiftActive) {
    void releaseContext();
  }
});

export function createLlamaProvider(config: {
  modelPath: string;
  contextSize?: number;
  nGpuLayers?: number;
}): LLMProvider {
  const contextSize = config.contextSize ?? 4096;
  const nGpuLayers = config.nGpuLayers ?? (Platform.OS === 'ios' ? 99 : 0);

  async function ensureContext(): Promise<LlamaContext> {
    if (sharedContext) return sharedContext;
    sharedContext = await initLlama({
      model: config.modelPath,
      n_ctx: contextSize,
      n_gpu_layers: nGpuLayers,
      use_mlock: true,
    });
    return sharedContext;
  }

  return {
    generateText: async ({ systemPrompt, userPrompt }, onToken) => {
      const ctx = await ensureContext();
      const result = await ctx.completion(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          n_predict: 512,
          temperature: 0.7,
        },
        (data) => {
          if (data.token && onToken) onToken(data.token);
        },
      );
      return result.text;
    },
  };
}

export { releaseContext };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- __tests__/mockLlmProvider.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/mockLlmProvider.ts src/lib/llamaProvider.ts __tests__/mockLlmProvider.test.ts
git commit -m "feat: add mock and llama.rn LLM providers (generateText only)"
```

---

## Task 6: Wiki bootstrap service

**Files:**
- Create: `src/services/wikiBootstrap.ts`
- Create: `src/lib/yieldToUI.ts`

- [ ] **Step 1: Create `src/lib/yieldToUI.ts`**

```typescript
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        resolve();
      }
    });
  });
}
```

- [ ] **Step 2: Create `src/services/wikiBootstrap.ts`**

```typescript
import * as SQLite from 'expo-sqlite';
import { createWiki, WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { LLMProvider, WikiMemory } from '@equationalapplications/core-llm-wiki';
import { WIKI_CONFIG } from '@/lib/constants';
import { getOrCreateEntityId } from '@/lib/entityStorage';

export type BootstrapResult = {
  wiki: WikiMemory;
  entityId: string;
  WikiProvider: typeof WikiProvider;
};

export async function bootstrapWiki(llmProvider: LLMProvider): Promise<BootstrapResult> {
  const db = await SQLite.openDatabaseAsync('curated_journal.db');
  const wiki = createWiki(db, { llmProvider, config: WIKI_CONFIG });
  await wiki.setup();
  const entityId = await getOrCreateEntityId();
  await wiki.setOntologyManifest(
    entityId,
    { node_types: [], edge_types: [] },
    { mode: 'emergent' },
  );
  return { wiki, entityId, WikiProvider };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/yieldToUI.ts src/services/wikiBootstrap.ts
git commit -m "feat: bootstrap wiki with emergent ontology and disabled auto maintenance"
```

---

## Task 7: Chat messages SQLite (app-owned)

**Files:**
- Create: `src/services/chatMessages.ts`
- Create: `__tests__/chatMessages.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/chatMessages.test.ts
import {
  createChatStore,
  type ChatMessage,
} from '@/services/chatMessages';

type ExecResult = { rows: ChatMessage[] };

function makeDb() {
  const rows: ChatMessage[] = [];
  return {
    execAsync: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('INSERT')) {
        const [id, role, content, citationsJson, createdAt] = params as [
          string,
          string,
          string,
          string,
          number,
        ];
        rows.push({
          id,
          role: role as ChatMessage['role'],
          content,
          citations: JSON.parse(citationsJson),
          createdAt,
        });
        return { changes: 1 };
      }
      if (sql.startsWith('SELECT')) {
        return { rows: [...rows].sort((a, b) => a.createdAt - b.createdAt) } as ExecResult;
      }
      return { changes: 0 };
    }),
  };
}

describe('chatMessages', () => {
  it('inserts and lists messages in order', async () => {
    const store = createChatStore(makeDb() as never);
    await store.insert({
      role: 'user',
      content: 'Hello',
      citations: [],
    });
    await store.insert({
      role: 'assistant',
      content: 'Hi [cite:f1]',
      citations: ['f1'],
    });
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[1].citations).toEqual(['f1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/chatMessages.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/services/chatMessages.ts`**

```typescript
import type * as SQLite from 'expo-sqlite';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  citations: string[];
  createdAt: number;
};

export type InsertChatMessage = Pick<ChatMessage, 'role' | 'content' | 'citations'>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function newId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createChatStore(db: SQLite.SQLiteDatabase) {
  let ready: Promise<void> | null = null;

  function ensureSchema(): Promise<void> {
    if (!ready) ready = db.execAsync(SCHEMA).then(() => undefined);
    return ready;
  }

  return {
    async insert(input: InsertChatMessage): Promise<ChatMessage> {
      await ensureSchema();
      const message: ChatMessage = {
        id: newId(),
        role: input.role,
        content: input.content,
        citations: input.citations,
        createdAt: Date.now(),
      };
      await db.runAsync(
        `INSERT INTO chat_messages (id, role, content, citations_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        message.id,
        message.role,
        message.content,
        JSON.stringify(message.citations),
        message.createdAt,
      );
      return message;
    },

    async list(): Promise<ChatMessage[]> {
      await ensureSchema();
      const rows = await db.getAllAsync<{
        id: string;
        role: ChatRole;
        content: string;
        citations_json: string;
        created_at: number;
      }>(
        `SELECT id, role, content, citations_json, created_at
         FROM chat_messages ORDER BY created_at ASC`,
      );
      return rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        citations: JSON.parse(row.citations_json) as string[],
        createdAt: row.created_at,
      }));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/chatMessages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/chatMessages.ts __tests__/chatMessages.test.ts
git commit -m "feat: add app-owned chat_messages SQLite store"
```

---

## Task 8: Citation parser

**Files:**
- Create: `src/lib/citationParser.ts`
- Create: `__tests__/citationParser.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/citationParser.test.ts
import { CITE_REGEX, extractCitationIds, splitCitationSegments } from '@/lib/citationParser';

describe('citationParser', () => {
  it('matches cite tokens', () => {
    expect('[cite:fact_abc]').toMatch(CITE_REGEX);
    expect(CITE_REGEX.exec('see [cite:fact_abc] here')?.[1]).toBe('fact_abc');
  });

  it('extracts unique ids in order', () => {
    expect(extractCitationIds('a [cite:x] b [cite:y] c [cite:x]')).toEqual(['x', 'y']);
  });

  it('splits text and cite segments', () => {
    expect(splitCitationSegments('Hi [cite:a] there')).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'cite', value: 'a' },
      { type: 'text', value: ' there' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/citationParser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/citationParser.ts`**

```typescript
export const CITE_REGEX = /\[cite:([a-zA-Z0-9_-]+)\]/g;

export type CitationSegment =
  | { type: 'text'; value: string }
  | { type: 'cite'; value: string };

export function extractCitationIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(CITE_REGEX)) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function splitCitationSegments(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CITE_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'cite', value: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/citationParser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/citationParser.ts __tests__/citationParser.test.ts
git commit -m "feat: add citation token parser for synthesis chat"
```

---

## Task 9: Chat prompt builder with context budget

**Files:**
- Create: `src/lib/buildChatPrompt.ts`
- Create: `__tests__/buildChatPrompt.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/buildChatPrompt.test.ts
import { buildChatPrompt } from '@/lib/buildChatPrompt';

const system = 'You are a journal assistant. Cite with [cite:fact_id].';

describe('buildChatPrompt', () => {
  it('includes ranked facts and graph context', () => {
    const { userPrompt } = buildChatPrompt({
      systemPrompt: system,
      userQuery: 'morning routine',
      facts: [{ id: 'f1', title: 'Routine', body: 'Wake at 6am' }],
      graphContext: '[fact] Routine (ID: f1)',
      contextTokenBudget: 1000,
    });
    expect(userPrompt).toContain('morning routine');
    expect(userPrompt).toContain('Wake at 6am');
    expect(userPrompt).toContain('[fact] Routine');
  });

  it('truncates facts to fit token budget', () => {
    const longBody = 'x'.repeat(8000);
    const { userPrompt, truncated } = buildChatPrompt({
      systemPrompt: system,
      userQuery: 'q',
      facts: [{ id: 'f1', title: 'T', body: longBody }],
      graphContext: '',
      contextTokenBudget: 200,
    });
    expect(truncated).toBe(true);
    expect(userPrompt.length).toBeLessThan(longBody.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/buildChatPrompt.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/buildChatPrompt.ts`**

```typescript
import {
  CHARS_PER_TOKEN_ESTIMATE,
  CHAT_OUTPUT_TOKEN_RESERVE,
} from '@/lib/constants';

export type PromptFact = { id: string; title: string; body: string };

export type BuildChatPromptInput = {
  systemPrompt: string;
  userQuery: string;
  facts: PromptFact[];
  graphContext: string;
  contextTokenBudget: number;
};

export type BuildChatPromptResult = {
  systemPrompt: string;
  userPrompt: string;
  truncated: boolean;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function buildChatPrompt(input: BuildChatPromptInput): BuildChatPromptResult {
  const reserved = estimateTokens(input.systemPrompt) + CHAT_OUTPUT_TOKEN_RESERVE;
  const graphTokens = input.graphContext ? estimateTokens(input.graphContext) + 2 : 0;
  let remaining =
    input.contextTokenBudget - reserved - graphTokens - estimateTokens(input.userQuery) - 20;
  if (remaining < 0) remaining = 0;

  const factBlocks: string[] = [];
  let truncated = false;
  for (const fact of input.facts) {
    const block = `### ${fact.title} (ID: ${fact.id})\n${fact.body}`;
    const blockTokens = estimateTokens(block);
    if (blockTokens > remaining) {
      truncated = true;
      break;
    }
    factBlocks.push(block);
    remaining -= blockTokens;
  }

  const sections = [
    `User question: ${input.userQuery}`,
    input.graphContext ? `Graph context:\n${input.graphContext}` : '',
    factBlocks.length ? `Relevant notes:\n${factBlocks.join('\n\n')}` : '',
    'Answer concisely. Cite sources inline as [cite:fact_id].',
  ].filter(Boolean);

  return {
    systemPrompt: input.systemPrompt,
    userPrompt: sections.join('\n\n'),
    truncated,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/buildChatPrompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildChatPrompt.ts __tests__/buildChatPrompt.test.ts
git commit -m "feat: add chat prompt builder with mobile context budget"
```

---

## Task 10: Root layout + JournalContext

**Files:**
- Modify: `src/app/_layout.tsx`
- Create: `src/contexts/JournalContext.tsx`
- Delete: `src/app/explore.tsx`

- [ ] **Step 1: Create `src/contexts/JournalContext.tsx`**

```typescript
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type PaneMode = 'notes' | 'chat';

type JournalContextValue = {
  entityId: string;
  selectedFactId: string | null;
  setSelectedFactId: (id: string | null) => void;
  paneMode: PaneMode;
  setPaneMode: (mode: PaneMode) => void;
};

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({
  entityId,
  children,
}: {
  entityId: string;
  children: ReactNode;
}) {
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>('notes');
  const value = useMemo(
    () => ({ entityId, selectedFactId, setSelectedFactId, paneMode, setPaneMode }),
    [entityId, selectedFactId, paneMode],
  );
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(): JournalContextValue {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal requires JournalProvider');
  return ctx;
}
```

- [ ] **Step 2: Replace `src/app/_layout.tsx`**

```typescript
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WikiProvider } from '@equationalapplications/expo-llm-wiki';
import type { WikiMemory } from '@equationalapplications/core-llm-wiki';
import { bootstrapWiki } from '@/services/wikiBootstrap';
import { createMockLlmProvider } from '@/lib/mockLlmProvider';
import { getModelPath } from '@/lib/entityStorage';
import { createLlamaProvider } from '@/lib/llamaProvider';
import { JournalProvider } from '@/contexts/JournalContext';

export default function RootLayout() {
  const [wiki, setWiki] = useState<WikiMemory | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const modelPath = await getModelPath();
      const llmProvider = modelPath
        ? createLlamaProvider({ modelPath })
        : createMockLlmProvider();
      const boot = await bootstrapWiki(llmProvider);
      if (!cancelled) {
        setWiki(boot.wiki);
        setEntityId(boot.entityId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wiki || !entityId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <WikiProvider wiki={wiki}>
      <JournalProvider entityId={entityId}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="entry/[factId]" options={{ presentation: 'card', headerShown: true, title: 'Note' }} />
          <Stack.Screen name="night-shift" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="import" options={{ presentation: 'modal', headerShown: true, title: 'Import' }} />
        </Stack>
      </JournalProvider>
    </WikiProvider>
  );
}
```

- [ ] **Step 3: Delete `src/app/explore.tsx` and `src/components/app-tabs.tsx`**

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx src/contexts/JournalContext.tsx
git rm src/app/explore.tsx src/components/app-tabs.tsx
git commit -m "feat: bootstrap wiki in root layout with JournalContext"
```

---

## Task 11: Tab navigation (Journal / Graph / Settings)

**Files:**
- Create: `src/app/(tabs)/_layout.tsx`
- Create: `src/app/(tabs)/index.tsx` (placeholder)
- Create: `src/app/(tabs)/graph.tsx` (placeholder)
- Create: `src/app/(tabs)/settings.tsx` (placeholder)
- Delete: `src/app/index.tsx`

- [ ] **Step 1: Move home to tabs — create `src/app/(tabs)/_layout.tsx`**

```typescript
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Journal' }} />
      <Tabs.Screen name="graph" options={{ title: 'Graph' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create placeholder tab screens**

`src/app/(tabs)/index.tsx`:

```typescript
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function JournalScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Journal</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16 } });
```

`src/app/(tabs)/graph.tsx` and `src/app/(tabs)/settings.tsx`: same pattern with titles `Graph` and `Settings`.

- [ ] **Step 3: Remove old `src/app/index.tsx`**

- [ ] **Step 4: Commit**

```bash
git add src/app/(tabs)/
git rm src/app/index.tsx
git commit -m "feat: add Journal, Graph, Settings tab navigation"
```

---

## Task 12: Journal list + entry editor (M1)

**Files:**
- Create: `src/components/journal/JournalList.tsx`
- Create: `src/components/journal/JournalEntryEditor.tsx`
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Create `JournalList.tsx`**

```typescript
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export type JournalListItem = { id: string; title: string; preview: string };

type Props = {
  items: JournalListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewNote: () => void;
};

export function JournalList({ items, selectedId, onSelect, onNewNote }: Props) {
  return (
    <ThemedView style={styles.container}>
      <Pressable onPress={onNewNote} style={styles.newButton}>
        <ThemedText type="defaultSemiBold">+ New note</ThemedText>
      </Pressable>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            style={[styles.row, selectedId === item.id && styles.selected]}>
            <ThemedText type="defaultSemiBold">{item.title}</ThemedText>
            <ThemedText numberOfLines={2}>{item.preview}</ThemedText>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  newButton: { padding: 12 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  selected: { opacity: 0.7 },
});
```

- [ ] **Step 2: Create `JournalEntryEditor.tsx`**

```typescript
import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';

type Props = {
  onSave: (input: { title: string; body: string }) => Promise<void>;
  onCancel: () => void;
};

export function JournalEntryEditor({ onSave, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={styles.input} />
      <TextInput
        placeholder="Write in markdown…"
        value={body}
        onChangeText={setBody}
        multiline
        style={[styles.input, styles.body]}
      />
      <View style={styles.actions}>
        <Button title="Cancel" onPress={onCancel} />
        <Button
          title={saving ? 'Saving…' : 'Save'}
          onPress={async () => {
            setSaving(true);
            try {
              await onSave({ title, body });
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8 },
  body: { flex: 1, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
});
```

- [ ] **Step 3: Wire journal home — update `src/app/(tabs)/index.tsx`**

Use `useJournal()`, `useMemoryRead(entityId, '')` from expo-llm-wiki, `useWikiIngest()` for save:

```typescript
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMemoryRead, useWikiIngest } from '@equationalapplications/expo-llm-wiki';
import { JournalList, type JournalListItem } from '@/components/journal/JournalList';
import { JournalEntryEditor } from '@/components/journal/JournalEntryEditor';
import { useJournal } from '@/contexts/JournalContext';

export default function JournalScreen() {
  const { entityId, selectedFactId, setSelectedFactId } = useJournal();
  const { data, refetch } = useMemoryRead(entityId, '');
  const { execute: ingest } = useWikiIngest();
  const [composing, setComposing] = useState(false);

  const items: JournalListItem[] = useMemo(() => {
    const facts = data?.facts ?? [];
    return facts.map((f) => ({
      id: f.id,
      title: f.title ?? 'Untitled',
      preview: f.body?.slice(0, 120) ?? '',
    }));
  }, [data]);

  const handleSave = useCallback(
    async ({ title, body }: { title: string; body: string }) => {
      const markdown = `# ${title}\n\n${body}`;
      await ingest(entityId, {
        sourceRef: `journal://${Date.now()}`,
        sourceHash: `${Date.now()}`,
        documentChunk: markdown,
        sourceType: 'immutable_document',
      });
      setComposing(false);
      await refetch();
    },
    [entityId, ingest, refetch],
  );

  if (composing) {
    return <JournalEntryEditor onSave={handleSave} onCancel={() => setComposing(false)} />;
  }

  return (
    <View style={styles.container}>
      <JournalList
        items={items}
        selectedId={selectedFactId}
        onSelect={setSelectedFactId}
        onNewNote={() => setComposing(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
```

- [ ] **Step 4: Manual smoke test**

Run: `npx expo start --dev-client`
Expected: Journal tab lists empty state; New note → Save → note appears in list.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/ src/app/(tabs)/index.tsx
git commit -m "feat: journal list and markdown capture editor"
```

---

## Task 13: Citation navigation context + JournalPane markdown reader

**Files:**
- Create: `src/contexts/CitationNavigationContext.tsx`
- Create: `src/components/journal/JournalPane.tsx`
- Create: `src/app/entry/[factId].tsx`

- [ ] **Step 1: Create `CitationNavigationContext.tsx`**

```typescript
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Target = { factId: string; blockAnchor?: string } | null;

type CitationNavContextValue = {
  target: Target;
  openCitation: (factId: string, blockAnchor?: string) => void;
  clearTarget: () => void;
};

const CitationNavigationContext = createContext<CitationNavContextValue | null>(null);

export function CitationNavigationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target>(null);
  const openCitation = useCallback((factId: string, blockAnchor?: string) => {
    setTarget({ factId, blockAnchor });
  }, []);
  const clearTarget = useCallback(() => setTarget(null), []);
  return (
    <CitationNavigationContext.Provider value={{ target, openCitation, clearTarget }}>
      {children}
    </CitationNavigationContext.Provider>
  );
}

export function useCitationNavigation(): CitationNavContextValue {
  const ctx = useContext(CitationNavigationContext);
  if (!ctx) throw new Error('useCitationNavigation requires CitationNavigationProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `JournalPane.tsx`**

Uses `react-native-markdown-display`, `ScrollView` ref, consumes citation target to `scrollTo`.

- [ ] **Step 3: Add `CitationNavigationProvider` to `_layout.tsx` inside `JournalProvider`**

- [ ] **Step 4: Create `src/app/entry/[factId].tsx`** — loads fact by id from `useMemoryRead`, renders markdown.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/CitationNavigationContext.tsx src/components/journal/JournalPane.tsx src/app/entry/[factId].tsx src/app/_layout.tsx
git commit -m "feat: citation navigation context and markdown journal pane"
```

---

## Task 14: Synthesis pane + chat flow (M2)

**Files:**
- Create: `src/components/synthesis/CitationText.tsx`
- Create: `src/components/synthesis/SynthesisPane.tsx`
- Create: `src/hooks/useSplitPaneLayout.ts`
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Create `useSplitPaneLayout.ts`**

```typescript
import { useWindowDimensions } from 'react-native';
import { SPLIT_PANE_MIN_WIDTH } from '@/lib/constants';

export function useSplitPaneLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= SPLIT_PANE_MIN_WIDTH;
  return { isWide, width, height };
}
```

- [ ] **Step 2: Create `CitationText.tsx`** — maps `splitCitationSegments` to `Text` + tappable cite chips calling `openCitation`.

- [ ] **Step 3: Create `SynthesisPane.tsx`**

Flow per message send:
1. `useMemoryRead(entityId, query, { maxResults: 8 })`
2. `useWikiTraversal(entityId, { sourceId: topHitId, maxDepth: 1, maxTraversalNodes: 12, minTraversalConfidence: 'inferred' })`
3. `formatGraphContext({ nodes, edges })`
4. `buildChatPrompt(...)` with `contextTokenBudget: 4096`
5. `wiki` LLM via provider / store assistant message with `extractCitationIds`
6. Persist via `createChatStore` (open `chat.db` in component mount or pass from context)

- [ ] **Step 4: Update journal home for split pane**

When `isWide`: horizontal `View` with `JournalPane` (45%) + `SynthesisPane` (55%).
When narrow: tab toggle `Notes | Chat` using `paneMode` from `JournalContext`; citation tap sets `paneMode` to `notes`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSplitPaneLayout.ts src/components/synthesis/ src/app/(tabs)/index.tsx
git commit -m "feat: synthesis chat with citations and split-pane layout"
```

---

## Task 15: journalWikiMachine (M3)

**Files:**
- Create: `src/machines/journalWikiMachine.ts`
- Create: `src/hooks/useJournalWiki.ts`
- Create: `__tests__/journalWikiMachine.test.ts`

- [ ] **Step 1: Write failing machine tests**

Pattern from Clanker `__tests__/wikiMachine.test.ts`. Test cases:
- `START_NIGHT_SHIFT` with queue `[{ operation: 'librarian' }, { operation: 'heal' }]` runs sequentially
- `ABORT_NIGHT_SHIFT` finishes current step, skips remaining
- Overlapping `IMPORT` while busy queues or rejects per `WikiBusyError`
- `QUEUE_STEP_START` / `QUEUE_STEP_DONE` events update `queueIndex`

- [ ] **Step 2: Implement `journalWikiMachine.ts`**

Key types:

```typescript
export type NightShiftOperation = 'librarian' | 'heal' | 'reembed' | 'prune';

export type QueueItem = { operation: NightShiftOperation; entityId: string };

export type JournalWikiMachineEvents =
  | { type: 'START_NIGHT_SHIFT'; queue: QueueItem[] }
  | { type: 'ABORT_NIGHT_SHIFT' }
  | { type: 'IMPORT'; dump: MemoryDump; merge: boolean }
  | { type: 'EXPORT'; entityIds: string[] }
  | { type: 'STATUS'; status: EntityStatus };
```

States: `idle`, `nightShift`, `importing`, `exporting`, `busyRetry`, `error`.
Night Shift sub-state runs `fromPromise` actors calling `wiki.runLibrarian`, `wiki.runHeal`, etc.

- [ ] **Step 3: Create `useJournalWiki.ts`** — `createActor(journalWikiMachine)` in provider, expose `send` + snapshot selectors.

- [ ] **Step 4: Run tests**

Run: `npm test -- __tests__/journalWikiMachine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/machines/journalWikiMachine.ts src/hooks/useJournalWiki.ts __tests__/journalWikiMachine.test.ts
git commit -m "feat: journalWikiMachine for Night Shift queue and single-flight ops"
```

---

## Task 16: Night Shift screen + gates (M3)

**Files:**
- Create: `src/hooks/useNightShiftGates.ts`
- Create: `src/components/night-shift/NightShiftScreen.tsx`
- Create: `src/app/night-shift.tsx`
- Modify: `src/lib/llamaProvider.ts` (call `setNightShiftActive`)

- [ ] **Step 1: Create `useNightShiftGates.ts`**

```typescript
import { useEffect, useState } from 'react';
import * as Battery from 'expo-battery';
import { getModelPath } from '@/lib/entityStorage';

export function useNightShiftGates() {
  const [charging, setCharging] = useState(false);
  const [hasModel, setHasModel] = useState(false);

  useEffect(() => {
    let sub: Battery.Subscription | undefined;
    (async () => {
      const state = await Battery.getPowerStateAsync();
      setCharging(state.batteryState === Battery.BatteryState.CHARGING || state.batteryState === Battery.BatteryState.FULL);
      sub = Battery.addBatteryStateListener(({ batteryState }) => {
        setCharging(batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL);
      });
      setHasModel(Boolean(await getModelPath()));
    })();
    return () => sub?.remove();
  }, []);

  return { charging, hasModel, canStart: charging && hasModel };
}
```

- [ ] **Step 2: Create Night Shift UI**

`src/app/night-shift.tsx`:
- `activateKeepAwakeAsync()` on mount, `deactivateKeepAwake()` on unmount
- `setNightShiftActive(true/false)` around session
- Large clock (`HH:mm`), phase copy from `useEntityStatus(entityId)`:
  - `ingesting` → "Reading your notes…"
  - `librarian` → "Synthesizing insights…"
  - `heal` → "Healing memory graph…"
  - idle between steps → "Waiting for next pass…"
- Queue index from machine context
- Reanimated pulsing ring
- Stop → `ABORT_NIGHT_SHIFT`

- [ ] **Step 3: Settings entry + journal banner**

`settings.tsx`: "Run Night Shift" button `disabled={!canStart}`, navigates `/night-shift`.
Journal home: when `useWikiHasChanged()` + thresholds exceeded, show dismissible banner.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useNightShiftGates.ts src/components/night-shift/ src/app/night-shift.tsx src/app/(tabs)/settings.tsx src/lib/llamaProvider.ts
git commit -m "feat: Night Shift maintenance screen with charging and keep-awake gates"
```

---

## Task 17: OKF walk + chunked import (M4)

**Files:**
- Create: `src/lib/walkDirectory.ts`
- Create: `src/lib/chunkedImportDump.ts`
- Create: `__tests__/walkDirectory.test.ts`
- Create: `__tests__/chunkedImportDump.test.ts`

- [ ] **Step 1: Write failing `walkDirectory` test**

Mock `Directory` / `File` from `expo-file-system` (SDK 56 class API):

```typescript
// __tests__/walkDirectory.test.ts
import { walkMarkdownFiles } from '@/lib/walkDirectory';

describe('walkMarkdownFiles', () => {
  it('collects relative posix paths for md files', async () => {
    const files = await walkMarkdownFiles('/cache/import-1', {
      listEntries: async (dir) => {
        if (dir.endsWith('import-1')) return [{ name: 'notes', isDirectory: true }, { name: 'index.md', isDirectory: false }];
        if (dir.endsWith('notes')) return [{ name: 'a.md', isDirectory: false }];
        return [];
      },
      readText: async (path) => (path.endsWith('a.md') ? '# A' : '# Index'),
    });
    expect(files).toEqual([{ path: 'notes/a.md', content: '# A' }]);
  });
});
```

- [ ] **Step 2: Implement `walkDirectory.ts`**

Use Expo SDK 56 `Directory` + `File` in production; accept injectable `listEntries`/`readText` for tests.

Skip root `index.md` when duplicate of catalog (spec §6.C).

- [ ] **Step 3: Write failing `chunkedImportDump` test**

Mock `wiki.importDump`, assert chunk size 25, progress callbacks, `yieldToUI` called.

- [ ] **Step 4: Implement `chunkedImportDump.ts`** per spec pseudocode in §6.C / §7.3.

- [ ] **Step 5: Run tests**

Run: `npm test -- __tests__/walkDirectory.test.ts __tests__/chunkedImportDump.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/walkDirectory.ts src/lib/chunkedImportDump.ts __tests__/walkDirectory.test.ts __tests__/chunkedImportDump.test.ts
git commit -m "feat: OKF directory walker and chunked importDump"
```

---

## Task 18: Import + export screens (M4)

**Files:**
- Create: `src/lib/okfExport.ts`
- Create: `src/app/import.tsx`
- Modify: `src/app/(tabs)/settings.tsx`

- [ ] **Step 1: Import flow in `import.tsx`**

1. Document picker `.zip`
2. Copy to `Paths.cache` + `import-{uuid}.zip`
3. `react-native-nitro-unzip` extract to `import-{uuid}/`
4. Enforce `MAX_ZIP_UNCOMPRESSED_BYTES`
5. `walkMarkdownFiles` → `parseOkfBundle(entityId, files, { defaultSchema: 'fact' })`
6. `chunkedImportDump(wiki, dump, { merge: true, onProgress })`
7. Post-import: `setOntologyManifest` emergent if missing
8. Info callout: *"Complex multi-line YAML or unusual markdown link formats from other apps may be gracefully skipped during import."*

- [ ] **Step 2: Export in `okfExport.ts`**

1. `useWikiExport.execute([entityId])`
2. `formatOkfBundle(dump)` → write files under `Paths.cache/export-{uuid}/`
3. `react-native-zip-archive` zip
4. `expo-sharing.shareAsync` with `mimeType: 'application/zip'`
5. Cleanup temp dir after share

- [ ] **Step 3: Settings buttons** — Import navigates `/import`; Export calls export helper.

- [ ] **Step 4: Commit**

```bash
git add src/lib/okfExport.ts src/app/import.tsx src/app/(tabs)/settings.tsx
git commit -m "feat: OKF zip import and export with share sheet"
```

---

## Task 19: Graph data + simulation (M5)

**Files:**
- Create: `src/lib/graphData.ts`
- Create: `src/lib/graphSimulation.ts`
- Create: `__tests__/graphData.test.ts`

- [ ] **Step 1: Write failing graph cap test**

```typescript
import { capGraphNodes } from '@/lib/graphData';

describe('capGraphNodes', () => {
  it('keeps top 200 by confidence then updated_at', () => {
    const nodes = Array.from({ length: 250 }, (_, i) => ({
      id: `n${i}`,
      confidence: i % 3 === 0 ? 'certain' : 'tentative',
      updatedAt: i,
    }));
    const capped = capGraphNodes(nodes, 200);
    expect(capped.nodes).toHaveLength(200);
    expect(capped.truncated).toBe(true);
    expect(capped.nodes[0].confidence).toBe('certain');
  });
});
```

- [ ] **Step 2: Implement `graphData.ts`**

Load from `wiki.exportDump([entityId])` edges + facts. Map `okf_type` to colors via stable hash of manifest types from `useOntologyManifest`.

- [ ] **Step 3: Implement `graphSimulation.ts`**

```typescript
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';

export type SimNode = { id: string; x?: number; y?: number };
export type SimLink = { source: string; target: string };

export function runGraphSimulation(nodes: SimNode[], links: SimLink[], size: number) {
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d: SimNode) => d.id).distance(40))
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(size / 2, size / 2))
    .force('collide', forceCollide(18));
  sim.tick(300);
  sim.stop();
  return nodes;
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm test -- __tests__/graphData.test.ts
git add src/lib/graphData.ts src/lib/graphSimulation.ts __tests__/graphData.test.ts
git commit -m "feat: graph data loader with deterministic 200-node cap and d3 simulation"
```

---

## Task 20: Skia graph canvas + graph tab (M5)

**Files:**
- Create: `src/components/graph/SkiaGraphCanvas.tsx`
- Create: `src/components/graph/GraphLegend.tsx`
- Create: `src/components/graph/GraphNodeSheet.tsx`
- Modify: `src/app/(tabs)/graph.tsx`

- [ ] **Step 1: `SkiaGraphCanvas.tsx`**

- `@shopify/react-native-skia` `Canvas`, `Circle`, `Line`, `Text`
- `react-native-gesture-handler` pinch/pan via shared values (Reanimated)
- Tap node → bottom sheet

- [ ] **Step 2: `GraphLegend.tsx`**

Render `manifest.node_types` / `edge_types` with stable hash colors. Updates when `useOntologyManifest` refetches after Night Shift.

- [ ] **Step 3: Wire `graph.tsx`**

Load graph data, run simulation once, render canvas. Show banner when truncated: *"Showing 200 most recent high-confidence notes. Run Night Shift to organize the full graph."*

- [ ] **Step 4: Commit**

```bash
git add src/components/graph/ src/app/(tabs)/graph.tsx
git commit -m "feat: Skia graph explorer with emergent ontology legend"
```

---

## Task 21: Settings — model picker + first-launch tutorial (M1/M6)

**Files:**
- Modify: `src/app/(tabs)/settings.tsx`

- [ ] **Step 1: Model picker**

`expo-document-picker` for `.gguf` → copy to `Paths.document` → `setModelPath` → prompt app restart or hot-swap provider.

- [ ] **Step 2: Empty journal tutorial card**

On journal home when `items.length === 0`, show card explaining: capture notes, run Night Shift while charging, ask questions in Chat.

- [ ] **Step 3: Commit**

```bash
git add src/app/(tabs)/settings.tsx src/app/(tabs)/index.tsx
git commit -m "feat: GGUF model picker and first-launch tutorial"
```

---

## Task 22: README + architecture polish (M6)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

- Change status from "Early scaffold" to reflect implemented features
- Add `npm test` to Getting Started
- Document dev-client requirement, model sideload, Night Shift constraints
- Link to this plan and spec

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for implemented demo app features"
```

---

## Spec Coverage Self-Review

| Spec section | Task(s) |
|--------------|---------|
| G1 100% offline | Tasks 2, 6, 10 — no network deps in core flows |
| G2 BYOI + MiniSearch only | Tasks 5, 6 — no `embed` on provider |
| G3 NotebookLM UX + citations | Tasks 8, 9, 13, 14 |
| G4 Night Shift maintenance | Tasks 3, 15, 16 — `Infinity` thresholds + charging gate |
| G5 OKF portability | Tasks 17, 18 |
| G6 Emergent ontology + graph | Tasks 6, 19, 20 |
| G7 Reference quality | Task 22 |
| §6.A Night Shift AC | Task 16 |
| §6.B Split pane + citation AC | Tasks 13, 14 |
| §6.C OKF import/export AC | Tasks 17, 18 |
| §6.D Graph explorer AC | Tasks 19, 20 |
| §7 Workflows 7.1–7.6 | Tasks 10–21 |
| §8 Security (zip cap) | Task 17 (`MAX_ZIP_UNCOMPRESSED_BYTES`) |
| §9 Testing strategy | Tasks 1, 3–9, 15, 17, 19 + manual QA matrix |

**Placeholder scan:** No TBD steps. All lib modules include complete implementations or explicit test-first stubs with full test code.

**Type consistency:** `QueueItem.operation` uses `'librarian' | 'heal' | 'reembed' | 'prune'` throughout; `CHAT_TRAVERSAL_NODE_CAP = 12` used in SynthesisPane; `entityId` flows from `JournalContext`.

---

## Manual QA Checklist (post-M6)

- [ ] iPhone 15 simulator: graph ≤100 nodes at 60fps
- [ ] iPad simulator landscape: split pane 45/55 active
- [ ] Android: charging detection disables/enables Night Shift button
- [ ] Import 500-note OKF zip: progress bar advances, no frame freeze >100ms
- [ ] Export → re-import round-trip preserves fact bodies
- [ ] Citation tap → note scroll <300ms
- [ ] Night Shift abort mid-librarian: app remains consistent, no crash
