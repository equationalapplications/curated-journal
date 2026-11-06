# Plan — sideload signing guard + brand follow-up

Transient scaffolding (AGENTS.md SDD); deleted in the same-PR cleanup
commit. Spec: `spec.md` in this folder.

## Steps

1. **Assets** (R3): `/tmp` PIL script — sample cream from master; chroma-key
   monogram (RGB distance, feathered alpha); scale to 62% safe zone; write
   foreground (transparent), background (solid cream), monochrome (white
   silhouette), splash-icon (cream rounded-square tile). sips: convert the
   two store previews to JPEG.
2. **Guard plugin** (R1): `plugins/with-sideload-release-guard.js` using
   `withAppBuildGradle`; append guard block; wire in `app.json` plugins.
3. **Docs** (R2 + R4): VERSIONING.md (cert check, lineage statement,
   bullet-1/3 fix, step-2 tense, SHA-1 verify command, github-apk warning);
   README specs path; AGENTS.md single decisions list; `.gitignore`
   comment/dedupe; old-spec Files-touched amendment.
4. **Bump**: 7.0.0 in package.json (npm version), app.json (edit),
   package-lock.json (npm version handles).
5. **Verify**: `npx expo prebuild --platform android --no-install` → grep
   guard + signing wiring in generated tree; lint / tsc / jest.
6. **PR**: draft → CI + reviews → implemented → cleanup commit (delete
   plan.md/LEDGER.md) → merge.

## Decisions while in flight

See LEDGER.md.
