# Model Hub Deferred Deletion (#53) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Settings → Change AI model` a normal drill-down — the user can open the model catalogue, look at it, and return to Settings with a working model — by deferring deletion of the current model to a confirmed commitment point in the hub.

**Architecture:** The one-way door is a provider teardown, not just a bad navigate call: deleting the model flips `phase` to `needsModelHub`, which unmounts the whole `WikiProvider` subtree before `router.replace` runs. The fix removes the delete from `Settings` entirely and moves it into the model-hub machine, which gains a `retiringCurrent` state that runs between selection and the network gate. Because deletion is deferred, the app stays `ready` while the hub is on screen, so `navigation.canGoBack()` becomes a reliable first-run-vs-change discriminator — no route param needed.

**Tech Stack:** XState v5 (`setup`/`createMachine`/`fromPromise`), expo-router 57, `expo-file-system`, React Native Testing Library, Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-09-28-issues-51-53-import-crash-and-model-hub-design.md` §4.2 (B1–B7), §5, §6, §7, §8 (Part B). The spec travels with this plan — read §4.2 before starting.

## Global Constraints

- The model catalogue is unchanged. `MODEL_CATALOG` still has exactly two entries, `fast-light` and `smarter-slower`. Do not add, remove or rename models.
- Download, resume, verify, smoke-test and `customImport` flows are unchanged. **Only the moment the previous model is destroyed changes.**
- The machine is the sole owner of the "a model is installed" invariant. Screens must not touch the model file directly. `Settings` must not import `File`, `getModelPath`, `clearModelPath` or `useModelHubCompletion` after this work.
- Do not add a route param or navigation flag to mark the hub as "change mode". `navigation.canGoBack()` is the discriminator.
- `model-hub/_layout.tsx` keeps `headerShown: false` on the stack. The hub is still the first-run destination, where a back control would be wrong.
- Lint scope is `npx eslint src __tests__`. Baseline is **0 errors / 71 pre-existing warnings** — do not add new ones.
- Test baseline before starting: **47 suites / 250 tests, all passing.** (If Plan A landed first it is 48 / 254 — re-read the actual number rather than assuming.)
- New user-facing copy must read as honest about *when* the deletion happens. This was the original defect in #53: the sheet described a deletion that had already occurred.

---

### Task 1: Machine — retire the current model on selection

The machine gains the retirement step, the "already installed" guard, and a reachable failure
path. This is the core of the fix; everything else is wiring and presentation.

**Files:**
- Modify: `src/machines/modelHubMachine.ts`
- Test: `__tests__/modelHubMachine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ModelHubMachineInput` gains an optional field: `currentModelId?: CuratedModelId | 'custom' | null`.
  - `ModelHubApi` gains a required method: `retireCurrentModel: () => Promise<void>`.
  - `Context` gains a field: `currentModelId: CuratedModelId | 'custom' | null`.
  - A new state `retiringCurrent`, reachable from `selecting` on `SELECT_MODEL` and
    transitioning to `confirmingNetwork` on success or back to `selecting` on failure.
  - A new `ErrorCode` member `'retire'`.

- [ ] **Step 1: Extend the test api factory**

In `__tests__/modelHubMachine.test.ts`, the `makeApi` factory must satisfy the widened
`ModelHubApi`. Add the new method to the returned object, next to `setModelPath`:

```ts
    setModelPath: jest.fn(async () => undefined),
    retireCurrentModel: jest.fn(async () => undefined),
    ...overrides,
```

- [ ] **Step 2: Write the failing test — retirement happens for a different model**

Append inside the existing `describe('modelHubMachine', ...)` block:

```ts
  it('retires the current model before starting a new download', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.retireCurrentModel).toHaveBeenCalledTimes(1);
    expect(api.setModelPath).toHaveBeenCalledWith(expect.objectContaining({ id: 'smarter-slower' }));
    actor.stop();
  });
```

`smarter-slower` must exist in `MODEL_CATALOG`, which the machine resolves via
`getCuratedModel(context.modelId)` on entry to `downloading`.

- [ ] **Step 3: Write the failing test — re-selecting the installed model never retires**

```ts
  it('does not retire when the selected model is already installed', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'fast-light' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.retireCurrentModel).not.toHaveBeenCalled();
    actor.stop();
  });
