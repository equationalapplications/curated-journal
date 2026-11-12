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
- [ ] 6 Machine: restore, pause, resume, error paths (B1, B2, B6).
- [ ] 7 Machine: existing file, smoke marker, smoke-failed state, orphans (B4, B5, B7, A6).
- [ ] 8 Hook, layout and screens (B3, B5 UI, B7, restore).
- [ ] 9 Version, full suite, tsc, lint.
  - Version chosen and why:
  - `npm test` tail:
  - `tsc` output:
  - lint output:
  - Requirement → test trace (A1–A6, B1–B7):
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
