# Spec: iPad support

**Status: Implemented** — 2026-11-12. One PR carries spec + plan + implementation
+ version bump (MAJOR → 9.0.0, native config change, new binary required);
`plan.md`/`LEDGER.md` are transient and deleted in the same-PR cleanup
commit (AGENTS.md SDD workflow).

## Why this cycle exists

User report 2026-11-12 (iPad Air 3rd gen, TestFlight): the keyboard covers
the journal title field when typing. `app.json` never set
`ios.supportsTablet`, so prebuild generates `TARGETED_DEVICE_FAMILY = 1`
(iPhone only). iPadOS runs the app in iPhone compatibility mode, where
the keyboard frame and window size disagree, so keyboard avoidance
(`react-native-keyboard-controller`) mis-measures and inputs end up
under the keyboard. The same mode keeps the window at phone width, so the
split-pane layout (`SPLIT_PANE_MIN_WIDTH` = 768) never shows on iPad.

## INTENT check

No conflict. INTENT is about on-device, private journaling. It names no
device family.

## Requirements

**R1 — Universal iOS app.** `app.json` sets `expo.ios.supportsTablet: true`,
so prebuild generates `TARGETED_DEVICE_FAMILY = "1,2"` and an
`UISupportedInterfaceOrientations~ipad` list.

**R2 — Multitasking-compatible.** The existing `orientation: "default"`
(all four orientations) and `UIRequiresFullScreen: false` stay, so the
app supports iPad Split View, Slide Over and Stage Manager. The
split-pane layout follows window width, so narrow multitasking windows
fall back to the phone layout.

**R3 — MAJOR version.** This regenerates native project settings, so it
is MAJOR (docs/VERSIONING.md): 9.0.0, runtime version 9.0.0. Installed
8.x binaries never receive it over the air.

## Out of scope

- iPad-specific layout work beyond what the existing split-pane layout
  provides.
- Model memory limits on iPad (separate cycle: iOS low-memory model
  config and download restore).

## Release notes for the operator

- App Store review requires iPad screenshots (13-inch) once the binary
  declares iPad support. TestFlight does not.
- Apple does not allow removing iPad support from a shipped app later.
  This is a one-way door.

## Verification

- Unit test: `appConfig.test.ts` asserts `ios.supportsTablet === true`.
- `npx expo config --type introspect` shows `supportsTablet: true`, the
  `~ipad` orientations and `UIRequiresFullScreen: false`.
- After the next local prebuild: `TARGETED_DEVICE_FAMILY = "1,2"` in the
  generated pbxproj.
- On device (user, iPad): the app fills the screen, the title field stays
  above the keyboard, and the three-pane layout shows in landscape.