```

- [ ] **Step 4: Write the failing test — a failed retirement blocks the download**

```ts
  it('does not consult the network when retirement fails', async () => {
    const api = makeApi({ retireCurrentModel: jest.fn(async () => { throw new Error('locked'); }) });
    const actor = createActor(modelHubMachine, {
      input: { api, currentModelId: 'fast-light' },
    }).start();
    actor.send({ type: 'SELECT_MODEL', modelId: 'smarter-slower' });
    await waitFor(actor, (s) => s.matches('selecting') && s.context.error !== null, { timeout: 3000 });
    expect(api.checkNetwork).not.toHaveBeenCalled();
    expect(api.startDownload).not.toHaveBeenCalled();
    actor.stop();
  });
```

This is the invariant that matters: either the old model is fully retired or the new one is
never started. A half-retired state must not fall through to `confirmingNetwork`.

- [ ] **Step 5: Run the machine tests and verify the new ones fail**

Run:

```bash
npx jest __tests__/modelHubMachine.test.ts
```

Expected: the three new tests FAIL. They fail on `currentModelId` not being honoured —
`retireCurrentModel` is never called because the machine does not know a model is installed,
and the failure test times out because it goes straight to `downloading` and completes.

- [ ] **Step 6: Widen the machine's types**

In `src/machines/modelHubMachine.ts`, make three edits.

First, add the api method to `ModelHubApi`, after `setModelPath`:

```ts
  setModelPath: (model: CuratedModel) => Promise<void>;
  retireCurrentModel: () => Promise<void>;
```

Second, widen the input type:

```ts
export type ModelHubMachineInput = {
  api: ModelHubApi;
  currentModelId?: CuratedModelId | 'custom' | null;
};
```

Third, add `currentModelId` to `Context` and widen the error code union:

```ts
type ErrorCode = 'network' | 'disk-full' | 'verify' | 'smoke' | 'retire';

type Context = {
  api: ModelHubApi;
  currentModelId: CuratedModelId | 'custom' | null;
  modelId: CuratedModelId | null;
  // …the rest unchanged
```

- [ ] **Step 7: Register the retirement actor**

In the `actors` block of the `setup({...})` call, add alongside `verifyTask` and `smokeTestTask`:

```ts
    retireTask: fromPromise(async ({ input }: { input: { api: ModelHubApi } }) =>
      input.api.retireCurrentModel(),
    ),
```

- [ ] **Step 8: Initialise the context and add the `retiringCurrent` state**

In the `context` factory, add one line next to `api: input.api,`:

```ts
  context: ({ input }) => ({
    api: input.api,
    currentModelId: input.currentModelId ?? null,
    modelId: null,
```

Then replace the `SELECT_MODEL` entry in the `selecting` state with a guarded array. The
guard is the invariant; the UI's disabled "Current" row is only the affordance:

```ts
        SELECT_MODEL: [
          {
            guard: ({ event, context }) => event.modelId === context.currentModelId,
            target: 'confirmingNetwork',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              error: null,
              pauseState: null,
              pausedReason: null,
            }),
          },
          {
            target: 'retiringCurrent',
            actions: assign({
              modelId: ({ event }) => event.modelId,
              error: null,
              pauseState: null,
              pausedReason: null,
            }),
          },
        ],
```

Then add the new state between `selecting` and `confirmingNetwork`:

```ts
    retiringCurrent: {
      invoke: {
        src: 'retireTask',
        input: ({ context }) => ({ api: context.api }),
        onDone: { target: 'confirmingNetwork' },
        onError: {
          target: 'selecting',
          actions: assign({
            error: {
              code: 'retire' as const,
              message: 'Your current model could not be removed, so nothing has changed. Try again.',
            },
          }),
        },
      },
    },
```

This is a real state rather than a fire-and-forget action precisely so the failure branch is
reachable and testable. It matches the existing `verifyTask` / `smokeTestTask` idiom in the
same machine.

- [ ] **Step 9: Run the machine tests and verify they pass**

Run:

```bash
npx jest __tests__/modelHubMachine.test.ts
```

Expected: all tests in the suite PASS, including the three pre-existing happy-path and
routing tests. Those existing tests create the actor with `input: { api }` and no
`currentModelId`, so `input.currentModelId ?? null` gives `null` and every `SELECT_MODEL`
takes the retiring path — with a mocked `retireCurrentModel` that resolves, the flow is
unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/machines/modelHubMachine.ts __tests__/modelHubMachine.test.ts
git commit -m "$(cat <<'EOF'
refactor(model-hub): retire the installed model inside the machine (#53)

Move the delete out of the Settings screen and into the hub machine, as
a `retiringCurrent` state between selection and the network gate. The
screen stops being able to desynchronise the model file from the
machine's idea of what is installed.

Retirement is skipped by a guard when the selected model is already the
installed one, and a failed retirement returns to `selecting` with an
error instead of proceeding — either the old model is fully retired or
the new one is never started.

The state exists (rather than a fire-and-forget action) so the failure
branch is reachable and testable, matching verifyTask/smokeTestTask.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 2: Machine — retire the old file after a custom `.gguf` import

The custom-import path has the opposite ordering problem: the replacement file is only known
after the picker returns, so there is no selection moment to retire at. It must also capture
the outgoing path *before* the screen overwrites `MODEL_PATH_KEY`.

**Files:**
- Modify: `src/machines/modelHubMachine.ts`
- Test: `__tests__/modelHubMachine.test.ts`

**Interfaces:**
- Consumes: `ModelHubApi` as widened in Task 1.
- Produces:
  - `ModelHubApi` gains a required method: `deleteModelFile: (path: string) => Promise<void>`.
  - `ModelHubMachineEvents` gains an optional field on an existing event:
    `{ type: 'IMPORT_SMOKE_OK'; retirePath?: string | null }`.

- [ ] **Step 1: Widen the test api factory**

In `__tests__/modelHubMachine.test.ts`, add the new method next to `retireCurrentModel`:

```ts
    retireCurrentModel: jest.fn(async () => undefined),
    deleteModelFile: jest.fn(async () => undefined),
```

- [ ] **Step 2: Write the failing test — the outgoing file is deleted on a successful import**

```ts
  it('deletes the outgoing model file after a custom import succeeds', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_SMOKE_OK', retirePath: 'file:///old.gguf' });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.deleteModelFile).toHaveBeenCalledWith('file:///old.gguf');
    actor.stop();
  });
