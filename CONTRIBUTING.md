# Contributing to Curated Journal

Thanks for your interest. Curated Journal is MIT-licensed and built in the
open. This file covers what you need to work on it.

## Read first

- [`INTENT.md`](./INTENT.md) — why the app exists and the rules it must
  follow. If a proposed change contradicts INTENT on *intent*, INTENT is
  amended first (through PR review), not designed around.
- [`AGENTS.md`](./AGENTS.md) — operational notes and known platform
  gotchas (several of these cost real debug rounds).
- [`docs/VERSIONING.md`](./docs/VERSIONING.md) — every change to `main`
  carries a version bump, decided by OTA compatibility.

## Development setup

Prerequisites: Node.js ≥ 22 (CI runs Node 26) and npm. For device work,
Android Studio and/or Xcode per the standard [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
toolchain — read the versioned Expo docs, not generic tutorials; Expo has
changed.

```bash
npm ci --no-audit --no-fund   # installs + runs patch-package
npm start                     # expo dev server
npm run android | ios | web   # platform targets
```

Optional dev helpers:

```bash
npm run dev:model             # auto-load a cached GGUF model in dev builds
npm run seed:night-shift      # generate an importable OKF seed bundle
```

## Checks before every pull request

CI runs exactly these — run them locally first:

```bash
npx tsc -p tsconfig.test.json --noEmit   # type check
npm run lint                             # expo lint
npx jest --ci                            # full test suite
```

CodeQL security analysis runs separately on pull requests; keep `npm ci`
warnings about advisory counts honest rather than overriding audits.

## How changes land

1. **Branch + PR.** `main` accepts pull requests only.
2. **Spec first for features.** New features start as a spec under
   `docs/superpowers/specs/`, based on reading the real code. Spec, plan,
   and implementation go in one pull request.
3. **Version bump in the same PR.** MAJOR (breaks OTA for shipped
   binaries — anything touching native surfaces), MINOR (OTA-safe
   feature), PATCH (fix). Decision table: [`docs/VERSIONING.md`](./docs/VERSIONING.md).
   If a PR changes behavior described in `INTENT.md`, update that rule's
   Status line in the same PR.
4. **Green CI, resolved review threads.** Unresolved questions hold the
   PR.
5. **Releases** follow the train in `docs/VERSIONING.md` (bump PR →
   prebuild → verify generated version stamps → build).

## Reporting issues

Open a GitHub issue with the device/OS, the app version (Settings →
About), and steps to reproduce. For model-hub problems, include the model
name and quantization.
