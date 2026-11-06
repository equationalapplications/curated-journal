# Curated Journal brand icon + web favicon (cj-c-v3)

- **Date:** 2026-11-05
- **Status:** Draft — pending Kurt's spec approval (delivery flow Step 1)
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
2. `assets/images/icon.png` ← `favicon-cj-c-v3-512.png` (Expo app icon;
   `app.json` `icon` and `plugins.expo-router` `icon` paths unchanged).
3. **AGENTS.md** — add the SDD enforcement block per the 2026-11-05
   pattern and update its "Where decisions live" pointer from the older
   flat `docs/superpowers/{specs,plans}/` layout to `specs/<name>/` (one
   folder per cycle: `spec.md`, `plan.md`, `LEDGER.md`).

### Known limitation (accepted)

Expo recommends a 1024×1024 app icon; the approved set tops out at 512.
Accepted for now — the App Store marketing icon is supplied separately at
release time, and no current build gate enforces 1024.

### Non-goals

- Android adaptive icons (foreground/background/monochrome) and
  `splash-icon.png` keep their existing art — the approved set has no
  variants for them.
- No OTA/versioning changes.

## Files touched

- `assets/images/favicon.png` (replaced)
- `assets/images/icon.png` (replaced)
- `AGENTS.md` (one block + pointer update)

## Test plan

- `npx tsc -p tsconfig.test.json --noEmit`, `npm run lint`, and
  `npx jest --ci` locally — read real output (all should be unaffected;
  this is a data-only change).
- CI (`ci.yml`) green on the PR.

## INTENT alignment

Checked `INTENT.md` 2026-11-05: brand assets; no intent conflict.