```

- [ ] **Step 3: Write the failing test — nothing is deleted on a first-run import**

```ts
  it('deletes nothing when there is no outgoing model', async () => {
    const api = makeApi();
    const actor = createActor(modelHubMachine, { input: { api } }).start();
    actor.send({ type: 'IMPORT_CUSTOM' });
    actor.send({ type: 'IMPORT_SMOKE_OK', retirePath: null });
    await waitFor(actor, (s) => s.matches('complete'), { timeout: 3000 });
    expect(api.deleteModelFile).not.toHaveBeenCalled();
    actor.stop();
  });
```

- [ ] **Step 4: Run the tests and verify they fail**

Run:

```bash
npx jest __tests__/modelHubMachine.test.ts
```

Expected: both new tests FAIL — `deleteModelFile` is never called.

- [ ] **Step 5: Add the api method and the event field**

In `src/machines/modelHubMachine.ts`, add to `ModelHubApi`:

```ts
  deleteModelFile: (path: string) => Promise<void>;
```

And change the event union member:

```ts
  | { type: 'IMPORT_SMOKE_OK'; retirePath?: string | null }
```

- [ ] **Step 6: Handle retirement in the `customImport` state**

Replace the bare `IMPORT_SMOKE_OK` target in the `customImport` state:

```ts
    customImport: {
      on: {
        IMPORT_SMOKE_OK: {
          target: 'complete',
          actions: ({ context, event }) => {
            if (event.retirePath) void context.api.deleteModelFile(event.retirePath);
          },
        },
        IMPORT_FAILED: {
          target: 'selecting',
          actions: assign({
            error: { code: 'smoke' as const, message: event.message },
          }),
        },
      },
    },
