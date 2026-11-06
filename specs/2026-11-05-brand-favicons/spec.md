# Curated Journal brand icon + web favicon (cj-c-v3)

- **Date:** 2026-11-05
- **Status:** Implemented (2026-11-05: tsc PASS; lint 0 errors/31
  pre-existing warnings; jest --ci 58 suites / 362 tests PASS)
- **Branch:** `assets/2026-11-05-brand-favicons`
- **Priority:** Low — cosmetic, no runtime behavior change

## Problem

Curated Journal still ships placeholder branding: `assets/images/icon.png`
is a 799 KB unbranded image and `assets/images/favicon.png` a 1.1 KB
placeholder. Kurt approved the final brand asset set `cj-c-v3` on
2026-11-05 (`.ico` + 16/32/48/512 PNG + 180 apple-touch) and ruled: the
Expo app icon is replaced from the new 512px, and the web favicon from the
48px.

## Approach

1. `assets/images/favicon.png` ← `favicon-cj-c-v3-48.png` (Expo web
   export favicon; `app.json` `web.favicon` path unchanged).
2. `assets/images/icon.png` ← `curated-journal-app-icon-1024.png` (the
   1024×1024 master app icon, re-rendered at 1024; `app.json` `icon` and
   `plugins.expo-router` `icon` paths unchanged). Satisfies Expo's
   1024×1024 recommendation — the favicon set's 512px variant is
   web-only, and `curated-journal-google-play-icon-512.png` is the Play
   store listing icon, not the app icon (Kurt, 2026-11-05).
3. **AGENTS.md** — add the SDD enforcement block per the 2026-11-05
   pattern and update its "Where decisions live" pointer from the older
   flat `docs/superpowers/{specs,plans}/` layout to `specs/<name>/` (one
   folder per cycle: `spec.md`, `plan.md`, `LEDGER.md`).

### Store assets (2026-11-05 second and third zips)

Kurt ruled the store assets are version-controlled in this repo. In
`assets/store/` (no `app.json` wiring — Play Console uploads):
`curated-journal-google-play-icon-512.png`,
`curated-journal-store-banner-1024x500.png`,
`curated-journal-store-assets-preview.png` (2400×2000),
`curated-journal-splash-1440x2560.png`, and — from the third delivery,
"new for CJ" — `curated-journal-banner.png` (2400×800 brand banner) and
`curated-journal-banner-preview.png` (2400×2080). The existing
`splash-icon.png` behavior is unchanged.

### Splash drift (accepted)

`splash-icon.png` stays untouched this cycle, so the splash screen
briefly shows the old placeholder art while the app icon is already
`cj-c-v3` branded. Implementer ruling: accepted — the drift is temporary
and cosmetic, and the replacement 1440×2560 splash art already sits
in-repo under `assets/store/` for a fast follow-up spec that wires it
into `app.json` properly.

### Non-goals

- Android adaptive icons (foreground/background/monochrome) and
  `splash-icon.png` keep their existing art — the approved set has no
  variants for them.
- No OTA policy changes. The version bump required by the versioning
  policy still applies — MAJOR, because `assets/images/icon.png` feeds
  native prebuild (launcher icons), so the change ships only in a new
  binary.

## Files touched

- `assets/images/favicon.png` (replaced)
- `assets/images/icon.png` (replaced)
- `assets/store/*` (6 files)
- `AGENTS.md` (one block + pointer update)
- `INTENT.md` (static-INTENT rule codified; amended 2026-11-06: this
  list originally omitted INTENT.md and the version files — see
  `specs/2026-11-06-sideload-signing-brand-followup/`)
- `app.json`, `package.json`, `package-lock.json` (6.0.0 MAJOR bump)

## Test plan

- `npx tsc -p tsconfig.test.json --noEmit`, `npm run lint`, and
  `npx jest --ci` locally — read real output (all should be unaffected;
  this is a data-only change).
- Manual smoke: `npx expo start -c` — Metro and browsers aggressively
  cache in-place-replaced icons (the `favicon.png`/`icon.png` paths are
  unchanged), so clear the cache or the old placeholder art masquerades
  as a failed swap (Kurt review note, 2026-11-05).
- CI (`ci.yml`) green on the PR.

## INTENT alignment

Checked `INTENT.md` 2026-11-05: brand assets; no intent conflict.
