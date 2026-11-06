# LEDGER — 2026-11-05-brand-favicons (curated-journal)

What's in flight: implementation on branch `assets/2026-11-05-brand-favicons`,
PR #85 (draft → ready after cleanup commit).

- [x] 1. Assets copied + verified (dims + sha256) — 6/6 files sha-match,
      dims: icon 1024×1024, favicon 48×48, store 512²/1024×500/2400×2000/1440×2560
- [x] 2. AGENTS.md pointer + SDD block — "Where decisions live" →
      `specs/<name>/`; "## Spec workflow (SDD)" block appended
- [x] 3. Gates: tsc / lint / jest --ci pass (real output) — TSC-PASS;
      lint 0 errors (31 warnings, pre-existing); jest 58/58 suites,
      362/362 tests, 32.8s
- [ ] 4. Cleanup commit (plan/LEDGER deleted); PR ready