```

The unlink is best-effort: an orphaned `.gguf` wastes disk but is recoverable by hand, whereas
a thrown error here would fail an import that already succeeded and passed its smoke test. The
implementation in Task 3 catches and warns, matching the existing rationale at
`src/app/import.tsx:52-59`.

- [ ] **Step 7: Run the tests and verify they pass**

Run:

```bash
npx jest __tests__/modelHubMachine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/machines/modelHubMachine.ts __tests__/modelHubMachine.test.ts
git commit -m "$(cat <<'EOF'
feat(model-hub): retire the outgoing file after a custom gguf import (#53)

The custom-import path has the opposite ordering problem to the
catalogue: the replacement file is only known after the picker returns,
so there is no selection moment to retire at, and the screen overwrites
MODEL_PATH_KEY before the machine could act.

Carry the outgoing path on the event and unlink it once the replacement
has been copied and passed its smoke test. Deliberately later than the
catalogue path, which retires at selection — the catalogue can afford to
be eager because the model is already known and confirmed, and this
cannot.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 3: Wire the retirement into the api, the hook and the hub layout

The machine now needs a real implementation of `retireCurrentModel` / `deleteModelFile`, and
the hub layout needs to tell it what is currently installed.

**Files:**
- Modify: `src/hooks/useModelHub.tsx`
- Modify: `src/app/model-hub/_layout.tsx`
- Test: `__tests__/modelHubMachine.test.ts` (no new tests — this task is wiring; Task 5 covers the UI it enables)

**Interfaces:**
- Consumes: `ModelHubApi.retireCurrentModel` and `ModelHubApi.deleteModelFile` from Tasks 1–2; `ModelHubMachineInput.currentModelId` from Task 1.
- Produces:
  - `createModelHubApi(store)` returns the two new methods.
  - `ModelHubProvider` gains a required prop `currentModelId: CuratedModelId | 'custom' | null`.
  - `useModelHub()` context value gains `currentModelId: CuratedModelId | 'custom' | null`.

- [ ] **Step 1: Implement the two api methods**

In `src/hooks/useModelHub.tsx`, extend the `entityStorage` import on line 31:

```ts
import { setModelPath, setModelId, getModelPath, clearModelPath } from '@/lib/entityStorage';
```

Then add to the object returned by `createModelHubApi`, after `setModelPath`:

```ts
    retireCurrentModel: async () => {
      const path = await getModelPath();
      if (path) {
        const file = new File(path);
        if (file.exists) file.delete();
      }
      await clearModelPath();
    },
    deleteModelFile: async (path) => {
      const file = new File(path);
      if (file.exists) file.delete();
    },
```

`File` and `Paths` are already imported at the top of this file. The `file.exists` guard
makes retirement idempotent, matching what the old `settings.tsx` did and what a retry after
a partial failure needs.

- [ ] **Step 2: Expose `currentModelId` on the hook context**

In `src/hooks/useModelHub.tsx`, add to the `ModelHubContextValue` type:

```ts
type ModelHubContextValue = {
  send: (event: ModelHubMachineEvents) => void;
  stateValue: string;
  modelId: CuratedModelId | null;
  currentModelId: CuratedModelId | 'custom' | null;
  // …the rest unchanged
```

Add the prop to `ModelHubProvider`'s parameter list:

```ts
export function ModelHubProvider({
  api,
  restore,
  currentModelId,
  children,
}: {
  api: ModelHubApi;
  restore?: ModelHubRestoreState;
  currentModelId: CuratedModelId | 'custom' | null;
  children: ReactNode;
}) {
```

Pass it into the actor and **add it to the memo dependency array** — omitting it would create
the actor before the stored id has loaded, and the machine would believe nothing is
installed:

```ts
  const actor = useMemo(
    () => createActor(modelHubMachine, { input: { api, currentModelId } }).start(),
    [api, currentModelId],
  );
```

Add the selector and the context value:

```ts
  const currentModelIdFromActor = useSelector(actor, (s) => s.context.currentModelId);
```

```ts
  const value: ModelHubContextValue = {
    send,
    stateValue,
    modelId,
    currentModelId: currentModelIdFromActor,
    progress,
    error,
    pausedReason,
    displayName,
  };
```

Reading it back off the actor rather than closing over the prop keeps the two in sync even if
the actor is recreated.

- [ ] **Step 3: Read the stored model id in the hub layout**

In `src/app/model-hub/_layout.tsx`, add the import:

```ts
import { getModelId } from '@/lib/entityStorage';
```

Add state next to the existing `api` and `restore` state:

```ts
  const [currentModelId, setCurrentModelId] = useState<CuratedModelId | 'custom' | null>(null);
```

Inside the existing `useEffect`'s async IIFE, read it in the same pass as the download state.
The `if (cancelled) return;` guard already in that block covers this read:

```ts
      const storedModelId = await getModelId();
      if (cancelled) return;
      setCurrentModelId((storedModelId as CuratedModelId | 'custom' | null) ?? null);
      setApi(createModelHubApi(store));
```

Both `setCurrentModelId` and `setApi` are called in the same batch, so the provider never
mounts with a null id alongside a real api.

Pass the new prop through:

```tsx
    <ModelHubProvider api={api} restore={restore} currentModelId={currentModelId}>
```

- [ ] **Step 4: Run the full suite and lint**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
```

Expected: all suites PASS and lint reports 0 errors. `modelHubDownloadContrast.test.tsx`
mocks `useModelHub` with a fixed object that does not include `currentModelId`; that mock is
for the download screen, which does not read it, so no change is needed there. If a suite
does fail on a missing `currentModelId` in a mock, add `currentModelId: null` to that mock.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModelHub.tsx src/app/model-hub/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(model-hub): tell the machine which model is installed (#53)

Implement retireCurrentModel and deleteModelFile against the stored
model path, and read the installed model id in the hub layout so the
machine starts with it as context rather than discovering it later.

currentModelId is machine input, not a RESTORE_DOWNLOAD event: it is
initial context, and riding the existing event would race the first
render. The actor memo now depends on it, since creating the actor
before the id has loaded would leave the machine believing nothing is
installed.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 4: Make the Settings entry point non-destructive

This is the change that actually opens the door. Everything so far is machinery; without it
the app still tears itself down before the hub is reached.

**Files:**
- Modify: `src/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: nothing. This task depends only on the fact that `router.push` keeps the tabs
  mounted, which is stock expo-router behaviour.
- Produces: the behaviour that `Settings → Change AI model` no longer deletes, no longer
  reboots, and no longer replaces the route. Tasks 5 and 6 depend on the app being `ready`
  while the hub is on screen, which this task guarantees.

- [ ] **Step 1: Replace `performChangeModel`**

In `src/app/(tabs)/settings.tsx`, replace the whole `performChangeModel` function (lines
25–34) with:

```ts
  const performChangeModel = () => {
    router.push('/model-hub' as Href);
  };
```

The file deletion, the `clearModelPath()` and the `rebootstrap()` are all gone. `rebootstrap`
was the actual cause of the one-way door: it is `bootstrap`, which finds no model and sets
`phase` to `needsModelHub`, which unmounts the entire `WikiProvider` / `LlmProvider` /
`JournalProvider` subtree in `src/app/_layout.tsx` — destroying Settings before the
`router.replace` on the old line 33 could even run.

- [ ] **Step 2: Correct the confirmation copy**

In the same file, replace the `confirm({...})` call in `changeModel` with:

```ts
  const changeModel = () => {
    confirm({
      title: 'Change AI model',
      message:
        'You will choose a replacement on the next screen. Your current model stays in place until you pick one.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => performChangeModel() },
      ],
    });
  };
```

Two deliberate changes. The message no longer claims an immediate deletion, because none
happens — that mismatch was the copy defect in #53. And `Continue` loses its `destructive`
style, because pressing it no longer destroys anything. `useConfirmSheet` renders the last
button as `primary` when it is not destructive, so the sheet still reads correctly.

- [ ] **Step 3: Remove the imports that are now unused**

Delete these import lines from the top of the file:

```ts
import { File } from 'expo-file-system';
```

```ts
import { getModelPath, clearModelPath } from '@/lib/entityStorage';
```

```ts
import { useModelHubCompletion } from '@/contexts/ModelHubCompletionContext';
```

And delete this line from the component body:

```ts
  const rebootstrap = useModelHubCompletion();
```

`Href` is still needed — the `router.push` call keeps the cast. `confirmElement` stays.

- [ ] **Step 4: Run the full suite and lint**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
```

Expected: all suites PASS and lint reports 0 errors with no new warnings. If lint flags
`@typescript-eslint/no-unused-vars` for a leftover import, remove the named import.

- [ ] **Step 5: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(tabs)/settings.tsx"
git commit -m "$(cat <<'EOF'
fix(settings): open the model hub without destroying the model (#53)

Change AI model deleted the model file, cleared MODEL_PATH_KEY and
re-ran bootstrap before navigating. bootstrap found no model, set
phase to needsModelHub, and that unmounted the entire WikiProvider /
LlmProvider / JournalProvider subtree in the root layout — so Settings
was destroyed before the router.replace on the next line could run, and
the back gesture exited to the launcher.

It also made the confirmation sheet a lie: it warned that the current
model would be deleted immediately, by which point it already had been.

Now the button only pushes the hub. The app stays ready, the tabs stay
mounted underneath, the back gesture returns to Settings with the model
still working, and the copy describes what actually happens — the model
is replaced when the user picks one on the next screen.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 5: Hub UI — visible exit, "Current" badge, and a destructive confirm

Now that the app is `ready` behind the hub, the hub can offer an exit and can show what is
already installed.

**Files:**
- Modify: `src/app/model-hub/index.tsx`
- Test: `__tests__/modelHubChangeContrast.test.tsx` (new)

**Interfaces:**
- Consumes: `useModelHub().currentModelId` from Task 3; `useConfirmSheet` (already imported in
  this file); `getCuratedModel` and `CuratedModelId` from `@/catalog/modelManifest`.
- Produces: the visible `← Settings` back row, the non-selectable "Current" row, and the
  destructive replacement confirmation.

- [ ] **Step 1: Write the failing test — the back row follows the navigation stack**

Create `__tests__/modelHubChangeContrast.test.tsx`. Follow the mocking style of
`__tests__/modelHubDownloadContrast.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';

const mockSend = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(false);
const mockGoBack = jest.fn();
const mockCurrentModelId = jest.fn().mockReturnValue<string | null>(null);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ canGoBack: () => mockCanGoBack(), goBack: mockGoBack }),
}));

jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({
    send: mockSend,
    stateValue: 'selecting',
    modelId: null,
    currentModelId: mockCurrentModelId(),
    progress: { bytesWritten: 0, totalBytes: 0 },
    error: null,
    pausedReason: null,
    displayName: null,
  }),
}));

import ModelHubIndexScreen from '@/app/model-hub/index';

describe('model-hub change mode', () => {
  it('offers no exit on first run, where there is nothing behind the hub', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.queryByLabelText('Back to Settings')).toBeNull();
  });

  it('offers an exit when the hub was pushed from Settings', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.getByLabelText('Back to Settings')).toBeTruthy();
  });

  it('returns to Settings when the back row is pressed', async () => {
    mockCanGoBack.mockReturnValue(true);
    const screen = await render(<ModelHubIndexScreen />);
    screen.getByLabelText('Back to Settings').props.onClick?.();
    screen.getByLabelText('Back to Settings').props.onPress?.();
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('marks the installed model as Current and does not allow re-selecting it', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockCurrentModelId.mockReturnValue('fast-light');
    const screen = await render(<ModelHubIndexScreen />);
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByLabelText('Fast & Light, current model')).toBeTruthy();
  });
});
```

The double `onClick`/`onPress` call in the third test is deliberate: React Native Testing
Library normalises `Pressable` handlers differently across versions, and calling both is
harmless because `goBack` is a mock.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx jest __tests__/modelHubChangeContrast.test.tsx
```

