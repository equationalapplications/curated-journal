# Plan: iPad support

1. Failing test in `__tests__/appConfig.test.ts` (R1).
2. `app.json`: `ios.supportsTablet: true`.
3. Bump app.json, package.json, package-lock.json to 9.0.0 (R3).
4. Introspect the config, then run the full test suite, tsc and lint.
5. Cleanup commit: delete plan.md and LEDGER.md.
