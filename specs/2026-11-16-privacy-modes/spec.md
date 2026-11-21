# Spec: privacy modes — strict privacy and Standard, the default mode

**Status: Draft** — first written 2026-11-16; amended the same day
(owner answers OQ-1 through OQ-8, then review findings applied); owner
ruling 2026-11-21 applied (note links never open in either mode).
ROADMAP Step 1 (BINDING).

How this spec moves (INTENT "How changes are made", item 1, followed
literally — owner ruling 2026-11-16; AGENTS.md lifecycle):

- Spec, plan and implementation go in one pull request: #117. It stays
  open as a draft for the whole cycle.
- When the owner approves the spec, the status line above becomes
  `Reviewed`. Then `plan.md` and `LEDGER.md` are added to this folder,
  and the Step 2 implementation lands in this same pull request.
- When the implementation is complete and automated verification
  passes (type check, lint, tests), the status line becomes
  `Implemented`. A cleanup commit in this pull request then deletes
  `plan.md` and `LEDGER.md`, and only after that does the pull request
  leave draft. On-device checks never hold any of these steps.
- No question is open for the owner: the two raised in review were
  answered (2026-11-21; Open questions for the owner, at the end).
  Step 2 waits on the owner's approval of this spec.

How to read it: what PR #125 already does is described once, in
**Baseline** (items BL1–BL11). Every new or changed hub-machine event,
state and flag is one row of **Step 2 machine changes** (rows M0–M13).
Requirements cite those two sections instead of restating them.

## Why this cycle exists

INTENT.md promises that the user picks a privacy mode (rule 11), that
the strictest mode lets nothing leave the device (rule 11), and that
today's behavior becomes the app's default mode (rule 9, paragraph 2).
None of that is in the code. `src/lib/privacyMode.ts` is a stub:
`getPrivacyMode()` always returns `'default'`, and only the tip jar asks
it anything.

Every later step depends on these two modes: the mode ladder (Step 3),
sync (Steps 4 and 5) and pairing (Steps 6 and 7). A mode can only be
unlocked from a strict mode that already exists. So this spec writes
the two modes down, before Step 2 builds them and before any unlock
mode exists.

Owner rulings, 2026-11-16, encoded below:

- A model download that is running when the user turns on strict
  privacy **pauses at once, and what it has so far is kept**. It never
  resumes on its own. It resumes only after the user leaves strict
  privacy and asks to resume (R10).