Expected: FAIL. `ModelHubIndexScreen` does not call `useNavigation` and has no back row, so
the first two assertions fail; the fourth fails because no "Current" badge exists.

- [ ] **Step 3: Add the back row**

In `src/app/model-hub/index.tsx`, add `Pressable` to the `react-native` import and
`useNavigation` to the `expo-router` import:

```tsx
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRouter, type Href } from 'expo-router';
```

Add `getCuratedModel` to the catalog import:

```tsx
import { MODEL_CATALOG, getCuratedModel, type CuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
```

Get the navigation handle in the component body:

```tsx
  const router = useRouter();
  const navigation = useNavigation();
  const { send, stateValue, error, currentModelId } = useModelHub();
```

Render the back row as the first child inside the `ScrollView`'s content container, above the
`intro` view:

```tsx
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to Settings"
            style={styles.backRow}>
            <ThemedText type="linkPrimary">← Settings</ThemedText>
          </Pressable>
        ) : null}
```

Add the style:

```ts
  backRow: { alignSelf: 'flex-start', minHeight: TouchTarget },
```

`TouchTarget` is exported from `@/constants/theme`; add it to that import.

- [ ] **Step 4: Mark the installed model and block re-selection**

Replace `selectModel` and add the confirmation helper. Declare `currentModelName` **before**
`commitSelection` — both are `const` arrow functions, so the order matters for anyone reading
top to bottom even though the call only happens on press:

