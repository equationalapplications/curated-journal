# Ledger: iOS model memory and download restore

Tick each line when its task's tests pass and it is committed. Evidence
goes under the line it belongs to.

- [x] 1 Load-parameter function and manifest RAM field (A1, A2, A3, A5 lever 1).
  - Lever 1 package check (file:line for `q8_0`, `flash_attn_type`, JSI parsing): node_modules/llama.rn/src/index.ts:196-224 (`flash_attn_type?: 'auto'|'on'|'off'` L198; `q8_0` in cache_type_k L202, cache_type_v L211, validCacheTypes L224); cpp/jsi/JSIParams.cpp:379-388 (`flash_attn_type`, `cache_type_k`, `cache_type_v` all read into cparams).
- [x] 2 Smoke test, provider and import use the function; smoke test keeps the file.
- [x] 3 Context lever (A5 lever 2). DECISION: NOT APPLIED (heal and chat unproven or over budget); `LOW_MEMORY_CONTEXT_SIZE` stays `null`.
  - Rule: tokens = ceil(chars/3)*1.10; apply only if tokens + 2048 <= 4096, i.e. tokens <= 2048, i.e. chars <= 5585 (3 chars/token; 1862 tokens*3).
  - Chat prompt bound: NOT BOUNDED / does not fit. src/components/synthesis/SynthesisPane.tsx:68 (`maxResults: 8`), :79-91 (`buildChatPrompt`, `contextTokenBudget: 4096`). Facts: 8 x (body <= 800 chars, node_modules/@equationalapplications/core-llm-wiki/dist/index.js:700) = 6400 chars bodies alone, plus titles/ids, graph context (CHAT_TRAVERSAL_NODE_CAP neighborhood), SYSTEM_PROMPT (~110 chars) and `userQuery` (user text, no cap in the app). 6400 chars -> ceil(6400/3)*1.10 = 2347 tokens > 2048 before any other part; the budget passed is itself 4096, the whole context. FAILS.
  - Librarian prompt bound: FAILS. Engine caps the extract/resolve prompts at OPS_RESOLVE_MAX_PROMPT_CHARS = 4e4 (index.js:7748, used :7790; batch loop promptLength = system+user chars, :7296). The extract call (buildOpsExtractPrompt, :6353, :7599-7610) has no cap of its own derivable here. 40000 chars -> ceil(40000/3)*1.10 = 14667 tokens > 2048. Batch size floor is 10 items (:7256-7293, from maxOutputTokens 2048*0.8/150 -> 10).
  - Heal prompt bound: FAILS. HEAL_MAX_PROMPT_CHARS = 4e4 (index.js:8151, used :8785); fact bodies up to 4000 chars (:6160), anchors <= 50 x 800 chars (:6158, :6162), tasks <= 50 (:6161). 40000 chars -> 14667 tokens > 2048. Over budget even by the engine's own cap, so a 4096 context cannot be proven to fit.
  - Decision (applied / not applied) and why:
