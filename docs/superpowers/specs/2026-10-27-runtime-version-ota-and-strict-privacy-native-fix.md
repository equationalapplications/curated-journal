# Runtime version & OTA fix + strict-privacy launch gate — design

**Status:** Implemented in this PR. **Closes #64** (runtime policy half
fully; dead-path cleanup half moved to #65). **Intents:** `INTENT.md`
rules 10 (OTA-driven versioning), 11 (strict privacy), 9 (sandbox
traffic). **Reviewed ruling:** Kurt, 2026-10-27 — adopt the Clanker
derived-MAJOR runtime-version model (verified by explanation-back).

## Problem

`app.json` sets `runtimeVersion: { policy: "appVersion" }`. Under that
policy the runtime version **is** the app version, and the versioning
policy bumps the version on every change — so every MINOR/PATCH change
starts a new runtime island and no over-the-air update can ever reach an
installed binary (Tier-3 review MAJOR-1; #64).

Related, same native surface: expo-updates checks for updates natively at
launch (`EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS` in the generated manifest)
before any JavaScript runs, so rule 11's strict privacy cannot be honored
from app start by any JS-only toggle (Tier-3 review MAJOR-3).

## Chosen mechanism (Clanker's model)

`app.config.ts` (new; Expo gives a dynamic config precedence over
`app.json`, which stays the base and is imported):

```ts
import appJson from './app.json'
const breakingChangeVersion = appJson.expo.version.split('.')[0] // "2"
const runtimeVer = `${breakingChangeVersion}.0.0`                // "2.0.0"

export default {
  expo: {
    ...appJson.expo,
    updates: { ...appJson.expo.updates, checkAutomatically: 'NEVER' },
    runtimeVersion: runtimeVer,
  },
}
```

- The runtime version is an explicit string derived from the MAJOR: it
  changes **only** when the MAJOR changes — exactly when the versioning
  policy already says compatibility broke.
- MINOR and PATCH bumps keep the same runtime version, so OTA updates
  address every installed binary on that MAJOR.
- `checkAutomatically: 'NEVER'` stops the launch-time native check; the
  app controls when checks happen (strict privacy groundwork — the mode
  UI itself is rules 11–14, Planned, not here).

## Worked example

Phone has CJ 2.0.0, runtime "2.0.0". We merge a fix; version 2.0.1, MAJOR
still 2, runtime still "2.0.0". `eas update` publishes for "2.0.0" — the
phone accepts it. Later a native change lands; version 3.0.0, runtime
"3.0.0" — a new island, correctly requiring a store install. Under the
old policy the first step already failed: the update was tagged "2.0.1"
and no phone ever ran 2.0.1.

**Transition note:** all pre-3.0.0 installs are effectively stranded: a
2.0.1 label matches nothing the new scheme publishes, and reaching 2.0.0
installs would need a maintained 2.x branch, which does not exist. They
get the fixes through the 3.0.0 store install. The stranding is the
accepted cost of the one-time MAJOR.

## Bump & doc consequences (this PR)

- Native config change → **MAJOR: 2.0.1 → 3.0.0** in the three synced
  files (same-PR bump per VERSIONING.md).
- `INTENT.md` rule 10 status: Partly built → the delivery-blocking policy
  is fixed; remaining open: device smoke test + rollback drill.
- `INTENT.md` rule 11 status: launch-time gate now configured
  (`checkAutomatically: 'NEVER'`); the mode system itself stays Planned.
- `INTENT.md` glossary runtime-island entry: island now derives from the
  MAJOR, matching the intended behavior.
- `docs/VERSIONING.md`: MINOR/PATCH rows deliverable again; when-in-doubt
  prebuild test works as originally written (version stamps only move on
  MAJOR); release train adds a runtime-version check.

## Out of scope

- The privacy-mode UI and rule 11–14 machinery (Planned, separate specs).
- Dead reembed/prune path removal (#65, JS PATCH).
- OTA device smoke test and rollback drill (open follow-up, unchanged).