```tsx
  const currentModelName = () => {
    if (!currentModelId) return 'Your current model';
    if (currentModelId === 'custom') return 'Your imported model';
    return getCuratedModel(currentModelId)?.displayName ?? 'Your current model';
  };

  const commitSelection = (model: CuratedModel) => {
    if (currentModelId) {
      confirm({
        title: 'Replace model',
        message: `${currentModelName()} will be deleted now and cannot be restored. ${
          model.displayName
        } will download in its place.`,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => send({ type: 'SELECT_MODEL', modelId: model.id }),
          },
        ],
      });
      return;
    }
    send({ type: 'SELECT_MODEL', modelId: model.id });
  };

  const selectModel = (model: CuratedModel) => {
    if (model.id === currentModelId) return;
    if (model.deviceWarning) {
      setWarningFor(model);
      return;
    }
    commitSelection(model);
  };

  const confirmWarning = () => {
    if (!warningFor) return;
    const model = warningFor;
    setWarningFor(null);
    commitSelection(model);
  };
```

`confirmWarning` now routes through `commitSelection` rather than sending the event directly,
so a model that carries a device warning is still confirmed before the old one is retired.

Update the catalogue `ListRow` so the installed model is visibly and functionally inert:

```tsx
            <ListRow
              key={model.id}
              divider={index < MODEL_CATALOG.length - 1}
              onPress={model.id === currentModelId ? undefined : () => selectModel(model)}
              accessibilityState={{ disabled: model.id === currentModelId }}
              accessibilityLabel={
                model.id === currentModelId
                  ? `${model.displayName}, current model`
                  : `Select ${model.displayName}`
              }>
              <View style={styles.modelHeader}>
                <ThemedText type="strong">{model.displayName}</ThemedText>
                {model.id === currentModelId ? (
                  <ThemedText type="meta" themeColor="outline">
                    Current
                  </ThemedText>
                ) : null}
              </View>
```

Add the style:

```ts
  modelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
```

- [ ] **Step 5: Run the new test and verify it passes**

Run:

```bash
npx jest __tests__/modelHubChangeContrast.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Run the full suite and lint**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
npx tsc --noEmit
```

