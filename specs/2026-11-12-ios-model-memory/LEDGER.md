# Ledger: iOS model memory and download restore

Tick each line when its task's tests pass and it is committed. Evidence
goes under the line it belongs to.

- [x] 1 Load-parameter function and manifest RAM field (A1, A2, A3, A5 lever 1).
  - Lever 1 package check (file:line for `q8_0`, `flash_attn_type`, JSI parsing): node_modules/llama.rn/src/index.ts:196-224 (`flash_attn_type?: 'auto'|'on'|'off'` L198; `q8_0` in cache_type_k L202, cache_type_v L211, validCacheTypes L224); cpp/jsi/JSIParams.cpp:379-388 (`flash_attn_type`, `cache_type_k`, `cache_type_v` all read into cparams).
- [x] 2 Smoke test, provider and import use the function; smoke test keeps the file.
- [ ] 3 Context lever (A5 lever 2).
  - Chat prompt bound:
  - Librarian prompt bound:
  - Heal prompt bound:
  - Decision (applied / not applied) and why:
- [ ] 4 RAM warning before download (A4).
- [ ] 5 Pause state without resume data normalized in store and service (B1).
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
