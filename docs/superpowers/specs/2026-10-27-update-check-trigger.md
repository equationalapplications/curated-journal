# Explicit update-check trigger — design

**Status:** Implemented in this PR. **Closes #68.**
**Intents:** `INTENT.md` rules 9 (sandbox traffic), 10 (OTA delivery),
11 (strict privacy). Spec-first companion to the runtime-version fix
(`2026-10-27-runtime-version-ota-and-strict-privacy-native-fix.md`).

## Problem

#64 disabled automatic launch-time update checks
(`checkAutomatically: 'NEVER'`) so strict privacy can hold from app
start. With no in-app trigger, the app then never checked for updates at
all: island addressing was fixed but delivery was dormant end-to-end.

## Mechanism

`src/lib/updateCheck.ts` — the one sanctioned network path for checks:

- Dev builds and disabled-OTA environments short-circuit to
  `unavailable` (no network call at all).
- Otherwise: `checkForUpdateAsync` → if an update exists,
  `fetchUpdateAsync` → result `update-downloaded`.
- **No auto-reload.** Applying an update restarts the app, which would
  interrupt a journal session; the UI tells the user to restart instead.
- API failures wrap in `UpdateCheckError` so the screen can show an
  honest failure.

`src/app/(tabs)/settings.tsx` — new "App updates" section: a Check
button with idle / checking / result / failed states and honest copy.

## Doc consequences

- `INTENT.md` rule 9: user-started update checks join model downloads as
  the traffic the app itself starts; checks never run automatically.
- `INTENT.md` rule 10 status: island addressing + check trigger in place;
  device smoke test + rollback drill remain open.
- `INTENT.md` rule 11 / `README` / `docs/VERSIONING.md` step 0: the
  trigger exists since 3.0.1, so the first OTA-capable release is 3.0.1.
- PATCH bump 3.0.0 → 3.0.1 (JS/TS-only).

## Out of scope

- Privacy-mode gating of the trigger (rules 11–12, Planned — until modes
  exist the trigger is available to everyone, which is today's default
  mode by definition).
- Automatic checks returning as a mode unlock.