Expected: all suites PASS, lint reports 0 errors and no new warnings, typecheck is clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/model-hub/index.tsx __tests__/modelHubChangeContrast.test.tsx
git commit -m "$(cat <<'EOF'
feat(model-hub): visible exit, Current badge, destructive replace (#53)

With deletion deferred, navigation.canGoBack() is a reliable
first-run-vs-change discriminator: first run still arrives via Redirect
with an empty stack, change arrives via push. That lets the hub render a
back row gated on the stack, with no route param and no second source of
truth. headerShown stays false — on first run a back control would be
wrong.

Mark the installed model with a Current badge and make its row inert, so
the destructive path is not reachable by accident. The machine guard in
the SELECT_MODEL transition remains the invariant; this is the
affordance.

Tapping any other model now opens a destructive confirm naming both
models, and the confirm routes through the same commit helper as the
device-warning path so a warned-about model is still confirmed.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 6: Custom import screen — capture the outgoing path before it is overwritten

`runImport` calls `setModelPath(dest.uri)` before sending `IMPORT_SMOKE_OK`, so the outgoing
path is already lost by the time the machine would use it. Capture it at mount instead.

**Files:**
- Modify: `src/app/model-hub/import.tsx`

**Interfaces:**
- Consumes: `{ type: 'IMPORT_SMOKE_OK'; retirePath?: string | null }` from Task 2;
  `getModelPath` from `@/lib/entityStorage`.
- Produces: an `IMPORT_SMOKE_OK` event carrying the pre-import model path, so the machine can
  retire it after the replacement passes its smoke test.

- [ ] **Step 1: Extend the entityStorage import**

In `src/app/model-hub/import.tsx`, change line 11:

```ts
import { setModelPath, setModelId, getModelPath } from '@/lib/entityStorage';
```

- [ ] **Step 2: Capture the outgoing path on mount**

In the component body, after the existing `const [status, setStatus] = useState('');`, add:

```ts
  // The outgoing model path must be read here, not after the import: runImport
  // overwrites MODEL_PATH_KEY with the replacement before it signals success,
  // so by then the old path is gone. null on first run — nothing to retire.
  const [retirePath, setRetirePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getModelPath().then((path) => {
      if (!cancelled) setRetirePath(path);
    });
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 3: Send the path with the success event**

Change the final line of `runImport`:

```ts
    send({ type: 'IMPORT_SMOKE_OK', retirePath });
```

- [ ] **Step 4: Run the full suite and lint**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
npx tsc --noEmit
```

Expected: all suites PASS, lint reports 0 errors, typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/model-hub/import.tsx
git commit -m "$(cat <<'EOF'
fix(model-hub): retire the outgoing model after a custom import (#53)

runImport overwrites MODEL_PATH_KEY with the replacement before it
sends IMPORT_SMOKE_OK, so the outgoing path was already lost by the
time the machine could act on it. Read it at mount instead and carry it
on the event.

The deletion stays later than the catalogue path on purpose: the
replacement file is only known after the picker returns, so there is no
selection moment to retire at, and retiring on entry would destroy a
working model in exchange for a file the user may cancel.

Co-Authored-By: Claude Code <[EMAIL]>
EOF
)"
```

---

### Task 7: Verify the whole change on device

No committed code. This produces the evidence that closes #53, and it is where the
mmapped-file risk from the spec (R1) is settled rather than assumed.

**Files:** none modified. If a step reveals a problem, return to the task that owns it.

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: verification evidence for the #53 close comment.

- [ ] **Step 1: Build and install a dev client with a real model on the device**

Run:

```bash
npx expo run:android
```

Use a real model, not the mock provider — the mock path skips the model hub entirely. Install
one through first run if the device has none.

- [ ] **Step 2: The #53 acceptance test — back out with the model intact**

1. Settings → **Change AI model** → **Continue**
2. The hub opens with a visible `← Settings` back row
3. Press the **Android back gesture**
4. You must land on **Settings**, not the launcher

**Expected: back returns to Settings.** This is the whole point of the change. If the app
exits, deletion is still happening somewhere.

- [ ] **Step 3: Confirm the model was not destroyed by browsing**

On the returned Settings screen, confirm the app is still `ready` — the tab bar renders, and
Settings → **Run Night Shift** is enabled. Then record the model file and the stored id:

```bash
adb shell run-as com.equationalapplicationsllc.curatedjournal ls files/ 2>/dev/null
```

**Expected: the `.gguf` is still on disk and the app is fully usable.** If the file is gone,
the deferral is not in effect.

- [ ] **Step 4: Confirm the back row also works**

Repeat step 2, but tap the visible `← Settings` row instead of using the gesture.

**Expected: returns to Settings**, same as the gesture.

- [ ] **Step 5: Verify the full replacement succeeds**

1. Settings → **Change AI model** → **Continue**
2. The installed model shows a **Current** badge and its row is inert
3. Tap a *different* model
4. A destructive sheet names both models — **Cancel** first and confirm **nothing is sent**
5. Repeat, and choose **Replace**
6. The download proceeds and completes

**Expected: the new model installs and the app returns to `/journal`.** The phase must never
leave `ready` during this, so no provider teardown is observable.

- [ ] **Step 6: Verify the mmapped-file risk (spec R1) — do not skip this**

1. On the Settings screen, note the current model is working (Night Shift enabled)
2. Settings → Change → pick a different model → confirm → **immediately** return to the
   pre-existing app state and confirm nothing crashed or black-screened while the download
   runs

**Expected: the app does not crash.** The old `.gguf` is unlinked at the commitment point
while the old provider still holds it mapped; POSIX keeps the inode alive until unmapping, so
the running app stays healthy. Confirm this empirically rather than trusting the reasoning.

- [ ] **Step 7: Verify a failed custom import leaves the old model working**

1. Settings → Change → Continue
2. Tap **Import custom .gguf** and pick a file that will fail the smoke test (or a
   non-`.gguf` file)
3. The import fails and returns to the hub

**Expected: the previously installed model is still installed and the app still works.** This
path is strictly safer than the catalogue path and is the behaviour B7 describes.

- [ ] **Step 8: Verify a successful custom import retires the old file**

1. Settings → Change → Continue
2. Import a valid `.gguf`
3. After it completes, list the documents directory

**Expected: the replacement is installed and the previous `.gguf` is gone** (best-effort
deletion — if it is still there, the file was locked and only disk space is wasted, which is
the accepted failure mode).

- [ ] **Step 9: Run the full automated suite and lint one final time**

Run:

```bash
npm test -- --silent 2>&1 | tail -5
npx eslint src __tests__
npx tsc --noEmit
```

Expected: all suites PASS (48 suites / 254 tests if Plan A landed first, otherwise 49 / 258
with this plan's two new suites), lint 0 errors, typecheck clean.

- [ ] **Step 10: Report the result for the issue close comment**

Record the outcomes of steps 2 through 8. When closing #53, note that deletion is now deferred
to a confirmed commitment point and that the Settings confirm sheet no longer claims an
immediate deletion.
