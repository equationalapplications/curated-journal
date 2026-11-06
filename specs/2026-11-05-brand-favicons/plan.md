# Plan — cj-c-v3 icon + favicon + store pack

- **Date:** 2026-11-05
- **Spec:** `spec.md` (status: Reviewed)

1. **Assets in.** Copy `curated-journal-app-icon-1024.png` →
   `assets/images/icon.png`; `favicon-cj-c-v3-48.png` →
   `assets/images/favicon.png`; the four store files → `assets/store/`.
   Verify each copy by PIL dimensions + sha256 match against the source.
   Risk: none (pure adds/replacements).
2. **AGENTS.md.** Update the "Where decisions live" specs pointer to
   `specs/<name>/`; append the SDD enforcement block (pattern
   2026-11-05). Risk: none.
3. **Gates.** `npx tsc -p tsconfig.test.json --noEmit`, `npm run lint`,
   `npx jest --ci` in the worktree (node_modules symlinked from the main
   checkout — dependency tree unchanged on this branch). Risk: low;
   data-only change. Manual smoke (`npx expo start -c`) noted for Kurt's
   local check — not runnable headless here.
4. **Cleanup.** Delete `plan.md` + `LEDGER.md` in the same-PR cleanup
   commit; flip the PR out of draft.