- Picking a model file already on the device, with the manifest's
  integrity checks, is issue
  [#115](https://github.com/equationalapplications/curated-journal/issues/115).
  It needs its own spec and is **out of scope** here.
- The default mode is today's behavior, given a name (ROADMAP Step 1).
- The answers to OQ-1 through OQ-8, the Cancel behavior in OQ-6, and
  the lifecycle above, all listed under Resolved questions. Two of them
  ship as their own changes: remote images in notes are
  blocked now, in both modes, by
  [#118](https://github.com/equationalapplications/curated-journal/issues/118)
  (PATCH), and `expo-iap`'s launch-time StoreKit listeners are removed
  by [#119](https://github.com/equationalapplications/curated-journal/issues/119)
  (MAJOR).
- A model download the user started keeps carrying on by itself, after
  a background pause and after a kill, but every continuation (those
  two, plus a manual Resume and Retry) goes through the same network
  check as a fresh download, which asks first on cellular data. That
  ships now as its own PATCH,
  [#124](https://github.com/equationalapplications/curated-journal/issues/124)
  (PR [#125](https://github.com/equationalapplications/curated-journal/pull/125);
  Baseline).

Lead rulings, 2026-11-16 unless dated, encoded below (the owner may
overrule each):

- A successful custom import, which the user chooses, abandons any kept
  download, in both modes; a failed copy or smoke test leaves the row
  and its model file intact (R10i; BL7).
- Importing, or picking a different model, while a download is kept
  asks first (R10i).
- R10g's Cancel restarts at once only on Wi-Fi; on cellular or offline
  it waits for the hub's network check (R10g).
- The hub's Turn on strict privacy control shows only at rest (R7), and
  `paused` (2026-11-16) and `failed` (2026-11-20) each get a "Choose
  another model" exit in any mode (R10e; M6, M11).
- 2026-11-20: a pause that fails cancels the live transfer, so no
  state at rest ever has a transfer in flight (M0;
  [#132](https://github.com/equationalapplications/curated-journal/issues/132)).
- 2026-11-20: a strict refusal and a strict stop reach the machine as
  one error type, `PrivacyGateError`, with a `reason` (R4, R10a; M4a,
  M4b).

(PR #125 and this PR, like #120, carry version 9.2.1 for now; whichever
merges later re-bumps, so this spec cites those PRs without versions.)

## INTENT check

Checked against INTENT.md (static since 2026-11-04) and ROADMAP v1.2.
No requirement here contradicts INTENT on intent. The check found six
tensions. INTENT wins each one, or the owner has ruled on it, or (item
6) the reading waits on the owner:

1. **Status lines.** ROADMAP Step 2 says rule 9's and rule 11's status
   lines change in the Step 2 pull request. INTENT.md has been static
   since the 2026-11-04 ruling (no status lines, no delivery progress),
   and AGENTS.md repeats it. So Step 2 does not edit INTENT.md (R16).
   The ROADMAP sentence is stale. Amending it is not part of this PR.
2. **"Today's behavior" had a leak.** Rule 9, paragraph 2, says the
   default mode has three kinds of traffic (model downloads, update
   checks and tips, each started by the user) and "nothing else runs on
   its own". The survey found one automatic request in today's code:
   images inside a note load from the internet when the note is shown
   (path 8). The owner confirmed the block in both modes (OQ-4); #118
   ships it now as a PATCH, and Step 2 only keeps it (R6). A second
   gap: a download the user started carried on by itself without the
   cellular prompt. The owner kept the continuation and ruled that it
   goes through the same network check (2026-11-16); #124 ships that now
   (Baseline). The Standard copy names the continuation, so its
   "Nothing else goes online on its own" leans on rule 9 ¶2's "else".
   The owner ruled (2026-11-21) that no INTENT amendment is needed.
3. **Native work at launch.** Rule 11 expects "strict from launch" to
   ship as "a native, MAJOR change". ROADMAP Step 2 expects MINOR,
   because the launch-time update check was already set to never run.
   The survey found native work that runs at launch on iOS, before any
   JavaScript, which JS cannot gate (path 9). The owner ruled that it
   must go (OQ-5): that is #119, a separate MAJOR on the release train,
   which matches rule 11's expectation. Step 2 stays MINOR. Strict
   privacy from launch on iOS is complete only once #119 ships (R3).
4. **One pull request.** INTENT's "How changes are made", item 1,
   says spec, plan and implementation go in one pull request. The
   ROADMAP splits this cycle into Step 1 (this spec, gate: none) and
   Step 2 (the build, gate: "Step 1 spec approved"). The owner ruled
   (2026-11-16) that INTENT is followed literally: both steps happen in
   #117. The ROADMAP's split becomes two gates inside one pull request.
   Step 1's gate is the `Reviewed` status line. Step 2 is the plan and
   the implementation, added to the same pull request after that.
5. **Links in notes, and downloads that outlive the app.** Today's
   code opens a note's link on the user's tap, for any scheme. Note
   text comes from the model or an imported bundle, never from the
   user, so opening its links is the riskiest traffic. The owner ruled
   (2026-11-21, superseding OQ-3 and OQ-8) that no link opens in any
   mode: a tap shows an alert with the address and a Share… button.
   Standard's traffic is then exactly what rule 9 ¶2 lists (downloads,
   update checks, tips), so no INTENT amendment is needed, and the
   on-screen copy says so (rule 12). Separately, the owner ruled (OQ-7) that iOS
   downloads run in a foreground session. That changes how a Standard
   download behaves on iOS while the app is suspended, and the owner
   accepted that cost.
6. **Copies outside the database (INTENT PR #129, open).** PR #129,
   which waits on the owner, appends to rule 13: "Any out-of-file copy
   this app creates is named in this file with its retention. OKF
   exports the user takes are the user's own files; the app keeps no
   other copy of the journal outside its database." It renumbers
   nothing. This spec reads that paragraph as being about copies of the
   journal. Model files, partial downloads, resume data and the iOS
   `URLSession` temporary file are not copies of the journal, so they
   are outside it. OKF exports stay files the user hands to a picker or
   share sheet. This reading depends on #129 merging as written, and the
   owner can confirm or overrule it when ruling on #129.

Rules each requirement rests on: rule 1 (the journal works with no
network), rule 2 (models are installed only by the user, in the model
hub), rule 8 (answers cite their sources), rule 9 (the default mode),
rule 10 (version cost), rule 11 (strict privacy), rule 12 (each step
away from strict is an informed choice), rule 13 (the journal never
depends on connectivity), and the out-of-scope items "Any off-device
communication in strict privacy" and "Silent model installs".

## Survey: every path that can go off-device

Read from `main` at `94296e7` (9.1.1) on 2026-11-16, and re-checked
the same day against `main` at `748e11e` (9.2.0, after PR #116). #116
changed only the engine pins and the version stamps, so the app's own
code is the same at both commits. The list is meant to be complete for
the app's own code. A path added later must be added
here, and the coverage test in Verification fails until it is. The
survey is re-run on every engine bump (R17).

| # | Path | Code | Who it reaches | Started by | Standard | Strict |
|---|---|---|---|---|---|---|
| 1 | Model download, fresh start | `startDownload` in `src/services/modelDownloadService.ts` (`expo-file-system` `DownloadTask`, User-Agent from `src/lib/buildUserAgent.ts`). It sets no `sessionType`, so on iOS the installed expo-file-system 58.0.13 runs it in a background `URLSession`, which can keep transferring after the app is suspended or killed (Android ignores the option; its transfer runs inside the app process). Reached from `modelHubMachine` state `downloading` when the machine holds no resume data (`runDownload` picks `startDownload` or `resumeDownload` by `pauseState?.resumeData`). Every way into `downloading` — `SELECT_MODEL`, the restore when the hub opens (`src/app/model-hub/_layout.tsx`), and the continuations of path 2 — passes the network check first (BL1). | Hugging Face (`huggingface.co`, URLs in `src/catalog/modelManifest.ts`) and the file hosts it redirects to | The user. A download the app was killed during restarts by itself when the hub next opens, behind the network check (BL1). | Allowed | Blocked |
| 2 | Model download, resume | `resumeDownload` (`DownloadTask.fromSavable`), reached from `downloading` when the machine holds resume data: after `RESUME` (`src/app/model-hub/download.tsx`), `APP_FOREGROUND` after a background pause (automatic), or `RETRY` from `failed` with a saved pause state, each behind the network check (BL1). On Android it first passes the sink guard (BL8). | Same as 1 | The user, or the app on return to the foreground (a download the user started), behind the network check (BL1) | Allowed | Blocked |
| 3 | Update check | `checkForAppUpdates` in `src/lib/updateCheck.ts` (`expo-updates` `checkForUpdateAsync`, then `fetchUpdateAsync`). Reached only from the Check button in `src/components/settings/UpdateCheckRow.tsx`. | Expo's update service (`u.expo.dev`). It receives the platform, runtime version, channel, current and embedded update IDs, and a random ID for this install (the `EAS-Client-ID` header, set by `expo-updates`' native downloader). | The user | Allowed | Blocked |
| 4 | Launch-time native update check | Off: `updates.checkAutomatically: 'NEVER'` in `app.config.ts`, asserted by `__tests__/appConfig.test.ts` and checked on every built artifact (VERSIONING.md train step 4). | — | Nothing | Never runs | Never runs |
| 5 | Tip jar (iOS, Android) | `openTipJar` in `src/lib/tipJarStore.ts` (`expo-iap` `initConnection`, `fetchProducts`, `getAvailablePurchases`, `requestPurchase`, `finishTransaction`, `endConnection`). Reached from Open and the tip buttons in `src/components/settings/TipJarSection.tsx`. Gated today by `canUseStorePurchases()` at the start and before `requestPurchase`. | Apple App Store or Google Play | The user | Allowed | Blocked (alert exists) |
| 6 | Support link (web build only) | `Linking.openURL(SUPPORT_PAYPAL_URL)` in `TipJarSection.tsx`. Already gated by `canOpenSupportLink()`. | PayPal | The user | Allowed | Blocked (alert exists) |
| 7 | Links inside notes | `react-native-markdown-display` 7.0.2: its default `link` and `blocklink` rules call `openUrl`. Today no renderer passes `onLinkPress`, so a tap calls `Linking.openURL(href)` at once, for any scheme: `http(s)`, `mailto:`, `tel:`, other apps' schemes, and the app's own `cur://` links (markdown-it 14.3.3 drops only `javascript:`, `vbscript:`, `file:` and non-image `data:` links). Note text renders through it in `src/components/journal/JournalPane.tsx`, `src/app/entry/[factId].tsx` and `src/components/graph/GraphNodeSheet.tsx`. PR #120 (`474c7ac` on `fix/no-remote-images`) routes all three through one wrapper, `src/components/NoteMarkdown.tsx`, which forces #118's `markdownRules`; its props leave out `rules` and `renderer`. Lint rules in `eslint.config.js` forbid value-importing the library anywhere else, including its subpaths, a dynamic `import()` and a `require()` (type imports, such as `markdownRules.tsx`'s `import type { RenderRules }`, are allowed). The wrapper passes every other prop through, `onLinkPress` included. That text comes from the model or from an imported OKF bundle. | None: after the change, nothing opens. Share… hands the address to the OS share sheet, where the user chooses | The user (a tap shows an alert and nothing more) | Nothing opens, any scheme. An alert shows the full address with Share… and OK (owner, 2026-11-21; OQ-3 and OQ-8 superseded) | Nothing opens, any scheme. The same alert, strict copy (R5) |
| 8 | Images inside notes | The same library's `image` rule renders `![…](url)` with `react-native-fit-image`, which fetches the URL as soon as the note is shown. By default it allows `https://` and `http://`, and it adds `https://` to a source with no scheme. | Whatever host the image names | **Nothing; it happens on its own** | Blocked by #118 (owner, OQ-4) | Blocked by #118 |
| 9 | iOS StoreKit listeners at launch | Two sources in `expo-iap` 6.4.1, both before any JavaScript: (a) `ExpoIapAppDelegateSubscriber` creates `OpenIapModule.shared` in `didFinishLaunching`, and OpenIAP's StoreKit module then starts a `PurchaseIntent.intents` listener (iOS 16.4 and later) or adds an `SKPaymentQueue` observer (earlier iOS); (b) `ExpoIapModule`'s `OnCreate` calls `ExpoIapHelper.setupStore` when the native module is created, which adds the purchase-updated, purchase-error, promoted-product and billing-issue listeners. On Android, billing loads only on the first `initConnection`. | Apple's StoreKit on the device. This survey found no request that it sends, but cannot rule out StoreKit doing something on its own. | The app, at every launch | Runs today | Must go (owner, OQ-5): #119, MAJOR. JS cannot gate it. |

These are **not** off-device paths. They are listed so nobody has to
survey them again:

- `expo-network` `getNetworkStateAsync` (`src/lib/networkGate.ts`)
  asks the OS whether the phone is on Wi-Fi or cellular. It sends
  nothing, so it needs no gate (the coverage test lists it as "no gate
  needed"). In strict privacy the hub never needs to ask.
- `expo-asset` in `src/components/graph/GraphCanvas.web.tsx` loads
  CanvasKit's WebAssembly file (`canvaskit-wasm`), which is bundled with
  the web build and served from the page's own origin. Web only. No
  gate needed.
- `expo-web-browser`, `expo-linking` and `expo-image` are installed, but
  no file in `src/` uses them (checked 2026-11-16). The coverage test
  watches for them.
- `expo-router` moves between the app's own screens. No file in `src/`
  passes an outside `http(s)` address to `Link`, `router.push`,
  `router.replace` or `Redirect` (checked 2026-11-16). The coverage
  test watches for it.
- OS pickers and the share sheet: `expo-document-picker` (OKF import,
  `src/app/import.tsx`; model import, `src/app/model-hub/import.tsx`)
  and the Android folder picker plus `expo-sharing`
  (`src/lib/okfExport.ts`). These are covered by the charter's
  exception: a file the user hands to an OS picker or share sheet goes
  where the user sends it (rule 11 and the glossary). If the user picks
  a file that lives in a cloud drive, the drive's own app may download
  it; that is the picker acting on the user's choice, under the same
  exception.
- The wiki engine. `main` runs `@equationalapplications/core-llm-wiki`
  and `expo-llm-wiki` 9.2.0 since PR #116 (8.4.0 before). The shipped
  `dist` code of all four engine packages (`core-llm-wiki`,
  `expo-llm-wiki`, `core-okf`, `react-llm-wiki`) has no `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon`, in
  9.2.0 (the published npm tarballs of the versions `main` now pins)
  and in 8.4.0, checked 2026-11-16. The one web address in it is in a
  code comment. `llama.rn` loads a local file.
- Development only: `expo-dev-client` and Metro. Development builds
  talk to the developer's bundler. Release builds do not. On iOS,
  `expo-dev-launcher` 58.0.17's config plugin adds `_expo._tcp` to
  `NSBonjourServices` and adds an `NSLocalNetworkUsageDescription`, and
  adds a build phase, "[Expo Dev Launcher] Strip Local Network Keys for
  Release" (`withStripLocalNetworkKeysForRelease` in
  `expo-dev-launcher/plugin/src/withDevLauncher.ts`), that removes both
  from builds without the `DEBUG` condition. It removes only its own
  entries, so Verification adds an artifact check that the release
  Info.plist has neither key.
- The web build is a development and test surface (this survey found
  no deployed web app). The host serves the page itself; this spec
  covers what the app starts after the page loads.
- The app has no Bluetooth, local-network, analytics or crash-reporting
  code.

## Baseline: what PR #125 already does

PR #125 (issue #124; spec
`specs/2026-11-16-download-cellular-continuation/spec.md`; final head
`8f5f484`) ships before Step 2 as its own PATCH. This section is the
only place this spec describes its behavior. Step 2 keeps all of it,
and its tests, except where a row of Step 2 machine changes says
otherwise: M4a and M4b (how an error from `downloading` is routed),
M6 (lifts BL11), and M8 (BL1's not-verified exits, in strict only).

- **BL1 — Every continuation passes the network check.** The restore
  after a kill (`RESTORE_DOWNLOAD` of a `downloading` row →
  `checkingExisting`, whose not-verified exits, `onDone` fallback and
  `onError`, both go to `confirmingNetwork`), the foreground resume
  (`paused` + `APP_FOREGROUND`, reason `background`), a manual `RESUME`,
  and `RETRY` from `failed` with a pause state each set the
  `continuation` flag and go to `confirmingNetwork` (the state a fresh
  `SELECT_MODEL` also reaches): Wi-Fi → `downloading` with no prompt,
  cellular → `cellularConfirm`, offline → `awaitingWifi`. `downloading` resumes
  from the context's resume data if any, else starts over; its entry
  saves the row `downloading` with `pauseState: null`, so a download
  killed in the foreground restores with none and starts from the start.
- **BL2 — One owner for the cellular prompt.** `CellularConfirm`
  (`src/components/model-hub/cellular-confirm.tsx`), rendered once by
  the hub layout, shows it on whichever hub screen is in front and
  closes it whenever the machine leaves `cellularConfirm`.
- **BL3 — A declined prompt.** `CELLULAR_CANCEL` on a continuation →
  `paused` (reason `restored`, `idlePause`), keeping the pause state
  and saving the row `paused` with it (none, for a declined restore of
  a download killed in the foreground); Resume runs the check again. On
  a fresh download → `selecting`, and the download screen dismisses.
- **BL4 — Backgrounding during the check or the prompt.** For a
  continuation, `APP_BACKGROUND` in `confirmingNetwork` or
  `cellularConfirm` → `paused` (reason `background`, `idlePause`: no
  live transfer; the pause state is kept and saved). The next
  `APP_FOREGROUND` runs the check again.
- **BL5 — Waiting for Wi-Fi.** `AwaitingWifi`
  (`src/components/model-hub/awaiting-wifi.tsx`) shows Try again
  (`CHECK_NETWORK`) and "Choose another model" (`LEAVE_WAITING` →
  `selecting`), which keeps the saved row ("not now") and the machine's
  `modelId` and `pauseState`, so the list and "Import custom .gguf" are
  reachable. A later hub open restores by the row: a `downloading` row
  runs the check again; a `paused` row waits for Resume.
- **BL6 — Download screen states.** A restore lands on the download
  screen (`router.replace('/model-hub/download')` in `_layout.tsx`),
  which keeps its download framing during the check: "Checking your
  connection…" in `confirmingNetwork`, `AwaitingWifi` in
  `awaitingWifi`, "Starting download…" only in `downloading`. Any
  transition into `selecting` (not a restore mount's initial one)
  dismisses it to the list.
- **BL7 — An abandoned download's row is cleared.**
  - Picking a different model (`SELECT_MODEL` for a model other than
    the context's `modelId`, when that `modelId` is set) clears the row
    silently. Picking the same
    model keeps its pause state and sets `continuation`, so it resumes
    behind the check.
  - A custom import (`src/app/model-hub/import.tsx`) reads the row's
    model (`readDownloadModelId`, which returns the id only); its sweep
    before the copy keeps that model's file (an unreadable row skips
    the sweep). On success it clears the row before committing the
    model's identity (`setModelPath`, `setModelId`), then sweeps with
    no model kept, removing the abandoned partial; the machine clears
    the row again on `IMPORT_SMOKE_OK`. A failed copy or smoke test
    leaves the row and its model file intact.
  - **Accepted limitation:** if `setModelPath` or `setModelId` throws
    after the row clear, the import ends `IMPORT_FAILED` with the row
    cleared; the kept file is a harmless orphan, and the context's
    pause state still lets a same-session re-pick resume.
  - Pre-existing: cancelling the document picker sends nothing, so the
    machine stays in `customImport`, which has no exit, until the hub
    is closed and reopened.
- **BL8 — Android resume sink guard.** `resumeDownload` on Android
  resumes only when the resume data is a decimal byte offset and the
  file at the pause state's `fileUri` is at least that size; otherwise
  it deletes any short partial and starts a fresh download of the same
  URL to the same file. Without it, `RandomAccessFile.setLength(offset)`
  would zero-fill a missing or short partial that the size check then
  passes. iOS is unchanged (no app-owned partial).
- **BL9 — The sweep keeps only a paused row's file.** The hub's orphan
  sweep (`deleteOrphanedModelFiles` in `createModelHubApi`, run when
  `checkingExisting` starts) also keeps the row's model file while the
  row is `paused` (a `failed` row is never restored, so not then); an
  unreadable row skips the sweep. A partial with no row is freed only
  by the next such sweep (accepted).
- **BL10 — Verification is size-only.** `verifyDownload` compares the
  file's size with the manifest, and a smoke test is not a reliable
  corruption check. Hash verification is
  [#128](https://github.com/equationalapplications/curated-journal/issues/128)
  (accepted). "Complete" in this spec means the size matches; BL8, not
  the size check, keeps an Android resume from producing a corrupt file
  of the right size.
- **BL11 — `paused` has no exit to the list** (accepted in #125). Step
  2 lifts this (M6).

Known gaps, pre-existing and out of scope here (filed from PR #125's
review):
[#126](https://github.com/equationalapplications/curated-journal/issues/126),
a Wi-Fi drop after the check falls back to cellular silently (fresh
downloads too), and an Ethernet connection counts as offline;
[#127](https://github.com/equationalapplications/curated-journal/issues/127),
returning to the foreground while the background pause is still in
flight can drop the resume data. The Standard copy's "asks first if
you're on cellular data" is true when each continuation starts; #126
is about a network change after that.

**#125's tests, kept green by Step 2:**

- `__tests__/modelHubMachine.test.ts`, the
  `describe('continued downloads ask before using cellular data (#124)')`
  block (BL1, BL3–BL5, BL7);
- `__tests__/modelHubLayoutRestoreCellular.test.tsx`, which renders the
  **real** `src/app/model-hub/_layout.tsx` and fails if
  `<CellularConfirm />` leaves the layout: the screen-level guard (BL2);
- `__tests__/modelHubDownloadNetworkStates.test.tsx` (BL2, BL5, BL6; it
  mounts its own `<CellularConfirm />`, so it cannot catch a layout
  regression);
- `__tests__/cellularConfirmClose.test.tsx` (BL2);
- `__tests__/modelHubDownloadSmokeFailed.test.tsx` ("Choose another
  model" lands on the list through the transition effect, BL6);
- `__tests__/modelHubImport.test.tsx` (BL7);
- `__tests__/modelDownloadService.test.ts`, the
  `describe('resumeDownload partial guard')` block (BL8);
- `__tests__/useModelHub.test.ts` and `__tests__/modelFiles.test.ts`
  (BL9, `readDownloadModelId`).

A machine-state test alone cannot catch a prompt that never renders,
so the screen and layout tests matter as much as the machine block.
Where these tests mock the download service (for example
`modelHubLayoutRestoreCellular.test.tsx`), the mock gains the owner's
API (R10a): the mocks change, the assertions do not.

## Step 2 machine changes

Every hub-machine event, state, flag or signal that Step 2 adds or
changes in `src/machines/modelHubMachine.ts` and its provider
(`src/hooks/useModelHub.tsx`). The plan may rename events and flags; it
may not change a row's source states, target or effects. Every test
named here runs in `__tests__/modelHubMachine.test.ts` unless the row
says otherwise, and every test that ends in a strict pause asserts
`pausedReason: 'strict'` explicitly.

**At rest, nothing is in flight.** The states at rest are `selecting`,
a settled `paused`, `failed` and `smokeFailed` (R7). None of them holds
a live transfer: M0 cancels a transfer whose pause failed, M9 waits for
a pause to settle, and R10b stops a closed-hub transfer before a
restore. So R8 step 1, run from the hub, finds no active record. It
still asks, and the rows marked *defensive* cover the case where it
ever does.

**The strict event** is the machine event the hub sends after R8 step
1 (the plan names it, for example `STRICT_PRIVACY_ON`). It carries the
pause state the owner produced, if step 1 paused an active record. The
send rule, stated only here:

- from a settled `paused`: always (M1);
- from any other state: only when step 1 found and kept an active
  record (M2, defensive);
- after the user's choice on R10g's warning: Turn on and remove → M3;
  Cancel after step 1 paused a record → M5 (defensive);
- otherwise (`selecting`, `failed` or `smokeFailed` with no record):
  none, and the state stays as it is.

| Row | Event or signal | Source states | Target | Context effects | Row write | Copy shown | Test |
|---|---|---|---|---|---|---|---|
| M0 | Pause failure: `pauseTask`'s pause rejects ([#132](https://github.com/equationalapplications/curated-journal/issues/132)) | `paused` (reason `user` or `background`) | `failed`, as today | before it rejects, `pauseTask` awaits the owner's cancel of the live transfer (R10a); then as today | the `failed` entry's write, as today | "Could not pause the download. Try again." (as today) | `pauseAsync` rejects: the transfer is cancelled before `failed` is entered, the machine is `failed`, and no transfer is running |
| M1 | Strict event | `paused`, only once settled (M9), any reason | stays `paused` (targetless: `pauseTask` does not run again) | `pausedReason: 'strict'`; `pauseState` ← the event's if it carries one, else kept | none | the label from the mode (R10e) | From a settled `paused` with reason `background`: reason becomes `strict`, no pause call, no `DownloadTask`; a later `APP_FOREGROUND` stays in `paused` and never reaches `confirmingNetwork` |
| M2 | Strict event carrying the owner's pause state | `downloading`, `failed`; both *defensive* (the control never shows in `downloading`, and after M0 `failed` holds no transfer) | `paused` | `pausedReason: 'strict'`; `pauseState` ← the event's; `idlePause: false`, so `pauseTask` takes M12's branch; `error: null` | none (the owner saved the row) | the label from the mode | From `downloading` with an owner-paused record: `paused`, reason `strict`, the owner's pause state, no second `pauseAsync`, no machine write; the stopped error (M4b) then never lands |
| M3 | Strict event after Turn on and remove (R10g) | `selecting`, from any path (the merged warning on a saved `downloading` row); `failed` (when its `failed` row write did not land, so the row still says `downloading`) | `selecting` | `modelId: null`; `pauseState: null`; `progress` reset; `continuation: false`; `error: null` | none (the cleanup cleared the row, R10g) | the list, with the strict notice (R7) | From `selecting` and from `failed`: `selecting` with no `modelId`, `pauseState` or `progress`; from `failed` the download screen dismisses (BL6) |
| M4a | `PrivacyGateError`, reason `refused`: the service refused a start or resume before creating or recording any task (R4) | `downloading` | `paused` | `pausedReason: 'strict'`; `idlePause: true`; `pauseState` kept. `runDownload` checks `instanceof PrivacyGateError` before `classifyDownloadError`, so never `failed` | the idle pause writes `paused` with the context's pause state (null is fine); the store's queue orders it after the entry's `downloading` write | the label from the mode: "Paused — strict privacy is on" in strict, "Paused" in Standard; never "Check your connection" | A refused start and a refused resume: `paused`, reason `strict`, no `DownloadTask`; after stepping out, an `APP_FOREGROUND` starts nothing, and the last row write is `paused`, after the entry's `downloading` |
| M4b | `PrivacyGateError`, reason `stopped`, carrying the handle's pause state: the owner's strict pause stopped this transfer (R10a) | `downloading` | `paused` | `pausedReason: 'strict'`; `pauseState` ← the error's; `idlePause: false`, so `pauseTask` takes M12's branch | none: the service throws only after the owner's saves have finished | the label from the mode | The owner pauses a transfer under a running machine: `paused`, reason `strict`, the error's pause state, no second `pauseAsync`, and the only `paused` writes are the owner's |
| M5 | Hub Cancel-restart (R10g "From the hub"; the plan names it, for example `RESTART_DOWNLOAD`, carrying the model id) | `failed`, *defensive* only (step 1 found a record there, so M0's cancel did not stop it) | `confirmingNetwork` | `modelId` ← the event's; `pauseState: null`; `progress` reset; `continuation: true`; `error: null` | before the event, the owner cancels the transfer and re-saves the row as `downloading` with no pause state, awaited; then BL1 | BL1's check: Wi-Fi goes ahead, cellular asks, offline waits | With a record injected in `failed` and no resume data: Cancel sends it, and on cellular it reaches `cellularConfirm` before any `DownloadTask` |
| M6 | `LEAVE_PAUSED` ("Choose another model") | `paused`, only once settled (M9); ignored before | `selecting` | none, like `LEAVE_WAITING`: `modelId` and `pauseState` kept | none: the row is kept ("not now") | "Choose another model" on the download screen, shown only once settled; the screen dismisses to the list (BL6) | (a) Pause, then the exit before `pauseAsync` resolves: hidden, and a `LEAVE_PAUSED` sent anyway is ignored; it shows and works once settled. (b) The focus-effect test (Verification) |
| M7 | `RESTORE_DOWNLOAD` of a `paused` row with `pauseState: null` (R10j), guarded ahead of the existing `paused` restore branch | `selecting` | a new check state (the plan names it; R7 hides the control in it) running `verifyTask`: verified → `smokeTest`; not verified (`onDone`) or the check threw (`onError`) → `paused`. Never `confirmingNetwork` | `modelId` ← the event's; `pauseState: null`; `pausedReason: 'restored'`; `idlePause: false`; `error: null` | none: the row stays `paused` | "This download will start over when you resume." (R10e) | Complete file: reaches `smokeTest`, no `DownloadTask`; incomplete, or the check throws: `paused`, no `checkNetwork`, no `DownloadTask` until Resume. A `paused` row with resume data keeps today's restore |
| M8 | R10f's strict branch: `checkingExisting`'s not-verified exits (`onDone` fallback and `onError`) while the injected strict guard (R12) says strict | `checkingExisting` | `paused` (in place of `confirmingNetwork`) | `pausedReason: 'strict'`; `idlePause: true`; `pauseState` kept (null for a download killed in the foreground) | rewritten as `paused` with that pause state | "Paused — strict privacy is on", and "will start over" when there is no resume data | A `downloading` row restored in strict, from both exits: reason `strict`; no `checkNetwork`, no `getNetworkStateAsync`, no `DownloadTask`; after stepping out, reopening shows it paused |
| M9 | Pause-settled signal: a `pauseSettled` context flag | — | — | set `false` on entering `paused`; set `true` when `pauseTask` resolves (`onDone`). (`onError` leaves for `failed`, M0.) | — | gates M1, M6 and the R7 control in `paused` | M6 (a); the R7 control test |
| M10 | Restore-pending signal: the provider's `restore` prop is set and its `RESTORE_DOWNLOAD` has not yet been sent | provider, not machine | — | — | — | hides the R7 control | the R7 control test, restore-pending case |
| M11 | `LEAVE_FAILED` ("Choose another model") | `failed` | `selecting` | `modelId` and `pauseState` kept; `error: null`, so the list shows no stale failure banner | none: the row is kept | "Choose another model" on the download screen in `failed`, in any mode; the screen dismisses to the list (BL6) | In strict, from `failed` with a pause state (its Retry is blocked, R5): the exit reaches the list, "Import custom .gguf" is reachable, and the row is unchanged |
| M12 | `pauseTask`'s strict branch | `paused` with `pausedReason: 'strict'` and `idlePause: false` (entered by M2 or M4b) | — | returns the context's pause state: no pause call, no write; M9 then settles | none | — | covered by M2's and M4b's tests (no `pauseAsync`, no machine write) |
| M13 | The provider exposes `pauseState` and `pauseSettled` on `ModelHubContextValue` | provider | — | — | — | the download screen reads them for M6's and M11's exits, the R7 control and R10e's "will start over" line | the screen tests in Verification |

Notes on the table:

- **Why M6 waits for M9.** Leaving `paused` while `pauseTask` is still
  pending stops that invoke. The machine would then keep a stale or
  null pause state, a re-pick of the same model would start from byte
  0, and R8 step 1 would later pause an active record a second time.
- **Why the strict paths converge** (M1, M2, M4b, M12). In the
  defensive case of a running machine whose transfer the owner stops,
  three things can reach the machine: the stopped error (M4b), the
  strict event in `downloading` (M2), and the strict event in `paused`
  (M1). The owner's saves finish before the service throws and before
  step 1 reports, so each one carries the same pause state, and the
  row already holds it. Error first: M4b goes to `paused`, M12 settles
  at once, and a later strict event is M1 with the same pause state
  (or is ignored before it settles, which loses nothing). Strict event
  first: M2 goes to `paused`, and leaving `downloading` stops
  `runDownload`'s invoke, so the error never lands. Either way the
  result is `paused`, reason `strict`, the owner's pause state, and no
  machine write. A refusal (M4a) has no owner sequence to race: the
  service throws before it records anything, so the only `paused`
  write is the machine's idle write, queued after the entry's
  `downloading` write.
- **What the strict event is not.** The machine never pauses for strict
  on its own and never starts a transfer for it. From Settings it never
  runs: Settings is not interactive while the hub is mounted, and the
  hub's actor stops when the hub closes. The service's owner is what
  stops a transfer (R10a).
- **`failed` with no record** (the normal case after M0): no strict
  event; `failed` stays as it is, its Retry with a pause state is
  blocked in strict (R5), and M11 is the way to the list.

## The two modes, as the user reads them

### Names

- **Strict privacy.** This is the charter's name.
- **Standard.** The default mode's on-screen name (owner, OQ-1). In
  code the mode stays `'default'`.
- **Connected (future, informational; owner ruling 2026-11-21).** The
  ladder is Strict ⊂ Standard ⊂ Connected. Connected is the tier of
  ROADMAP Step 3 (sync), and takes the name sibling app Curated
  Thoughts uses for its sync tier. Curated Thoughts' "Ephemeral"
  (hosted AI generation) is not adopted: Curated Journal never calls a
  hosted AI (INTENT rule 10). A future Connected spec may add opening
  note links as one of its named unlocks. This spec does not, and
  builds no Connected mode.

### What each mode allows, and with whom (on-screen copy)

This copy goes under each choice in Settings → Privacy (R7). Step 2
may fix wording or layout. It may not claim more or less than the
requirements allow.

**Standard**

> Curated Journal goes online only when you ask it to:
>
> - To download an AI model you pick. It comes from Hugging Face, which
>   hosts the model files.
> - To check for an app update, when you tap Check. Expo runs the
>   update service, and it also gets a random ID for this copy of the
>   app.
> - To leave a tip. The App Store or Google Play handles it.
>
> Nothing else goes online on its own, and links in your notes don't
> open. A model download you started
> can carry on by itself when you come back to the app or open the
> model hub — sometimes from the start — and it asks first if you're
> on cellular data. Your journal stays on this device unless you
> export or share it.

On the web build the tip line reads: "To open the Support page, when
you tap Support. PayPal runs it."

**Strict privacy**

> Curated Journal doesn't go online or connect to anything outside this
> device, for any reason. No model downloads, no update checks, no
> tips, and links in your notes don't open. No Bluetooth or local
> network either.
>
> Everything your journal does keeps working: writing, organizing,
> asking questions, the graph, import and export. You can still import
> a model file that's already on this device.
>
> Files you choose in a file picker, and files or link addresses you
> send with the share sheet, go where you send them.
>
> While strict privacy is on, the app gets no updates, including
> security fixes. To update, step out of strict privacy and check in
> Settings, or install a new version from the App Store or Google Play.

## Requirements

**R1 — One setting, two modes.** The user picks one of two modes:
Standard (the default mode) or Strict privacy. A first install starts
in Standard and shows no first-run prompt. On iOS the setting lives in
the Keychain (R2), and the Keychain can survive uninstalling the app,
so a reinstall may start in the mode the user last saved, strict
included. That is the user's own saved choice. Settings → Privacy shows
it, and in strict the hub notice does too (R7). *(Rule 9 ¶2: "the
everyday setting needs no switch." Rule 11. Owner, OQ-1.)*

**R2 — Stored on the device only.** The choice is saved in the same
on-device store as the app's other settings: `expo-secure-store` on
iOS and Android, `localStorage` on web, through `src/lib/secureStore`
and a new key in `src/lib/constants.ts`. It is never sent anywhere.
*(Rule 9.)*

**R3 — Strict holds from app start.**

- Until the saved mode has been read, every gate answers as if strict
  privacy were on.
- The root layout's bootstrap (`src/app/_layout.tsx`) reads the mode
  before it leaves its loading phase. So no screen runs before the mode
  is known. That includes the model hub, which restores a download as
  it opens.
- The native launch-time update check stays off (path 4).
- If the saved mode cannot be read, or the stored value is not one this
  version knows (`'default'` or `'strict'`; for example, a mode a later
  version added), the app runs in strict privacy for that session.
  - Settings → Privacy says: "Curated Journal couldn't read your
    privacy setting, so it's using strict privacy for now. Choose a
    mode to save it again."
  - With no model installed, Settings can't be reached, so the hub's
    strict notice (R11) starts with: "Curated Journal couldn't read
    your privacy setting, so it's using strict privacy for now."
- **iOS, plainly: strict privacy from launch is complete only once
  #119 ships.** Until then, every iOS launch starts `expo-iap`'s
  StoreKit listeners (path 9) before the mode is read, whatever the
  mode is. This survey found no request they send, but JS cannot stop
  them. Step 2 makes strict from launch true for everything the app's
  own JavaScript starts. #119 does the native rest.
- **iOS, transitional: a download started before Step 2 can outlive
  the app.** Step 2 moves iOS downloads to a foreground session (R10b,
  owner OQ-7). But a download that a version from before Step 2 started
  may still be running in a background `URLSession`, which survives the
  OTA update and the relaunch, and which nothing in the relaunched app
  — strict privacy's pause included — can reach or cancel from
  JavaScript. The app cannot tell whether such a download exists or has
  finished, so on iOS the downloads-off alert says so (R5's table).

*(Rule 11: "nothing that can reach outside may act before the mode is
honored." Owner, OQ-5.)*

**R4 — Every gate goes through `src/lib/privacyMode.ts`.** This module
is the only place that knows the mode. It provides:

- `getPrivacyMode()`: synchronous. Returns `'strict'` until the saved
  mode has been read (R3).
- A load function, called once by the bootstrap and memoized for the
  life of the process: a second call returns the already-loaded mode
  instead of re-reading the store. The root layout's bootstrap can
  re-run (through `ModelHubCompletionProvider`'s `onComplete`), and a
  re-run that re-read the store after a failed R8 step 3 save would
  silently flip strict back to Standard. Memoization prevents that.
- A set function that saves the mode and applies the ordering in R8
  and R9.
- A subscription, so open sessions can react when the mode changes
  (R8).
- One gate per kind of path: `canUseStorePurchases()` (path 5, exists),
  `canOpenSupportLink()` (path 6, exists), `canDownloadModels()` (paths
  1 and 2), and `canCheckForUpdates()` (path 3). Path 7 needs no gate: no mode
  opens a note's link, so the alert in R5 and R6 depends only on its
  copy.
- One error type, `PrivacyGateError`, in a module with no native
  imports, so that the hub's state machine can import it. It has a
  `reason`, `'refused'` (a gate said no) or `'stopped'` (the strict
  pause stopped a running transfer, R10a), and an optional
  `pauseState` (M4a, M4b).

Each module that can reach the network also asks its gate itself, at
the point where it acts, the way `openTipJar` already does:

- `modelDownloadService.ts`: at the top of `startDownload` and
  `resumeDownload`, before it creates or records any task. A refusal
  throws `PrivacyGateError('refused')`.
- `updateCheck.ts`: before the check, and again before the fetch.
- `tipJarStore.ts`: at the start of `openTipJar` and before
  `requestPurchase` (both exist), and also between its steps, so a jar
  that is still opening when strict turns on stops at the next one:
  - in `openTipJar`, after `initConnection` and before
    `fetchProducts`, and again before `recoverUnfinished`;
  - in `recoverUnfinished`, before `getAvailablePurchases`;
  - in `handlePurchase`, before `finishTransaction`.

  A refusal closes the session as R8 step 4 does.

A screen asking first is good manners. It is not the guarantee. Paths 7
and 8 need no gate: no mode opens a note's link, and #118 makes
remote images never load, in either mode (R6). The plan may rename these functions. It may not add a second
place that decides the mode. *(Rule 11; ROADMAP Step 2: "every
network-capable code path in the app asks the mode before acting".)*

**R5 — Strict privacy blocks every path.** In strict privacy, paths 1,
2, 3, 5 and 6 start nothing (paths 7 and 8 are blocked in both modes:
7 by the link alert in R6, 8 by #118). A blocked tap shows an alert that explains why and how to step
out, and never makes a silent network call. Every alert ends "Nothing
was sent."

| Tap | Title | Message |
|---|---|---|
| A model in the hub list, Resume, Retry on a failed download that has a pause state, and (defensively) Try again (`CHECK_NETWORK`) and Download over cellular (`CELLULAR_CONFIRM`) | Downloads are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, and models download from the internet. To get a model, step out of strict privacy, download it, then step back in. Nothing was sent. |
| The same taps, **on iOS only** | Downloads are off in strict privacy | The message above, with this before "Nothing was sent.": "A download an older version of this app started may still be finishing on its own. The app itself sends nothing." It shows in every strict downloads-off alert on iOS, because the app can't tell whether such a download exists or has finished (R3). |
| Check (app updates) | Update checks are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, so it can't check for updates. To check, step out of strict privacy in Settings → Privacy, check, then step back in. Nothing was sent. |
| Open or a tip (tip jar) | Tips are off in strict privacy | The existing copy (`STRICT_PRIVACY_TIP_MESSAGE`), changed to say "step out of strict privacy in Settings → Privacy". |
| Support (web) | Tips are off in strict privacy | The existing `STRICT_PRIVACY_LINK_MESSAGE`, with the same Settings → Privacy change. |
| A link in a note, any scheme (the same alert in Standard and strict; R6) | Links don't open from notes | Strict privacy keeps Curated Journal from opening links from your notes. You can copy this address and open it yourself: `<full href>`. Nothing was sent. Buttons: **Share…** and **OK**. |

"Try again" on a failed smoke test (`smokeFailed`'s `RETRY` →
`verifying`) is not blocked: it runs on the device and keeps working in
strict (R10h). "Try again" while waiting for Wi-Fi and "Download over
cellular" should never show in strict: a strict hub never runs the
network check (M7, M8). They are in the table so that, if either is
ever reached in strict, the tap is refused with the alert instead of
starting anything. "Import custom .gguf" is not in this table: it
stays available in strict privacy (R11). Alerts in the model hub also
offer a "Step out of strict privacy" button, because Settings may be
out of reach there (R7). *(Rule 11 and its out-of-scope item; the
tip-jar alert pattern rule 11 already requires.)*

**R6 — Standard, the default mode.**

- Paths 1, 2, 3, 5 and 6 run when the user starts them, as they do
  today.
- **A download the user started carries on** (owner, 2026-11-16),
  always through the network check (BL1–BL6): from its resume data
  when the app returns to the foreground after a background pause, and
  **from the start** when the hub next opens after a kill in the
  foreground. (A kill in the background finds the row already `paused`,
  so it waits for Resume.) On iOS with the hub closed, it stops while
  the app is suspended (R10b). The Standard copy names this. #124
  delivers it now; Step 2 keeps it and its tests. R10g says how its
  Cancel, which runs outside the hub, keeps the same promise.
- An abandoned download's row is cleared on a successful custom import
  and on picking a different model (BL7); Step 2 asks first (R10i).
- **Note links never open, in either mode** (owner, 2026-11-21,
  superseding OQ-3 and OQ-8). Note text comes from the model or an
  imported bundle, never from the user, so opening its links would be
  the riskiest traffic. A tap on any link in a note, for any scheme
  (`https`, `http`, `mailto:`, `tel:`, other apps' schemes, the app's
  own `cur://` links, no scheme), opens nothing and never calls
  `Linking.openURL`. It shows an alert with the link's full address and
  two buttons, **Share…** and **OK**. Standard's copy:

  > **Links don't open from notes**
  > Curated Journal doesn't open links from your notes. You can copy
  > this address and open it yourself: `<full href>`. Nothing was sent.

  Strict's copy is in R5's table: the same title, buttons and
  mechanics, with the strict sentence. Both are unqualified, with no
  caveat about iOS (owner, 2026-11-21).
- **Share…** calls react-native core `Share.share({ message: href })`;
  the OS share sheet offers Copy. It is not `expo-clipboard`, which is
  not installed: adding a native dependency would be a MAJOR change
  plus the 14-day age gate. The share sheet counts as the user sending
  something where they choose (the charter's exception, the same as an
  export), so Share… stays available in strict.
- Every note link goes through one decision point: a shared
  `onLinkPress` that `src/components/NoteMarkdown.tsx` sets itself.
  Its props leave `onLinkPress` out, as they already leave out
  `rules` and `renderer` (PR #120), so no caller can replace it. It
  reads the mode only to pick the alert's copy, and shows the alert. It
  never returns `true`, which would make the library call
  `Linking.openURL` on its own. There is no `canOpenNoteLinks()`.
- Remote images in notes (path 8) never load, in Standard or in
  strict. The note renders `[image not loaded: <alt>]` with the
  truncated source instead, as muted text (the alt text alone shows
  only when the image sits inside a link). **#118 delivers
  this now, as a PATCH, before Step 2** (owner, OQ-4). Step 2 only has
  to keep it, and its test, in place: every markdown renderer keeps
  using #118's image rule, and the coverage test checks that.
- Nothing else runs on its own. The continuation above is the user's
  own download carrying on, and the copy says so.
- Nothing connects to anything new: no sync, no pairing, no automatic
  update checks. Those are Step 3 unlocks.

*(Rule 9 ¶2; rule 12: a mode never bundles in more than its
description says.)*

**R7 — Where the setting lives.**

- Settings gets a new **Privacy** section, placed first. It shows the
  two modes as a choice of two, Standard and Strict privacy, each with
  the copy above, and the current mode selected. It is a choice, not an
  on/off switch, because Step 3 adds more modes.
- In strict privacy, the model hub (`src/app/model-hub/index.tsx`)
  shows a "Strict privacy is on" notice with a **Step out of strict
  privacy** button. That button opens the same confirmation as R9. This
  is required because with no model installed, Settings cannot be
  reached: `src/app/(tabs)/_layout.tsx` sends the user to the hub
  instead.
- In Standard, the model hub shows the symmetric control: a **Turn on
  strict privacy** button, which opens R8's confirmation. Without it, a
  Standard user with no model installed cannot reach strict privacy at
  all, because Settings redirects to the hub.
  - **Only at rest.** The control is shown, and active, only while the
    hub machine is at rest: `selecting` (on the list), and `paused`
    (any reason) once its pause has settled (M9), `failed` or
    `smokeFailed` (on the download screen). It is never shown while a
    restore is pending (M10). It is hidden in every other state:
    `checkingExisting`, M7's check state, `confirmingNetwork`,
    `awaitingWifi`, `cellularConfirm`, `downloading`, `verifying`,
    `smokeTest`, `retiringCurrent`, `customImport` and `complete`.
  - At rest, nothing is in flight (M0, M9, R10b; Step 2 machine
    changes). R8 step 1 still asks the download service, from the hub
    as from Settings.
  - To get to rest, the user taps Pause mid-download, "Choose another
    model" while waiting for Wi-Fi (BL5), or Cancel on the cellular
    prompt (BL3). At rest, R8's confirmation cannot race the machine,
    and no sheet can stack on the cellular prompt. What Turn on then
    does is R8's pre-check and step 1, and the strict event's send
    rule (Step 2 machine changes).
  - This control was the reviewer's recommendation (Opus review,
    2026-11-16). Limiting it to the states at rest is the lead's
    narrowing of that recommendation (2026-11-16). The owner can still
    veto the control.

*(Rule 11: "a user in strict privacy who wants a new model steps out of
strict privacy on purpose". Rule 12: each step is the user's own
choice, so both directions need a control where the user is.)*

**R8 — Turning strict privacy on.** A confirmation comes first:

> **Turn on strict privacy?**
> Curated Journal will stop going online. Model downloads, update
> checks and tips stop until you step out again.
> A download in progress pauses now and won't restart on its own; you
> can resume it after you step out. You won't get app updates,
> including security fixes, while strict privacy is on. Your journal
> keeps working, and you can still import a model file that's already
> on this device.
> [Cancel] [Turn on]

**The pre-check, before the confirmation shows.** It runs whatever
opened the confirmation: Settings, or the hub's control in any at-rest
state (R7). It looks only at a saved row whose status is `downloading`;
a `paused` row is never warned about here (it is kept as it is, and
R10e and R10j handle it). For a `downloading` row, the app asks the
download service whether it holds a live transfer for it. If it does
not, the app runs the plain file check on the file the row points at
(`verifyDownload`, size only, BL10), because a download that
**completed** while the hub was closed also leaves a `downloading` row
with no live transfer. The check runs on its own: Settings mounts no
hub machine, and the dialog never waits on a model load.

- If the file is complete, nothing is warned about: the smoke test runs
  when the hub next opens and its normal restore runs (R10f, R10h).
- If it is not, the download has **no live handle**: it can't be kept.
  R10g's warning is merged into the confirmation. It **replaces** the
  download sentence ("A download in progress pauses now and won't
  restart on its own; you can resume it after you step out."), which
  would be untrue there, and the button reads "Turn on and remove".

From a settled `paused` the row is `paused`, so the pre-check finds
nothing, and only the label changes (M1).

On Turn on, in this order:

1. The app asks the download service's owner (R10a) whether it holds
   an active record, **whatever opened the confirmation**. From the hub
   at rest it holds none (Step 2 machine changes, "At rest"), so this
   matters from Settings, with the hub closed. If it holds one, that
   live download pauses, in R10a's save order. Pausing sends nothing.
   It comes first because only the pause shows whether the download
   can be kept; if it can't, R10g's warning shows now, before anything
   below. Nothing
   may resume or restart the download between this step and step 2. If
   the transfer finishes before the pause (the task is no longer
   `active`), the owner runs `verifyDownload` before it reports "can't
   be kept": a complete file is never warned about or removed, the row
   stays `paused`, and R10j takes it to the smoke test at the next hub
   open. With the hub open, the hub then follows the strict event's
   send rule (Step 2 machine changes).
2. The mode in memory becomes strict, so every gate says no at once.
3. The mode is saved. If saving fails, strict privacy stays on for this
   session, and the user sees: "Strict privacy is on, but Curated
   Journal couldn't save the setting, so it may be off the next time
   the app starts. Try again."
4. An open tip-jar session closes: its listeners are removed and its
   store connection ends. A purchase update that arrives later is not
   acted on. The store hands an unfinished purchase back the next time
   the jar opens in Standard. A jar that is still opening stops at its
   next gate check (R4).
5. An update check that is already running does not go on to its fetch
   step. A request already sent cannot be called back. The row then
   says "Strict privacy is on. The update check stopped."

**The kill window between steps 1 and 3.** If the app dies after step
1 starts and before step 3 has saved the mode, it relaunches in
Standard. The row was saved as `paused` before the pause, so the hub
shows the download paused and does not restart it. If the app died
before the pause state was saved, the row has no resume data, so R10j
checks the (incomplete) file at the next hub open, the row stays paused
with R10e's "will start over" line, and Resume starts it over, through
the network check. This corner is accepted. Without the first save,
the row would still say `downloading`, and the relaunch would restart
the download from zero by itself.

*(Rule 11.)*

**R9 — Stepping out of strict privacy.** Each step away from strict is
an explicit, informed choice, so a confirmation says what Standard
allows and with whom:

> **Step out of strict privacy?**
> Curated Journal will be able to go online, but only when you ask it
> to:
>
> - to download a model from Hugging Face;
> - to check for an update with Expo, which also gets a random ID for
>   this copy of the app;
> - to leave a tip through the App Store or Google Play
>   (on the web build, this bullet reads "to open the Support page,
>   which PayPal runs", matching the Standard copy).
>
> Links in your notes don't open.
>
> Hugging Face, Expo and the stores see the request come from this
> device. None of them gets your journal. Nothing starts on its own: a
> paused download stays paused until you tap Resume.
> [Cancel] [Step out]

On Step out, the new mode is saved first and applied second: every
gate says no until the save has finished. If saving fails, the app
stays in strict privacy and says: "Couldn't save the change, so strict
privacy is still on. Try again." After stepping out, nothing starts by
itself: no download resumes, no update check runs, no store connection
opens. *(Rule 12; rule 9 ¶2; owner ruling 2026-11-16.)*

**R10 — A half-finished model download** (owner rulings, 2026-11-16;
OQ-6).

How a paused download is kept differs by platform (expo-file-system
58.0.13):

- **iOS.** Pausing calls `cancelByProducingResumeData`
  (`ios/FileSystemDownloadTask.swift`). The bytes so far stay in a
  temporary file that iOS manages; the app's model file does not exist
  until the download finishes. The resume data points at that
  temporary file. iOS may delete the file (for example, when storage
  runs low), and then the resume data no longer works. iOS can also
  return no resume data at all.
- **Android.** Pausing cancels the request
  (`FileSystemDownloadTask.kt`). The bytes so far are the model file
  itself, at its final name in the app's documents folder. The resume
  data is the file's length. Resuming asks the server for the rest
  (`Range: bytes=<length>-`); if the server sends the whole file
  instead, the download starts over.

**a. One pause owner, wherever the download runs.** Strict privacy is
turned on in Settings or from the hub's control (R7). Mid-download,
Settings is reachable mainly during a model change, with the hub
closed, and the hub's state machine stops when the hub closes. So the
pause owner is the download service (`modelDownloadService.ts`), not
the hub machine:

- The service keeps one record of the live download: a per-transfer
  handle that each start or resume creates, holding its task, its model
  id, and the save function of the hub session that started it (the
  owner writes through that session's store). The service clears the
  record when the transfer completes, fails, is cancelled or is
  paused. (Today `cancelActiveDownload()` is the only thing that clears
  `activeTask`, and nothing calls it; the service also knows neither
  the model id nor the store.)
- The strict pause checks the task's state first. `pauseAsync()`
  throws unless the task is `active`, so any other state counts as "no
  live transfer", not as an error.
- It sets `handle.stoppedForStrict = true`, saves the row as `paused`
  (no pause state yet), pauses, saves the row again with its pause
  state (or none), and only then reports whether the download can be
  resumed later (R8 step 1, and its kill window). Every owner save is
  awaited before the owner reports.
- **The stopped error.** In expo-file-system 58.0.13 a pause makes
  `downloadAsync()` or `resumeAsync()` resolve `null` (only a cancel
  rejects). When that happens on a handle with `stoppedForStrict`, the
  service awaits the owner's save sequence, then throws
  `PrivacyGateError('stopped', handle.pauseState)` (M4b). A hub pause
  returns `null`, as today.
- **A cancel on request.** The owner also cancels a live transfer when
  asked: by `pauseTask` when a pause fails (M0), by R10b's restore-stop
  when its pause fails, and by R10g.
- With the hub open, the hub machine follows the owner through the
  strict event (the send rule is in Step 2 machine changes). The
  `strict` reason lives in the machine's context only; the row stores
  none (R10e).
- **A gate refusal never leaves a `downloading` row, and is never a
  failure** (both modes, defensive; M4a). Without it, a refused start
  would leave the `downloading` row the state's entry saved, which
  restarts by itself after Step out (against R9 and R10d), and
  `classifyDownloadError` could show "Check your connection".

**b. One transfer at a time, always with a handle.** Strict privacy can
only pause a transfer the app can still reach.

- The service never holds two transfers. Before it starts or resumes a
  download, it stops any live transfer it holds. Today,
  reopening the hub while a download from a closed hub is still
  running restores the `downloading` row and starts a second transfer
  to the same file, and the first runs on with no handle.
- **A restore stops a live transfer first.** When the hub restores a
  row and the service still holds a live record for that download (a
  transfer from a closed hub, still running in the same process; with
  foreground sessions after Step 2, that is the only case), the hub
  layout has the owner pause it **before** it calls `setRestore`. The
  `RESTORE_DOWNLOAD` it then sends keeps `status: 'downloading'` and
  carries the owner's pause state, so the restore stays a continuation
  (BL1). If that pause fails, the owner cancels the transfer (as in
  M0), and the restore carries no pause state. **The row's status:**
  `downloading` while the old transfer runs; then the owner's pause saves it `paused`, then
  `paused` with its pause state (R10a's order); it stays `paused` until
  the continuation enters `downloading`, whose entry saves `downloading`
  again. So declining this restore on cellular (BL3), or leaving it
  while offline (BL5), leaves a `paused` row, which a later hub open
  restores as paused. Without the stop, the old transfer would keep
  running with no machine state that shows it.
- **No transfer outlives the app process** (owner, OQ-7). Both
  `startDownload` and `resumeDownload` pass `sessionType:
  'foreground'`. Today the service sets no `sessionType`, the installed
  expo-file-system defaults to `'background'`, and on iOS a background
  `URLSession` keeps transferring after the app is killed, where
  nothing in the relaunched app can reach it. Android needs nothing:
  its transfer runs in the app process and ends with it (the option is
  ignored there).
- The owner accepted the costs and risks listed with OQ-7 (Resolved
  questions): with the hub closed, an iOS download stops while the app
  is suspended and starts over when the hub next opens (through the
  network check); a hub pause that loses the race with suspension may
  restart the download; and a download paused under the old background
  session may not resume. Their on-device checks stay in Verification,
  unchecked.

**c. Pauses at once, and keeps what it can.** When strict privacy
turns on, the live download pauses (R8, step 1) and its row is saved
as `paused` (`src/services/modelDownloadState.ts`), so after a restart
it still shows as paused.

- iOS: the resume data is saved in the row. The bytes stay where iOS
  put them, and the app cannot stop iOS from deleting them. If iOS
  has, a later Resume fails and the user can start over from there.
- Android: the partial model file is kept, and its length is saved as
  the resume data. Resuming onto it goes through BL8, so a kept partial
  that has gone missing or short, by any path, makes the next Resume
  start over cleanly.

**d. Never resumes by itself.** This covers a download paused by
strict privacy: not when the app comes back to the foreground, not
after a restart, and not when strict privacy turns off. It resumes
only when the user, outside strict privacy, taps Resume, and that
Resume runs the network check first, like every continuation (BL1).
It is scoped to strict pauses on purpose: in Standard, a download the
user started carries on by itself (R6).

**e. Blocked in strict, and labelled.** In strict privacy, Resume, and
Retry on a failed download that has a pause state, show the
downloads-off alert (R5). While the mode is strict, a paused download
shows "Paused — strict privacy is on"; after stepping out it shows
"Paused". Whether the label is the strict one comes from the current
mode alone. Outside strict, the existing labels stay, including
"Paused (resuming…)" for a background pause, and a declined
continuation (reason `restored`) shows the plain "Paused". The row
stores no pause reason (`model_download_state` has `model_id`,
`pause_state_json`, `status` and `updated_at`), and this spec adds no
column, so a restored strict pause shows the label without any
hub-machine event. Any `paused` row without resume data, in either
mode, adds under the label: "This download will start over when you
resume." (M8's rewritten rows, R8's kill-window rows, a pause that
produced no resume data, and a declined restore of a download killed
in the foreground, BL3.)

The download screen (`src/app/model-hub/download.tsx`) otherwise shows
only Paused/Resume and has no route back to the model list, so in
`paused` it also shows:

- in strict, a **Step out of strict privacy** button, which opens R9's
  confirmation (the same button the hub notice offers, R7);
- in any mode (lead ruling, 2026-11-16), a **Choose another model**
  exit, `LEAVE_PAUSED` (M6). It shows, and is accepted, only once the
  pause has settled (M9). It keeps the saved row and the machine's
  `modelId` and `pauseState` ("not now", like `LEAVE_WAITING`). The
  download screen's transition effect then dismisses to the list
  (BL6), so "Import custom .gguf" stays reachable (owner ruling on
  OQ-2: it stays available in strict privacy). The list's
  `useFocusEffect` (`src/app/model-hub/index.tsx`) does not push the
  download screen again, because `selecting` is not in its
  `INSTALL_STATES`. Picking the same model later resumes from the kept
  pause state, behind the network check (BL7). This lifts BL11.

In `failed`, the download screen likewise shows a **Choose another
model** exit in any mode (lead ruling, 2026-11-20), `LEAVE_FAILED`
(M11), which keeps the row, `modelId` and `pauseState`. In strict, Retry
with a pause state is blocked (R5), so without it a strict user in
`failed` could not reach "Import custom .gguf" (R11).

**f. Never restarted under strict.** A row left as `downloading` (the
app was killed mid-download, or the paused row was never saved) is
restored under strict as paused, not restarted, and the row is
**rewritten** as `paused`, so that stepping out and relaunching doesn't
restart it through the hub's restore (M8). Neither `checkNetwork` nor
`getNetworkStateAsync` is called. Such a row has no resume data, so the
screen shows R10e's strict label and its "will start over" line.

M8 replaces only the not-verified exits. The hub's normal restore
still runs first (`checkingExisting` → `verifyDownload`): this is the
hub-side counterpart of R8's pre-check. If the file on disk is already
complete — a download that finished while the hub was closed leaves a
`downloading` row (or a `paused` row with no pause state, R10j), a
complete file, and no service record — the row is not rewritten and no
warning shows: the download continues through the smoke test to
`complete` (R10h).

**g. A download that can't be kept: warn, then clean up** (owner,
OQ-6). Switching to strict leaves a download that can't be resumed
later when the pause gives no resume data, when the pause fails, or
when it has no live handle (defined in R8's pre-check). Then the app
warns before the switch:

> **This download can't be kept**
> Curated Journal can't keep this download so that it continues later.
> If you turn on strict privacy now, Curated Journal throws away what it
> downloaded so far, and the download starts over the next time you
> get a model. If you cancel, strict privacy stays off and the download
> starts over. On cellular data, or with no connection, it waits for you
> in the model hub.
> [Cancel] [Turn on and remove]

- No live handle: merged into the confirmation, as R8's pre-check says,
  without the sentence about cancelling.
- No resume data, or a failed pause: only the pause shows this, so the
  warning shows after R8 step 1 and before step 2. The pause has
  already stopped the transfer. If it is still running after a failed
  pause, the owner cancels it.
- **Cancel** (owner, 2026-11-16): the app stays in Standard. Cancel is
  reached only when the pause gave no resume data or failed, so the
  download starts over: at once on Wi-Fi, and on cellular or offline
  only through the hub. The owner (R10a) first re-saves the row as
  `downloading` with no pause state.
  - **From Settings** (hub closed), the network check, which lives in
    the hub machine, does not run. So the owner asks the OS which
    network the phone is on (`checkNetworkGate`, which sends nothing).
    On Wi-Fi, it restarts the download at once. On cellular or offline,
    it starts nothing from Settings: the `downloading` row restores
    when the hub next opens, through the network check (BL1).
  - **From the hub**, step 1 finds no active record at rest, so only
    the merged warning can show there, and its Cancel changes nothing.
    If step 1 ever does find one (defensive), the hub sends the
    Cancel-restart event (M5), so the network check runs as usual; it
    never goes straight to a transfer.

  This split by network is a lead ruling (2026-11-16), consistent with
  the #124 owner ruling; the owner may overrule it. The re-save matters
  either way: otherwise R8 step 1's first save would leave a `paused`
  row behind a running transfer, and if that transfer finished with
  the hub closed, Resume would fetch it again. If the warning was
  merged (no live handle), no pause ran, and the row is left as it was.
- **Turn on and remove:** the app cleans up, then carries on from R8
  step 2. Cleanup cancels the transfer if the app still holds it, drops
  the resume data and its references to the OS's temporary file (on
  iOS that file stays in the OS's tmp folder until the OS purges it;
  the app cannot delete it), deletes the partial model file on Android
  (never the installed model's file), and clears the download row, so
  the hub has nothing to restore. The row is cleared through the store
  of whoever opened the confirmation: the hub through
  `api.clearDownloadState`, Settings through the store it opened for
  the pre-check. Every cleanup step is awaited before R8 step 2. With
  the hub open, the machine goes back to the list (M3). A later
  download starts fresh. With R10b, a transfer the app cannot reach can
  only be one left by a version from before Step 2.

**h. On-device steps carry on.** Checking the file and the smoke test
happen on the device, so a download that has already finished
continues through them in strict privacy. Neither is an integrity check
(BL10).

**i. No deletion unless the user says so.** Switching modes, starting
the app and opening the hub never delete a kept download (the Android
partial file, or the iOS resume data). Only a choice the user makes
deletes one:

- the cleanup the user confirms in g;
- picking a different model, which replaces the old download and clears
  its row (BL7). Picking the same model keeps its progress;
- **a successful custom import, in both modes** (lead ruling,
  2026-11-16; the same principle as the different-model pick).
  Importing a model is the user's choice of a model, so it ends the
  download they had kept: its row is cleared and its partial removed,
  only on success (BL7). A failed copy or smoke test leaves the row and
  its model file intact. The import stays available in strict (R11), so
  this applies there too. The sweep must never delete the **current**
  model's file; #115 covers that guarantee. Apart from the
  confirmations below, Step 2 does not change the import path.

The hub's orphan sweep keeps a kept download's file (BL9).

**Import and a different-model pick both ask first** (lead rulings,
2026-11-16; the owner may overrule). Their basis is this item's own
principle (only a choice the user makes deletes a kept download) and
rule 2 (the user decides what happens to their data). Both look at the
saved row's model **and status**; PR #125's `readDownloadModelId`
returns only the model, so Step 2 adds a read that returns both (the
plan names it).

- **Import.** When a saved row is `paused` or `downloading`, in either
  mode, the list's "Import custom .gguf" row shows a confirmation
  naming the row's model. Today that row's handler sends
  `IMPORT_CUSTOM` and then calls `router.push('/model-hub/import')`;
  the confirmation comes before **both** (`customImport` has no exit,
  BL7, so nothing may enter it before the user agrees):

  > Importing your own model stops the download of `<model name>`.
  > What it downloaded so far is thrown away.
  > [Cancel] [Import anyway]

  Cancel sends nothing, pushes nothing, and leaves the row as it is.
  Import anyway sends `IMPORT_CUSTOM`, pushes the import screen, and the
  import goes on as above. With no such row, no confirmation shows.
- **A different model.** When a saved row is `paused` or `downloading`
  for another model, picking a model shows a confirmation **before**
  `SELECT_MODEL` is sent:

  > Choosing `<new model>` stops the download of `<kept model>`.
  > What it downloaded so far is thrown away.
  > [Cancel] [Choose anyway]

  Cancel sends nothing and leaves the row as it is. The order is: in
  strict, R12's refusal comes first and nothing else shows; otherwise
  this confirmation, then the existing "Replace model" confirmation
  when it applies (the plan may merge those two, as long as both
  statements show).

**j. A paused row with no resume data is checked first** (review,
2026-11-16; M7). In either mode, when the hub restores a `paused` row
whose pause state is null, it runs the size check (`verifyDownload`)
before it settles on `paused`. If the file is complete, the restore
goes on to the smoke test, as a `downloading` row's restore does
(R10f, R10h). Otherwise the download stays paused, with R10e's "will
start over" line; a paused row waits for the user, so neither
non-complete exit goes to the network check. Why: today such a restore
goes straight to `paused`, and Resume with no pause state reaches
`startDownload`, which on Android writes from byte 0
(`prepareDestinationForWrite` with append off), so a finished 2.4 GB
model would be fetched again. This extends B4 of
`specs/2026-11-12-ios-model-memory/spec.md` (a file on disk that
passes `verifyDownload` goes straight to the smoke test) to paused rows
with no pause state. A `paused` row whose pause state has resume data
keeps today's restore (B2 of the same spec: no pause call, wait for
Resume).

R10j and BL8 never meet: R10j runs at restore, only with **no** resume
data, and asks whether the file is complete; BL8 runs at resume, only
on Android and only **with** resume data, and asks whether the partial
covers the offset. So the "will start over" line is always true where
it shows; a row with resume data whose partial went missing also
starts over (BL8), with no line in advance. A declined continuation
(BL3) with resume data keeps the B2 restore; without it, it gets
R10j's check.

*(Rule 11; rule 2: model installs stay explicit.)*

**R11 — Strict privacy with no model installed.** The journal needs a
model to run (rule 1 starts "after a model is installed"). With none
installed, the app opens on the model hub, as it does today. In strict
privacy the hub shows:

> **Strict privacy is on**
> Your journal needs an AI model to run. Models download from the
> internet, and strict privacy keeps Curated Journal off the internet.
> If a model file is already on this device, you can import it with
> Import custom .gguf. Or step out of strict privacy, download a model,
> then step back in.
> [Step out of strict privacy]

After a read failure (R3), the notice starts with that sentence.

- The model list stays visible, and tapping a model shows the
  downloads-off alert (R5).
- **"Import custom .gguf" stays available in strict privacy** (owner,
  OQ-2). It hands the app a file through the OS document picker, which
  the charter's picker exception covers, and it reaches nothing itself.
  It has no manifest byte or integrity check today. #115 adds
  integrity checks for an imported file that matches a curated model,
  and makes sure the orphan sweep never deletes the current model's
  file. A successful import abandons any kept download, and the list
  asks first when one exists (R10i).

*(Rules 1, 2, 11.)*

**R12 — Changing the model in strict privacy.** Settings → Change AI
model still opens the hub. The hub shows the notice: "Models download
from the internet, which strict privacy keeps Curated Journal away
from. Your current model stays in place. To change it, import a model
file that's already on this device, or step out of strict privacy
first." Picking a catalog model is refused (R5) **before** anything
else: before R10i's different-model confirmation, before the "Replace
model…" confirmation that `commitSelection` shows ("… will be deleted
now"), and before the `retiringCurrent` state that follows it. Today,
`SELECT_MODEL` deletes the current model (`retiringCurrent`) before any
download starts. In strict privacy that would leave the user with no
model and no way to download one. The machine cannot import
`privacyMode.ts` (which has native imports), so the strict refusal
arrives as a guard the plan injects into `ModelHubApi`: the hub asks
the gate before sending `SELECT_MODEL`, and the machine sees only the
refusal, not the mode (the same guard drives M8). *(Rules 1, 11.)*

**R13 — The journal keeps working in strict privacy.** Everything rule
1 names works in strict privacy and starts no off-device traffic:
writing and saving notes (the save queue), organizing (the Night Shift
librarian and heal passes, and the opt-in prune pass), asking questions
with citation chips (rule 8), exploring the graph, importing and
exporting OKF bundles (through the OS picker and share sheet), and
using the current model. The automated tests in Verification show that
the app's own code starts no traffic through the APIs they watch. The
proof that nothing leaves the device is the on-device check with a
proxy or router log running from process start. *(Rules 1, 11, 13:
"the user can stay in strict privacy forever and lose nothing the
journal does today".)*

**R14 — Updates in strict privacy.** The strict-mode copy says the app
gets no updates, including security fixes (rule 11). An update that
was downloaded before strict privacy turned on still installs at the
next restart, because that step happens on the device. *(Rules 10,
11.)*

**R15 — The privacy policy matches.** Step 2 updates
`docs/privacy/index.html` to describe Standard and strict privacy.

- The policy says "The app makes no network connections on its own",
  under the heading "The only network activity — and you start each
  one". After #118 that sentence is true only under the charter's
  "else" reading: a model download the user started carries on after a
  background pause or a kill (R6), which is a connection the app makes
  without a new tap. Step 2 rewords it to match the Standard copy:
  nothing else goes online on its own, and a model download you started
  can carry on by itself when you come back to the app or open the
  model hub, sometimes from the start, and asks first if you're on
  cellular data.
- The heading changes too, because "you start each one" no longer
  covers a continuation. It names what the user starts and what
  carries on after it (Step 2 picks the words).
- The policy's update-check line gains the install ID: Expo's update
  service also receives a random ID for this copy of the app (the
  `EAS-Client-ID` header; survey path 3), as the Standard copy and
  R9's confirmation say.
- What the policy says about strict privacy on iOS must match R3 until
  #119 ships.

*(Rule 9: "privacy is the product".)*

**R16 — No INTENT.md edits.** Step 2 does not change INTENT.md. The
implementation status lives in this spec's status line (INTENT check,
item 1; AGENTS.md).

**R17 — The survey is re-run on every engine bump.** Any change that
bumps the wiki engine packages re-runs this survey's engine check on
the new version's shipped code (no `fetch`, `XMLHttpRequest`,
`WebSocket`, `EventSource` or `sendBeacon`) and records the result in
that change. The coverage test scans `src/` only and cannot see inside
`node_modules`. *(Rule 11.)*

## Version cost

**Step 2: expected MINOR** (the next MINOR on the 9.x island when it
lands), shipped over the air to installed 9.x binaries. Because Step 2
lands in this same pull request, the pull request's version bump
becomes that MINOR when the implementation lands; until then it
carries a PATCH for the spec alone. Step 2 is JS/TS only:

- the mode module and its storage (`expo-secure-store` is already
  installed and already in `app.json` plugins);
- the Settings section, the hub notices, the hub's Turn on strict
  privacy control (R7), and the confirmations and alerts;
- the gates in the download service, the update check, the tip jar
  and the hub machine, and the download service's pause owner;
- the hub-machine changes in rows M0–M13;
- the shared `onLinkPress` in `src/components/NoteMarkdown.tsx` (the
  wrapper and the image rule are #118's, in PR #120);
- the privacy policy page;
- the `docs/VERSIONING.md` edit that adds the IPA `Info.plist` artifact
  check (Verification, below) to the release-train steps;
- `sessionType: 'foreground'` on the two download calls (R10b, owner
  OQ-7): an option of an API that is already in the binaries (the 9.x
  lockfile pins expo-file-system 58.0.13, checked at `009fa61`,
  `94296e7` and `748e11e`).

It adds no native module, no `app.json` plugin and no permission. The
native half of "strict from launch" that already exists, the
launch-time update check set to never run, is in the binaries Step 2
can reach. It is checked on each built artifact (VERSIONING.md train
step 4).

Three changes ship on their own:

- **#118, PATCH, now.** Remote images in notes stop loading. JS only.
- **#124, PATCH, now** (PR #125): the Baseline. JS only.
- **#119, MAJOR, on the release train.** `expo-iap`'s StoreKit
  listeners stop starting at launch on iOS: both the app-delegate
  subscriber and `ExpoIapModule`'s `OnCreate` `setupStore`. It changes
  native code, so it needs a new binary and starts a new runtime
  island. Step 2 does not wait for it, and strict from launch on iOS is
  complete only once it ships (R3).

**What would make Step 2 itself MAJOR:** anything that changes the
`npx expo prebuild` output beyond the version stamps (the VERSIONING.md
test). For example: adding a native module (to block traffic at the OS
level, or to store the mode somewhere else), or changing `app.json`
plugins or permissions.

## Out of scope

- **#115**: integrity verification of an imported model file that
  matches a curated model (the manifest's byte and integrity checks),
  and the import's orphan sweep never deleting the current model's
  file. It needs its own spec. (Keeping a kept download through an
  import is no longer part of it: an import abandons it, R10i.)
- **#118**: blocking remote images in notes. It ships first, on its
  own. Step 2 keeps it in place (R6).
- **#124** (PR #125): the Baseline. It ships first, on its own. Step 2
  keeps it in place.
- **#128**: hash verification of a downloaded model file (BL10).
- **#126 and #127**: pre-existing gaps found in PR #125's review
  (Baseline).
- **#119**: removing `expo-iap`'s launch-time StoreKit listeners on
  iOS. A separate MAJOR with its own spec.
- **Step 3**: modes less strict than Standard (sync, pairing), and
  launch-time update checks as a mode unlock (ROADMAP Exploratory).
- **OS-level blocking.** An app cannot remove its own network
  permission while it runs. Strict privacy means the app starts no
  traffic. The tests show that for the app's own code, and the
  on-device proxy check is the proof.
- **Changing what Standard allows**, beyond R6.

## Verification

Automated (Step 2; `npm test`, `npm run lint` and `npx tsc --noEmit`
must pass):

- **Seeding.** The mode reads as strict until it has been loaded (R3),
  and the load is memoized per process (R4). So suites that predate
  this spec — `privacyMode.test.ts`, the tip-jar tests, the
  update-check tests, the download-service tests and #125's tests —
  must seed Standard before asserting any allowed behavior: by loading
  through a mocked store that holds `'default'`, or through a shared
  jest setup file. Without seeding, every gate says no and the suites
  fail.
- **#125's tests stay green:** every file in Baseline's keep-green
  list, unchanged in what it asserts.
- **Step 2 machine changes:** each row M0–M13 has the test in its last
  column.
- **`__tests__/strictPrivacyJournal.test.tsx` — rule 1 in strict
  privacy.**
  - Setup: the mocked secure store holds `'strict'` under the
    privacy-mode key, and the test loads it through the same load
    function the bootstrap calls. No test-only setter.
  - Every network-capable entry point is replaced by a spy:
    - `expo-updates`: `checkForUpdateAsync`, `fetchUpdateAsync`;
    - `expo-iap`: `initConnection`, `fetchProducts`,
      `getAvailablePurchases`, `requestPurchase`, `finishTransaction`;
    - `expo-file-system`: `DownloadTask` (construct, `downloadAsync`,
      `resumeAsync`) and `File.downloadFileAsync`;
    - `expo-network` `getNetworkStateAsync`;
    - `Linking.openURL`;
    - React Native `Image.getSize`, `Image.getSizeWithHeaders` and
      `Image.prefetch`, and the `source` of every rendered `Image`
      (no `http://`, `https://` or `//` address);
    - global `fetch`, `XMLHttpRequest` and `WebSocket`.
  - Positive control: in Standard, the same spies fire when the user
    starts each path (a download start and a resume, an update check,
    opening the tip jar). So a silent spy in strict means the path was
    blocked, not that the spy was never wired up. `Linking.openURL` has
    no Standard positive control, because no mode opens a note's link:
    the markdown tests assert it is never called, in both modes.
  - The update-check control needs two mocks. `src/lib/updateCheck.ts`
    returns `'unavailable'` before any network call when
    `__DEV__ || !Updates.isEnabled`, and under jest-expo that
    condition is always true. So the test mocks `expo-updates` with
    `isEnabled: true` and sets `global.__DEV__ = false`, restoring it
    afterwards, as `__tests__/updateCheck.test.ts` already does. The
    strict run uses the same mocks, so that the gate refuses the
    check, not the dev guard.
  - Run in strict, on the mock LLM provider and the node SQLite adapter
    (`__tests__/helpers/nodeSqliteAdapter.ts`): save a note through the
    save queue, run a Night Shift librarian pass, ask a question and
    get a cited answer, load the graph, export an OKF bundle, import
    one, and show a note that has a remote image and a link.
  - Expect: every feature succeeds, and no spy fired.
  - What it shows: the app's own code starts no traffic through the
    APIs the test watches. It cannot see native code, or a library
    that reaches the network some other way. The on-device proxy check
    is the real proof.
- **Bootstrap to ready in strict.** With a model installed and
  `'strict'` stored, the root layout reaches `ready` and the journal
  shows, no spy fires, and the hub never mounts.
- **R3 ordering.** While the mode load is held pending (a slow read):
  every gate says no, no gated call happens, and the hub does not
  mount. When the load resolves to strict, still none.
- **`__tests__/privacyGateCoverage.test.ts` — no ungated path.**
  - It scans `src/` for: `expo-updates`; `expo-iap`; the network APIs
    of `expo-file-system` (`DownloadTask`, `UploadTask`,
    `File.downloadFileAsync`, and the legacy `downloadAsync`,
    `createDownloadResumable` and `uploadAsync`); `expo-network`;
    `Linking` (from `react-native` or `expo-linking`);
    `expo-web-browser`; `expo-image`; `expo-asset`;
    `react-native-markdown-display`; `fetch`; `XMLHttpRequest`;
    `WebSocket`; `Image.getSize` and `Image.prefetch`; an `Image`
    `source` with a remote `uri`; and an outside `http(s)` address
    passed to `Link`, `router.push`, `router.replace` or `Redirect`.
  - It fails if a file outside two reviewed allowlists uses one:
    - **Gated:** each file must import its gate from
      `@/lib/privacyMode`. Markdown renderers must use the shared
      wrapper: only `src/components/NoteMarkdown.tsx` may value-import
      `react-native-markdown-display` (#120's lint rules enforce this
      too, for static imports, subpaths, `import()` and `require()`;
      type imports, such as `markdownRules.tsx`'s
      `import type { RenderRules }`, are allowed), it must pass
      #118's image rule and the shared `onLinkPress`, and its props
      must leave out `rules`, `renderer` and `onLinkPress`.
    - **No gate needed:** files that use such an API but send
      nothing, each with the reason written next to it:
      `src/lib/networkGate.ts` (asks only the OS) and
      `src/components/graph/GraphCanvas.web.tsx` (loads CanvasKit's
      bundled WebAssembly from the web build's own origin; web only).
  - It covers `src/` only. The survey covers libraries (R17). Together
    they cover ROADMAP Step 2's "and anything added later".
- `__tests__/privacyMode.test.ts`, extended:
  - the saved mode is read and written;
  - every gate says strict before the load;
  - a read failure, and an unknown stored value, mean strict;
  - turning strict on applies first and saves second (R8); stepping
    out saves first and applies second, so every gate says no until
    the save resolves, and stays no when it fails (R9);
  - subscribers hear each change.
- Download service and model hub, Step 2 cases
  (`modelDownloadService.test.ts`, `modelHubMachine.test.ts`,
  `useModelHub.test.ts`, the `_layout` restore, the hub screens):
  - **Owner (R10a).** Turning strict on from Settings mid-download (hub
    closed) pauses through the owner, which saves `paused` before
    `pauseAsync` and again with the pause state; a relaunch in Standard
    after a kill between the two shows the download paused and creates
    no `DownloadTask` until Resume (R8 kill window). A task that is not
    `active` is no live transfer, and the owner does not throw. The
    record is cleared when a transfer completes, fails, is cancelled or
    is paused. **Gate errors (R4, R10a):** a refused start or resume
    throws `PrivacyGateError('refused')` before any `DownloadTask` is
    created or recorded; a transfer the strict pause stopped resolves
    `null`, and the service throws `PrivacyGateError('stopped',
    pauseState)` only after the owner's saves have resolved; a hub
    pause still returns `null`.
  - **One transfer (R10b).** Starting or resuming while a transfer is
    live stops the old one first. Start and resume pass `sessionType:
    'foreground'`.
  - **Never resumes by itself (R10d).** Starting from a download paused
    with reason `background`, turning strict on (M1) sets reason
    `strict`; a later `APP_FOREGROUND` stays in `paused` and creates no
    `DownloadTask`. Nor does it resume on restart or on leaving strict.
  - **In-flight pauses (R7, R8 step 1, R10b), one test per case:**
    (i) while `paused`'s pause task is still pending, the hub's Turn on
    control is hidden; (ii) when `pauseAsync` rejects, the owner
    cancels the transfer before `failed` is entered (M0); Turn on from
    the hub in `failed` then finds no active record, sends no strict
    event, leaves the machine in `failed` with its label, and
    `LEAVE_FAILED` reaches the list (M11); (iii) reopening the hub
    while a closed-hub transfer still runs in the same process stops it
    in the layout before `setRestore`; `RESTORE_DOWNLOAD` keeps status
    `downloading` and carries the produced pause state; the row is
    `paused` with it; and declining on cellular or `LEAVE_WAITING`
    offline leaves no transfer running and a `paused` row. If that
    pause fails, the transfer is cancelled and the restore carries no
    pause state.
  - **Completed while closed (R8, R10f, R10j).** A `downloading` row
    whose file is complete, with no live service record: turning strict
    on in Settings runs only `verifyDownload` (no hub machine is
    created, the dialog does not wait on a model load), and no warning
    shows. A `paused` row is never pre-checked. When the hub next opens
    under strict, the restore runs the size check and then the smoke
    test, the row is not rewritten as `paused`, and the download
    reaches `complete`.
  - **R8 step 1 race.** When the transfer finishes between the first
    save and the pause (the task is not `active`), the owner runs
    `verifyDownload`; with a complete file, no warning shows, nothing
    is removed, and the row stays `paused` for R10j.
  - **Can't keep (R10g).** No resume data, a failed pause, or no live
    handle shows the warning before the mode changes. Turn on and
    remove cancels the transfer, drops the resume data, deletes the
    Android partial but never the installed model's file, and clears
    the row: from the hub through `api.clearDownloadState` (then M3),
    from Settings through the store it opened.
  - **Cancel on the warning (R10g), one test per variant.** After a
    pause with no resume data, Cancel keeps Standard, re-saves the row
    as `downloading` with no pause state, and (on Wi-Fi) calls
    `startDownload`; after a failed pause, the same, and the old
    transfer is cancelled first; with no live handle, Cancel leaves the
    row exactly as it was and starts no transfer. In the two variants
    that start a transfer, one that then completes with the hub closed
    restores through the size check to the smoke test, not to `paused`.
    From Settings with `checkNetworkGate` mocked to cellular or
    offline, Cancel starts no transfer, and the next hub open restores
    the row through `confirmingNetwork` (cellular asks; offline waits).
  - **R10h.** In strict, a finished download on disk goes through
    `verifying` and `smokeTest` to `complete`, and no network spy
    fires.
  - **R10i.** Switching modes, launching and opening the hub delete no
    model file. A successful custom import in strict clears a
    strict-paused download's row, so the next hub open restores
    nothing.
  - **Import confirmation (R10i).** With a `paused` or `downloading`
    row saved, tapping the list's "Import custom .gguf" row shows the
    confirmation naming the row's model before `IMPORT_CUSTOM` is sent;
    Cancel sends no event and makes no `router.push`, and the row is
    unchanged; Import anyway sends `IMPORT_CUSTOM` and pushes
    `/model-hub/import`. With no such row (or a `failed` one), no
    confirmation shows. Then, after Import anyway, a failed copy or
    smoke test leaves the row and its model file intact.
  - **Different-model confirmation (R10i, R12).** With a `paused` or
    `downloading` row saved for model A, picking model B in Standard
    shows "Choosing B stops the download of A…" before `SELECT_MODEL`;
    Cancel sends no event and leaves the row; Choose anyway sends it.
    Picking A shows no such confirmation. In strict, picking B shows
    only the downloads-off alert: no different-model confirmation, no
    "Replace model", and no `SELECT_MODEL`, so `retiringCurrent` never
    runs.
  - **Paused-for-strict screen (R10e).** The download screen for a
    strict-paused row shows "Paused — strict privacy is on", a Step out
    of strict privacy button that opens R9's confirmation, and the
    Choose another model exit; after stepping out the label reads
    "Paused" (from the mode alone). Any `paused` row with no resume
    data, in either mode, also shows "This download will start over
    when you resume."
  - **Choose another model from `paused`, focus effect (R10e, M6).**
    Against the real machine and the real `index.tsx`, with a
    `useFocusEffect` mock that **runs** its callback (not a mocked
    `useModelHub`): `LEAVE_PAUSED` goes `paused` → `selecting`, keeps
    the row and the machine's `modelId` and `pauseState`, the download
    screen dismisses, and the list does not push the download screen
    again. Positive control: with the machine in `paused`, the same
    harness does push it. Picking the same model then resumes from the
    kept pause state behind the network check. The exit shows in
    strict and after stepping out. The same test, for `LEAVE_FAILED`
    from `failed` (M11), dismisses to the list and reaches "Import
    custom .gguf".
- **Hub notices.** The strict notices in R7, R11 and R12 show in strict
  and not in Standard; the read-failure sentence shows after a read
  failure; the Step out button opens R9's confirmation.
- **Hub Turn on strict privacy control (R7)**, one test over the
  states: in Standard it is shown and active in `selecting` (on the
  list), and in `paused` once settled, `failed` and `smokeFailed` (on
  the download screen); hidden in `paused` while the pause task is
  pending, while a restore is pending (the provider's `restore` prop
  set, its `RESTORE_DOWNLOAD` not yet sent: hidden on the list's
  initial `selecting`), and in every other state listed in R7,
  including M7's check state. It is hidden in strict. It opens R8's
  confirmation. Two more cases: from a settled `paused` with reason
  `background` and no active record, Turn on asks the service, then the
  reason becomes `strict`, the label changes, and a later
  `APP_FOREGROUND` does not leave `paused` (M1); from `selecting` with a saved
  `downloading` row (a restore after a kill that waited for Wi-Fi,
  then "Choose another model") and an incomplete file, the pre-check
  shows the merged can't-keep confirmation; with a complete file, no
  warning.
- **Settings → Privacy section (R7).** It renders as the first section;
  it offers exactly two choices, Standard and Strict privacy, each with
  the copy from "The two modes, as the user reads them"; the current
  mode is selected; a first install shows no first-run prompt (R1).
- **Confirmations (R8, R9).** Both render the required text; on R8,
  Cancel keeps Standard on and changes nothing, and Turn on runs the R8
  order; on R9, Cancel keeps strict, and Step out saves first and
  applies second. With the warning merged (no live handle), "A
  download in progress pauses now and won't restart on its own" is
  absent, the warning's cancelling sentence is absent, and the button
  reads "Turn on and remove".
- **Save-failure messages (R8 step 3, R9).** When the save rejects, the
  exact failure message shows, and the mode the gates report matches
  the message (strict in both cases).
- **R8 step 5.** After a check is stopped mid-flight, the update row
  reads "Strict privacy is on. The update check stopped."
- **R3 read-failure copy.** With the store read failing, Settings →
  Privacy shows "Curated Journal couldn't read your privacy setting…",
  and with no model installed the hub notice starts with it.
- **R5 iOS sentence.** With `Platform.OS` mocked to `'ios'`, the
  strict downloads-off alert contains "A download an older version of
  this app started may still be finishing on its own. The app itself
  sends nothing." before "Nothing was sent."; on Android it does not.
- **R15.** `docs/privacy/index.html` names Standard and strict privacy,
  matches the modes' copy (including "Nothing else goes online on its
  own" and the download-continuation sentence, in place of "The app
  makes no network connections on its own"); its heading no longer
  says "you start each one"; its update-check line names the random
  install ID Expo receives; and its iOS strict wording matches R3's
  caveats (#119 and pre-Step-2 downloads).
- `updateCheck.test.ts`, `updateCheckRow.test.tsx`: a check is refused
  in strict; the gate is asked again between check and fetch.
- `tipJarStore.test.ts`, `tipJarSection.test.tsx`: the session closes
  when strict turns on; `openTipJar` stops after `initConnection` when
  the mode has turned strict, before `fetchProducts` and before
  `recoverUnfinished`; `getAvailablePurchases` and `finishTransaction`
  are not called in strict; the alert copy names Settings → Privacy.
- Markdown: #118's tests stay in place. A link tap, in Standard and in
  strict, for every scheme (`https`, `http`, `mailto:`, `tel:`, another
  app's scheme, `cur://`, no scheme), shows the alert (with the full
  href, and the Standard or strict copy) and never calls
  `Linking.openURL`. **Share…** calls `Share.share` with
  `{ message: href }`; **OK** calls nothing. The library never calls
  `Linking.openURL` itself (the shared `onLinkPress` never returns
  `true`), and a caller cannot pass its own `onLinkPress` to
  `NoteMarkdown`.
- `__tests__/appConfig.test.ts` keeps asserting
  `checkAutomatically: 'NEVER'`.

Artifact check on every built iOS release (Step 2 adds it to
VERSIONING.md, next to the `EXUpdatesCheckOnLaunch` check in store
step 6): `plutil -p` on the IPA's `Payload/*.app/Info.plist` shows
neither `NSBonjourServices` nor `NSLocalNetworkUsageDescription`.

On-device checks. These are the user's to run and never block the
status line, un-drafting or cleanup (AGENTS.md):

- [ ] A first install starts in Standard, and Settings → Privacy shows
      it.
- [ ] iOS: turn on strict, uninstall, reinstall. If the Keychain kept
      the setting, the app starts in strict and says so.
- [ ] Android (Pixel 6): during a model change, turn on strict
      privacy in Settings mid-download. Progress stops, and the partial
      model file is still in the app's documents folder. Kill and
      relaunch: the hub shows paused. Step out: still paused until
      Resume. Resume continues from where it stopped.
- [ ] Android, sink guard (BL8): with a download paused, delete or
      truncate its partial file (for example with `adb shell` and
      `run-as`), then tap Resume. The download starts over from zero,
      with no corrupt file, and the finished file passes the size check
      and the smoke test.
- [ ] iOS (iPhone): the same steps. Resume continues from where it
      stopped. If iOS deleted its temporary file in between, the
      download ends in a state the user can act on, with no error loop.
- [ ] Where a download that can't be kept can be produced: the warning
      shows before the switch; after Turn on and remove, the hub has
      nothing to restore, and on Android the partial file is gone.
- [ ] iOS, foreground session (R10b): with the hub open, background
      the app mid-download and come back; it pauses and resumes as
      before. With the hub closed, the download stops while the app is
      away, and nothing transfers after the app is killed.
- [ ] iOS, accepted risk (OQ-7): background the app mid-download with
      the hub open, several times. Watch whether a pause ever loses
      the race with suspension and the download starts over.
- [ ] iOS, accepted risk (OQ-7): with a download paused by a version
      from before Step 2, update, then Resume. Note whether it resumes
      or starts over.
- [ ] iOS, pre-Step-2 transfer running (R3, R5): with a download left
      RUNNING (not paused) by a version from before Step 2, apply the
      Step 2 OTA update, relaunch, and turn strict privacy on. Watch
      the proxy log from process start: the app itself makes no
      request, and the strict pause reports no live transfer. Note
      whether the leftover background transfer keeps running anyway
      (it is unreachable from JS), and when it finishes. Check that the
      downloads-off alert shows the iOS sentence.
- [ ] R14: with an update downloaded but not yet installed, turn
      strict privacy on and restart the app. The update installs at
      that restart.
- [ ] In Standard, PR #125's own on-device checks (its spec's
      Verification) still pass after Step 2. To force-stop on Android
      without a background pause first, use
      `adb shell am force-stop com.equationalapplicationsllc.curatedjournal`.
- [ ] Kill window (R8): mid-download, tap Turn on and kill the app at
      each point; then relaunch.
      - Before the first save: the app relaunches in Standard with the
        row still `downloading`, and the hub restarts the download from
        the start through the network check (on cellular, the prompt
        first).
      - After the first save, before the pause state is saved: Standard,
        the download shows Paused with "This download will start over
        when you resume", and Resume starts it over, asking first on
        cellular.
      - After the pause state is saved, before step 3: Standard, the
        download shows Paused, and Resume continues from where it
        stopped.
      - After step 3: the app relaunches in strict privacy, and the
        download shows "Paused — strict privacy is on".
- [ ] In Standard and in strict: tap an `https` link, a `mailto:` link
      and a `tel:` link in a note. Each shows the "Links don't open
      from notes" alert with its full address, and opens nothing.
      Share… opens the OS share sheet with the address (Copy is there);
      OK closes the alert.
- [ ] Turn on strict from Settings when the download can't be kept,
      then tap Cancel on the warning. The app stays in Standard, and:
      - on Wi-Fi, the download starts over at once;
      - on cellular or with no connection, nothing starts from
        Settings; the next time you open the model hub, it asks on
        cellular, or waits for Wi-Fi, before the download starts over.
- [ ] Import anyway, then cancel the file picker or pick a file that
      fails: the kept download is still there and resumes after the hub
      is reopened (cancelling the picker leaves the hub in
      `customImport`, which has no exit; BL7).
- [ ] With a download kept for one model, pick another: the "Choosing
      … stops the download of …" confirmation shows first; Cancel
      keeps the download.
- [ ] In strict privacy, with a proxy or router log running from
      process start, launch the app and use every journal feature. The
      app makes no request. This is the proof R13 points to.
- [ ] Strict privacy survives a relaunch.
- [ ] Tip jar, update check, and Resume each show their alert in
      strict privacy.
- [ ] Strict privacy with no model: the hub notice shows, Import custom
      .gguf works and makes no request, and stepping out from the hub
      works.
- [ ] iOS: watch a proxy log at launch for traffic from `expo-iap`'s
      launch-time listeners, before and after #119. This is evidence
      for #119.

## Resolved questions

The owner answered these on 2026-11-16. Each question is kept as it was
asked, with the answer and where the spec encodes it.

- **OQ-1 — The default mode's name.** *Asked:* The charter calls it
  "the app's default mode" and does not name it on screen. This spec
  used "Standard" as a working name. Curated Thoughts' modes are
  Strict, Ephemeral and Connected, and its default is Strict. None of
  those names fits this mode, which is not strict and connects nothing
  new. What should the user see?
  **Answer:** "Standard". *Encoded in:* Names, R1, R7.
- **OQ-2 — The existing "Import custom .gguf" in strict privacy.**
  *Asked:* The model hub already has this row
  (`src/app/model-hub/import.tsx`). It uses the OS document picker,
  runs a smoke test, and has no manifest byte or integrity check. Under
  the charter's picker exception it reaches nothing itself, so a user
  in strict privacy could install a model with it today, before #115.
  Should it stay available in strict privacy, or be hidden there until
  #115 lands? (Its cleanup deletes curated model files that are not the
  current model, including a download kept by R10.)
  **Answer:** It stays available in strict privacy. #115 will add the
  integrity checks and stop its cleanup from deleting a kept partial
  download. *Encoded in:* R10i, R11, R12, the strict copy, R8's
  confirmation.
  **Superseded in part (lead ruling, 2026-11-16; the owner may
  overrule):** a successful custom import abandons any kept download,
  in both modes. On success its row is cleared and its partial file is
  not preserved; a failed copy or smoke test leaves the row and its
  model file intact (BL7). So #115 no longer stops the import's cleanup
  from deleting a kept partial. #115's remaining scope is integrity
  verification of imported files that match a curated model, and the
  orphan sweep never deleting the current model's file. *Encoded in:*
  R10i, R11, Out of scope.
- **OQ-3 — Links inside notes, in the default mode.** **Superseded
  2026-11-21: no link opens in any mode (see the owner ruling below).**
  *Asked:* In
  strict privacy they are blocked (R5). In the default mode, rule 9's
  list (downloads, update checks, tips) does not name them. Should a
  tap open the link in the browser (the user started it), or show an
  explanation as strict privacy does?
  **Answer:** In Standard, a tap opens the link in the browser; the
  user started it. Strict blocks it, with the explanation. *Encoded
  in:* path 7, the Standard copy, R6, R9, R5, INTENT check item 5.
  Which link schemes "opens in the browser" covers was settled by
  OQ-8: web links only.
- **OQ-4 — Remote images in notes: confirm the block in both modes.**
  *Asked:* Today a note that contains `![…](https://…)` loads that
  image on its own as soon as the note is shown. A note can come from
  the model or from an imported bundle. Rule 9 ¶2 ("nothing else runs
  on its own") rules this out of the default mode, so this spec blocks
  it in both modes (R6). That means the default mode is not exactly
  today's behavior. Confirm.
  **Answer:** Confirmed: remote images are blocked in both modes. It
  ships now, as a separate PATCH bug fix, #118. *Encoded in:* path 8,
  R6 (#118 delivers it; Step 2 keeps it and its test in place), R15,
  INTENT check item 2.
- **OQ-5 — `expo-iap`'s iOS listener at launch.** *Asked:* On iOS,
  `expo-iap` starts a StoreKit listener at every launch, before any
  JavaScript. JS cannot gate it. This survey found no request it sends.
  Removing it is a native change, so MAJOR. Is it acceptable under rule
  11's "nothing that can reach outside may act before the mode is
  honored" until evidence says otherwise? Or must it go, as a separate
  MAJOR on the release train?
  **Answer:** It must go, as a separate MAJOR on the release train:
  #119, covering both the app-delegate subscriber and `ExpoIapModule`'s
  `OnCreate` `setupStore`. Strict from launch on iOS is complete only
  once #119 ships. Step 2 stays MINOR. *Encoded in:* path 9, R3,
  Version cost, INTENT check item 3.
- **OQ-6 — A strict pause with no resume data.** *Asked:* If the
  platform returns no resume data, or the pause fails, the spec as
  first written stopped the
  download anyway and kept the partial file. A later Resume then starts
  the download over from zero. Is that acceptable?
  **Answer:** No. If switching to strict would leave a download that
  cannot be resumed later (no resume data, the pause fails, or no live
  handle), the app warns before the switch. If the user confirms, it
  cleans up what the download left behind (resume data, references to
  the OS's temporary file, the partial file), so nothing half-finished
  is left. A later download in Standard starts fresh. *Encoded in:*
  R8, R10g.
  **Follow-up answer (Cancel):** when the pause before the switch shows
  the download can't be resumed and the user taps Cancel on the
  warning, the app stays in Standard and resumes the download; it
  starts over if there is no resume data. *Encoded in:* R10g, the
  warning copy, Verification.
- **OQ-7 — Should an iOS model download stop when the app is
  suspended or killed?** *Asked:* On iOS, the download service creates its
  downloads with no `sessionType`, so expo-file-system 58.0.13 runs
  them in a background `URLSession`. A background transfer keeps going
  after the app is suspended, and after it is killed. After a kill,
  nothing in the relaunched app can reach it: strict privacy cannot
  pause it, and the hub's restore starts a second download next to it.
  (Android is not affected: its download runs inside the app process.)
  No spec or commit chose `'background'`; it is the library's default.
  The recommendation is `sessionType: 'foreground'` on both
  `startDownload` and `resumeDownload`. It is JS only, so Step 2 stays
  MINOR. What it costs, read from the code and its history:
  - With the hub open, nothing changes on purpose. The hub already
    pauses the download when the app goes to the background, and
    resumes it when the app comes back (2026-11-12 model-memory spec,
    B3), and the download screen says "Keep this screen open for the
    fastest download."
  - With the hub closed mid-download (mainly during a model change),
    the download stops when iOS suspends the app, instead of finishing
    in the background. The next time the hub opens, it starts over.
  - After a kill, little is lost: this survey found nothing in the
    relaunched app that claims the old transfer's file, so its bytes
    are thrown away today, and the hub starts over anyway.
  - A risk, not checked on a device: if the hub's pause has not
    finished when iOS suspends the app, a foreground transfer may fail
    instead of pausing, and a 2.4 to 2.7 GB download starts over.
  - Also not checked: a download paused by an older version under the
    background session may not resume in a foreground session. Then it
    starts over.

  Accept `'foreground'`? Or keep `'background'`, and accept that on
  iOS a download started in Standard can outlive the app, out of strict
  privacy's reach, until a native fix (MAJOR) cancels leftover
  background transfers at launch?

  **Answer:** Foreground. Both `startDownload` and `resumeDownload` set
  `sessionType: 'foreground'`. Step 2 stays MINOR. The costs and risks
  listed above are accepted, and their on-device checks stay in
  Verification, unchecked. *Encoded in:* R10b, R3, R6, Version cost,
  Verification, INTENT check item 5.
- **OQ-8 — Links in notes that are not web links, in Standard.**
  **Superseded 2026-11-21: no link opens in any mode (see the owner
  ruling below).** *Asked:* No note renderer passes `onLinkPress` today, so
  `react-native-markdown-display` calls `Linking.openURL(href)` at
  once for any scheme: `http` and `https`, `mailto:`, `tel:`, other
  apps' schemes (which open that app), and the app's own `cur://` links
  (which move the app to one of its own screens). OQ-3's answer says a
  tapped link opens in the browser, and that only describes `http` and
  `https`. Strict blocks every scheme (R5). Note text comes from the
  model or from an imported bundle, so a link's scheme is not chosen by
  the user. The recommendation: in Standard, open `http` and `https`
  links in the browser, and treat every other scheme, and a link with
  no scheme, as blocked, with an alert that explains it ("Curated
  Journal opens only web links from your notes. This link is a
  `<scheme>` link. Nothing was sent."). That keeps the Standard copy
  ("Your browser opens it") exactly true. The other choice: open every
  scheme the OS can handle, as today, and widen the Standard copy and
  R9's confirmation to say links can also open your mail, phone, or
  another app. Which should Standard do? (The decision point is the
  shared `onLinkPress` in `src/components/NoteMarkdown.tsx`, either
  way.)
  **Answer:** Web links only. In Standard, `http` and `https` links open
  in the browser. Every other scheme, and a link with no scheme, is
  blocked with the proposed alert. Strict blocks all links. *Encoded
  in:* path 7, R6, R5, Verification, INTENT check item 5.
- **Owner ruling 2026-11-21 — note links never open; tier naming; strict
  copy unqualified.** Reverses OQ-3 and supersedes OQ-8: Standard does
  not open links in notes, and neither does strict. Reason: note text
  comes from the model or an imported OKF bundle, never from the user,
  so opening its links is the riskiest traffic. A tap shows an alert
  with the full address and **Share…** and **OK**; Share… uses core
  `Share.share` (no new dependency). Standard's traffic is exactly what
  rule 9 ¶2 lists, so no INTENT amendment is needed. *Naming
  (informational):* the ladder is Strict ⊂ Standard ⊂ Connected (future,
  ROADMAP Step 3, Curated Thoughts' name for its sync tier); Curated
  Thoughts' "Ephemeral" is not adopted (rule 10); a future Connected
  spec may add opening note links as a named unlock. *Strict copy:* the
  on-screen strict-privacy text stays unqualified, with no iOS caveat.
  *Encoded in:* path 7, Names, the Standard and strict copy, R4, R5, R6,
  R8, R9, Verification, Open questions.
- **Lifecycle — one pull request, or two** (raised in INTENT check
  item 4). *Asked:* INTENT's "How changes are made", item 1, puts spec,
  plan and implementation in one pull request, while the ROADMAP
  splits Step 1 (the spec) from Step 2 (the build). Should #117 merge
  with the spec alone once Reviewed, with Step 2 in its own pull
  request, or stay open for Step 2?
  **Answer:** Follow INTENT literally. #117 stays open as a draft. On
  approval the status goes to `Reviewed`; then `plan.md`, `LEDGER.md`
  and the Step 2 implementation land in this same pull request; the
  status goes to `Implemented`; and the cleanup commit deletes
  `plan.md` and `LEDGER.md` before the pull request leaves draft.
  *Encoded in:* the lifecycle at the top, INTENT check item 4, Version
  cost.

## Open questions for the owner

None. The two raised in review (2026-11-16) were answered on 2026-11-21
(see the owner ruling under Resolved questions):

- **Strict copy on iOS before #119.** The on-screen strict copy stays
  unqualified, with no iOS caveat. The caveat lives in the policy page
  (R15) and the iOS downloads-off alert (R5), as already written.
- **INTENT rule 9, paragraph 2.** No amendment is needed: no link opens
  in any mode, so Standard's traffic is exactly what ¶2 lists.
