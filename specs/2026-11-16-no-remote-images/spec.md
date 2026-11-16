# Spec: never load remote images inside notes

**Status: Implemented** — 2026-11-16 (PR #120, 9.1.2)
Approved by the owner: ruling of 2026-11-16 on #118 (behavior approved; no further review gate).
The owner's ruling on #118 (2026-11-16) served as spec approval (Reviewed).
Date: 2026-11-16
Version cost: PATCH (9.1.1 → 9.1.2) per `docs/VERSIONING.md`
Closes: #118

## Problem

A note whose text holds a Markdown image with a remote URL (`![alt](https://…)`) makes the app fetch that image as soon as the note is shown, with no user action. Note text can come from the on-device model or an imported bundle. This breaks INTENT rule 9 ¶2 ("nothing else runs on its own") and the published privacy policy in today's default mode.

## Evidence

`react-native-markdown-display`'s default `image` rule renders `react-native-fit-image`, which renders an RN `Image` with the remote `source.uri` and calls `Image.getSize`. Three renderers use it: `JournalPane`, `src/app/entry/[factId].tsx`, `GraphNodeSheet`. A `grep` of `src/` finds no other Markdown renderer (`JournalEntryEditor` is a plain `TextInput`).

RED on `main` (94296e7 plus the new test, fix not applied): `__tests__/markdownNoRemoteImages.test.tsx` fails for all three renderers. A rendered `Image` carries `source={{"uri": "https://example.com/x.png"}}` (the protocol-relative `//example.com/y.png` is normalized by the library to `https:////example.com/y.png`), and `Image.getSize` is called.

## Owner ruling

2026-11-16, recorded on #118 and in the privacy-mode spec PR #117 (R6 / OQ-4): block remote images in both modes and ship now as a separate PATCH, without waiting for Step 2.

## Change

- New `src/lib/markdownRules.tsx` exports one `markdownRules` override whose `image` rule never renders an `Image`. It renders a plain `Text` (testID `markdown-image-placeholder`): `[image: <alt>]` (or `[image]`) followed by the source as non-link text.
- All three renderers pass `rules={markdownRules}`.
- Local sources: nothing in the app produces local image sources (notes are text; no attachments, no asset store). So ALL images are blocked, remote or not, with no scheme allowlist to get wrong (`http:`, `https:`, `//`, `data:`, `file:` and anything else alike).
- Links stay unchanged (not auto-fetched; out of scope).

## Rejected alternatives

- Block only `http(s):` and `//`: a scheme blocklist misses `data:`/odd schemes; blocking everything is simpler and nothing local exists.
- Per-image tap-to-load: a feature (and a privacy-mode design question), not a PATCH; belongs to the privacy-mode spec if wanted.
- Strip images from the stored note text: mutates user data; render-time blocking leaves the note intact.
- Per-renderer overrides: three copies drift; one shared rule set.

## Tests

`__tests__/markdownNoRemoteImages.test.tsx`: renders each of the three renderers with a note holding `![alt text](https://example.com/x.png)` and `![p](//example.com/y.png)`. Asserts the rendered tree holds no `Image`/`source` node (structural, per the jest-expo gotcha), that the `markdown-image-placeholder` is present, and that `Image.getSize` / `Image.prefetch` spies are never called. RED on main, GREEN after.

## INTENT check

Rule 9 ¶2 (nothing runs on its own) is restored; the change adds no network, no state, no second store. Rule 1 (works offline) is unaffected. No contradiction.

## Verification

- [x] `npx tsc --noEmit`, `npm run lint`, `npx jest --maxWorkers=2` pass.
- [ ] On device: open a note with a remote image; the text placeholder shows and a proxy sees no request for the image.