- [x] 4 RAM warning before download (A4).
- [x] 5 Pause state without resume data normalized in store and service (B1).
- [x] 6 Machine: restore, pause, resume, error paths (B1, B2, B6).
- [x] 7 Machine: existing file, smoke marker, smoke-failed state, orphans (B4, B5, B7, A6).
- [x] 8 Hook, layout and screens (B3, B5 UI, B7, restore).
- [x] 9 Version, full suite, tsc, lint.
  - Version chosen and why: 8.1.0. origin/main is 8.0.1 (d8cd194); #106 and #107 have not merged; branch already contains origin/main. JS/TS-only with a user-visible addition = MINOR. Bumped package.json, package-lock.json (two fields), app.json.
  - `npm test` tail: Test Suites: 66 passed, 66 total; Tests: 462 passed, 462 total.
  - `tsc` output: none (clean).
  - lint output: `npm run lint` (expo lint, eslint): 0 errors, 31 warnings (all warnings, none fail the run). Prettier is not part of lint and is not enforced repo-wide (it flags untouched files too).
  - Requirement -> test trace (A1-A6, B1-B7):
    - A1: __tests__/modelLoadParams.test.ts "falls back to a 4096 context when none is given" and "custom import: 4096 context, no pinning on iOS, no low-memory profile"; provider/smoke use it: llamaProvider.test.ts "never pins weights on iOS, whatever the manifest says", modelSmokeTest.test.ts "never pins weights on iOS even when the manifest says useMlock".
    - A2: modelLoadParams.test.ts "never pins weights on iOS, whatever the manifest says" (also "leaves Android exactly as today...").
    - A3: modelManifest.test.ts "carries a comfortable-RAM threshold per model"; modelLoadParams.test.ts "compares strictly below the threshold" and "treats total memory %p as unknown".
    - A4: modelHubRamWarning.test.tsx "warns on a 3 GiB device, then sends only after Continue", "does not warn Smarter & Slower on an 8 GiB device", "keeps today's behavior when total memory is unknown"; modelRamWarning.test.ts "warns when RAM is known and below the threshold".
    - A5: lever 1: modelLoadParams.test.ts "adds the quantized KV cache on low-memory iOS", llamaProvider.test.ts "quantizes the KV cache on a device below the comfortable RAM". Lever 2 not applied (see task 3): modelLoadParams.test.ts "keeps the 8192 context on low-memory iOS (A5 lever 2 not applied)". Lever-1 smoke on simulator/device: on-device only, no automated test.
    - A6: modelHubMachine.test.ts "{ ok: false } persists smoke-failed and uses the copy by memory" and "restoring smoke-testing goes to smokeFailed with the memory message"; screen copy: modelHubDownloadSmokeFailed.test.tsx "smokeFailed shows the message and two actions".
    - B1: modelDownloadState.test.ts "normalizePauseState is null unless resumeData is a non-empty string", "get() reads a paused row without resumeData as pauseState null, keeping status", "set() stores NULL for a pauseState without resumeData"; modelDownloadService.test.ts "pauseDownload resolves null when savable has no resumeData"; modelHubMachine.test.ts "restored pause with no pause state stays paused until RESUME starts fresh", "a pause that returns null resumes with a fresh start".
    - B2: modelHubMachine.test.ts "restored pause with resume data stays paused and RESUME resumes it".
    - B3: useModelHub.test.ts "sends APP_BACKGROUND only on background and APP_FOREGROUND on active" (ModelHubProvider AppState).
    - B4: modelHubMachine.test.ts "reuses a complete file on select", "reuses a complete file on restore".
    - B5: modelHubMachine.test.ts "a rejecting smoke test reaches smokeFailed and keeps the file", "does not call runSmokeTest until the smoke-testing marker write finishes", "restoring smoke-testing goes to smokeFailed...", "restoring smoke-failed does not run the smoke test until RETRY, then completes", "RETRY after the file is gone fails...", "CHOOSE_ANOTHER deletes the file, clears state and returns to selecting"; modelSmokeTest.test.ts "resolves { ok: false } and does not delete the file when initLlama throws"; modelDownloadState.test.ts "round-trips smoke-testing and smoke-failed statuses"; useModelHub.test.ts toRestoreState "returns state for %s".
    - B6: modelHubMachine.test.ts "pauseTask rejection lands in failed", "verifyTask rejection lands in failed", "checkNetworkActor rejection returns to selecting with a banner, and SELECT_MODEL works again", "a rejecting smoke test reaches smokeFailed and keeps the file", "stale resume data: a rejected resume fails...".
    - B7: modelFiles.test.ts "deletes only the catalog files that are not the kept model", "keeps a file whose uri is the current model path", "never propagates a delete failure"; modelHubImport.test.tsx "cleans orphaned catalog files after the pick and before the copy"; useModelHub.test.ts "deleteOrphanedModelFiles passes the keep id and stored path" and "skips cleanup and resolves when getModelPath rejects". Machine-side trigger on curated download start: no dedicated machine test found (covered through the api wiring only).
- [ ] 10 Cleanup commit (after user review).

## Plan-level calls not in the spec

- A failed network check returns to the list with an error banner
  instead of the `failed` state, because the list has no Retry button
  (spec B6 amended to match).
- A file check that throws before a download is treated as "no file".
- `FAIL` during a download clears the pause state, so Retry never
  replays stale resume data.
- A custom import deletes its own copied file when its smoke test
  fails, because the smoke test no longer deletes anything.
- The hub list navigates to the download screen for every install
  state, not only `downloading`, so a reused complete file still shows
  the test-load screen.

## Owed on device (user, after delivery)

- [ ] Fast & Light on iPad Air 3: passes, or fails with the memory message; no second kill.
- [ ] Pause / kill / relaunch / Resume: no error. Control Center mid-download: keeps going.
- [ ] If it passes: time to first token and tokens per second.
