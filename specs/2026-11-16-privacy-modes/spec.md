# Spec: privacy modes — strict privacy and Standard, the default mode

**Status: Draft** — first written 2026-11-16; amended the same day
(owner answers OQ-1 through OQ-8, then review findings applied); owner
ruling 2026-11-21 applied (note links never open in either mode).
The text as it stood before the shrink converged in Opus review on
2026-11-21 (round 11). Shrunk onto the #133 download controller on
2026-11-23 (Baseline; Step 2 machine changes; R4, R8, R9, R10). Owner
rulings of 2026-11-27 then cut the switch to strict down: R8 has no
pre-check, and Cancel on R10g's warning starts nothing (R8, R10g;
Resolved questions). The
shrunk text is in review and has not converged; it stays Draft until
it has. ROADMAP Step 1 (BINDING).

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
- Three questions are open for the owner (Open questions for the owner,
  at the end): numbers 2, 5 and 7 of the eight raised since this spec
  moved onto #133. Each carries a
  recommended default. The other five were settled by the owner's
  rulings of 2026-11-27, and the two raised earlier in review were
  answered on 2026-11-21 (Resolved questions). Step 2 waits on the
  owner's approval of this spec.

How to read it: what PR #125 and PR #133 already do is described once,
in **Baseline** (items BL1–BL11 for #125, DC1–DC8 for #133). Every
hub-machine event, state and flag that Step 2 adds or changes is one
row of **Step 2 machine changes** (rows M1–M15; the numbering has gaps
where a row was retired). Requirements cite those two sections instead
of restating them.

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

Owner ruling, 2026-11-21, encoded below: no link in a note opens, in
either mode. A tap shows a dialog with the full address, **Share…** and
**OK** (R6; supersedes OQ-3 and OQ-8). The ladder is Strict ⊂ Standard ⊂
Connected (Names). Standard needs no rule 9 ¶2 amendment, and the
strict-privacy mode description stays unqualified, with no iOS caveat.

Lead rulings, 2026-11-16 unless dated, encoded below (the owner may
overrule each):

- A successful custom import, which the user chooses, abandons any kept
  download, in both modes; a failed copy or smoke test leaves the row
  and its model file intact (R10i; BL7).
- Importing, or picking a different model, while a download is kept
  asks first (R10i).
- Superseded 2026-11-27 (owner): R10g's Cancel was to restart at once
  on Wi-Fi, and to wait for the hub's network check on cellular or
  offline. It now waits for the hub on any network (R10g).
- The hub's Turn on strict privacy control shows only at rest (R7), and
  `paused` (2026-11-16) and `failed` (2026-11-20) each get a "Choose
  another model" exit in any mode (R10e; M6, M11).
- 2026-11-20: a pause that fails cancels the live transfer, so no
  state at rest ever has a transfer in flight
  ([#132](https://github.com/equationalapplications/curated-journal/issues/132)).
  #133 delivers this (DC3, DC4).
- 2026-11-20, superseded 2026-11-23: a strict refusal and a strict
  stop were to reach the machine as one error type,
  `PrivacyGateError`. With #133 a refusal is the `refused` result of
  `start()` or `resume()`, and a stop is the `TRANSFER_STOPPED` event
  (DC6; M1, M4a). `PrivacyGateError` is not built.

Owner direction, 2026-11-21 and 2026-11-23, encoded below: model
downloads have one owner, the download controller of PR
[#133](https://github.com/equationalapplications/curated-journal/pull/133),
and this spec calls it instead of specifying a pause owner of its own.
Strict privacy supplies the controller's `gate`, calls
`stopForStrict()`, and releases the controller's latch with
`releaseStrictStop()` in a `finally` around R8's `try`, which encloses steps 1 to 6, and again
after R9 (R4, R8, R9, R10a). Reopening the hub on a running transfer
attaches to it (#133 OQ-1), which replaces this spec's earlier "a
restore stops a live transfer first" (R10b).

Owner rulings, 2026-11-27, encoded below (Resolved questions has them
in full):

- **Cancel on the can't-keep warning starts nothing.** It calls the
  controller's `park()`, on any network, and the download waits for
  the model hub. No transfer begins outside the hub, which is what
  INTENT's "Silent model installs" says (R10g; INTENT check item 8).
- **No pre-check, and no warning for a download with nothing
  running.** Turn on shows its confirmation at once. R10g's warning
  shows only when a transfer that was live at Turn on could not be
  kept (R8, R10g).
- **Dead partial files go when strict privacy turns on.** A partial
  model file that nothing can resume is deleted then, with no
  warning. Never the installed model's file, and never the file of a
  download whose row has resume data (R8, "The strict sweep";
  R10i).

(Sequencing: #125 and then #133 merge before this PR, and this PR's
branch is based on #133. #133 carries 9.3.0. This PR carries 9.3.1
while it holds the spec alone, and takes the next MINOR when the
Step 2 implementation lands in it (Version cost). If `main` has moved
past either number by then, the bump is redone against `main`.
`main` is now `0b31c74` (9.2.2, #114). PR #120 (issue #118) is on it
(`cffaf66`, 9.2.1). `main` must
be merged into this branch (never a rebase) before the Step 2
implementation starts. R6's link handler
goes into #120's `src/components/NoteMarkdown.tsx`, and Verification
relies on its `markdownRules` and its lint rules. None of the three is
on this branch yet (checked 2026-11-27: the branch is #133 at
`8f43359` plus this spec and the version stamps). The spec alone does
not need #120.)

## INTENT check

Checked against INTENT.md (static since 2026-11-04) and ROADMAP v1.2.
No requirement here contradicts INTENT on intent. The check found nine
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
   text is written by the model or an imported bundle, so the app can't
   tell a link you wrote from one it invented, and opening its links is
   the riskiest traffic. The owner ruled
   (2026-11-21, superseding OQ-3 and OQ-8) that no link opens in any
   mode: a tap shows a dialog with the address and a Share… button.
   Standard's traffic is then only the kinds rule 9 ¶2 lists (downloads,
   update checks, tips), so no INTENT amendment is needed, and the
   on-screen copy says so (rule 12). A download the user started that
   continues after reopening is read as part of "model downloads the
   user starts"; no amendment (owner, 2026-11-21). Separately, the owner ruled (OQ-7) that iOS
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
7. **The share sheet carries text, not a file.** Rule 11's share-sheet
   exception names files. This spec reads it as covering a text
   hand-off (a link address). That reading follows from the owner
   ruling of 2026-11-21 (the dialog, with Share…, shows in every mode,
   strict included). No
   amendment unless the owner wants the wording widened.
8. **A download started from Settings.** INTENT's out-of-scope item
   "Silent model installs" says: "Models enter the device only through
   an explicit user action in the model hub (rule 2)." Until
   2026-11-27 this spec had R10g's Cancel, tapped in Settings with no
   hub open, start a download over when the phone was on Wi-Fi. That
   was a transfer that began outside the hub. The owner ruled on
   2026-11-27 that INTENT's words are followed. Cancel starts
   nothing: it saves the row so that the download waits for the hub,
   and the hub starts it over, through the network check, when the
   user next opens it (R10g). Step 2 adds no transfer that begins
   outside the hub.
9. **The strict sweep deletes files with no separate prompt.** INTENT
   rule 2 wants deletion explicit and under the user's control. The
   reading here: the Turn on confirmation is the explicit act, and a
   dead partial is not a model the user kept. R10i says what a kept
   download is: a saved row whose pause state has resume data. This
   follows the owner's ruling of 2026-11-27. The confirmation's copy
   is not changed.

Rules each requirement rests on: rule 1 (the journal works with no
network), rule 2 (bring-your-own inference: models installed only by the
user, no hosted AI), rule 8 (answers cite their sources), rule 9 (the default mode),
rule 10 (version cost), rule 11 (strict privacy), rule 12 (each step
away from strict is an informed choice), rule 13 (the journal never
depends on connectivity), and the out-of-scope items "Any off-device
communication in strict privacy" and "Silent model installs".

## Survey: every path that can go off-device

Read from `main` at `94296e7` (9.1.1) on 2026-11-16, and re-checked
the same day against `main` at `748e11e` (9.2.0, after PR #116). #116
changed only the engine pins and the version stamps, so the app's own
code is the same at both commits. Paths 1 and 2 were read again on 2026-11-23 on this branch with #133
merged in (`e1e32eb`): #133 adds no path, and both are now reached
only through the download controller.
The list is meant to be complete for
the app's own code. A path added later must be added
here, and the coverage test in Verification fails until it is. The
survey is re-run on every engine bump (R17).

| # | Path | Code | Who it reaches | Started by | Standard | Strict |
|---|---|---|---|---|---|---|
| 1 | Model download, fresh start | `startDownload` in `src/services/modelDownloadService.ts` (`expo-file-system` `DownloadTask`, User-Agent from `src/lib/buildUserAgent.ts`). It sets no `sessionType`, so on iOS the installed expo-file-system 58.0.13 runs it in a background `URLSession`, which can keep transferring after the app is suspended or killed (Android ignores the option; its transfer runs inside the app process). Reached only through the download controller's `start()` (`src/services/modelDownloadController.ts`, DC1), which the hub machine's `downloading` state calls when it holds no resume data (`runDownload` picks `start` or `resume` by `pauseState?.resumeData`). Every way into `downloading` that can start a transfer — `SELECT_MODEL`, the restore when the hub opens (`src/app/model-hub/_layout.tsx`), and the continuations of path 2 — passes the network check first (BL1). The one entry with no check is the restore of a transfer that is still running, which attaches and starts nothing (DC5). Step 2 adds no caller of `start()` or `resume()`: Cancel on R10g's warning calls `park()`, which saves the row and starts nothing, so the download waits for the hub (owner, 2026-11-27; #133 I7). | Hugging Face (`huggingface.co`, URLs in `src/catalog/modelManifest.ts`) and the file hosts it redirects to | The user. A download the app was killed during restarts by itself when the hub next opens, behind the network check (BL1). | Allowed | Blocked |
| 2 | Model download, resume | `resumeDownload` (`DownloadTask.fromSavable`), reached only through the download controller's `resume()` (DC1), which `downloading` calls when the machine holds resume data: after `RESUME` (`src/app/model-hub/download.tsx`), `APP_FOREGROUND` after a background pause (automatic), or `RETRY` from `failed` with a saved pause state, each behind the network check (BL1). On Android it first passes the sink guard (BL8). | Same as 1 | The user, or the app on return to the foreground (a download the user started), behind the network check (BL1) | Allowed | Blocked |
| 3 | Update check | `checkForAppUpdates` in `src/lib/updateCheck.ts` (`expo-updates` `checkForUpdateAsync`, then `fetchUpdateAsync`). Reached only from the Check button in `src/components/settings/UpdateCheckRow.tsx`. | Expo's update service (`u.expo.dev`). It receives the platform, runtime version, channel, current and embedded update IDs, and a random ID for this install (the `EAS-Client-ID` header, set by `expo-updates`' native downloader). | The user | Allowed | Blocked |
| 4 | Launch-time native update check | Off: `updates.checkAutomatically: 'NEVER'` in `app.config.ts`, asserted by `__tests__/appConfig.test.ts` and checked on every built artifact (VERSIONING.md train step 4). | — | Nothing | Never runs | Never runs |
| 5 | Tip jar (iOS, Android) | `openTipJar` in `src/lib/tipJarStore.ts` (`expo-iap` `initConnection`, `fetchProducts`, `getAvailablePurchases`, `requestPurchase`, `finishTransaction`, `endConnection`). Reached from Open and the tip buttons in `src/components/settings/TipJarSection.tsx`. Gated today by `canUseStorePurchases()` at the start and before `requestPurchase`. | Apple App Store or Google Play | The user | Allowed | Blocked (alert exists) |
| 6 | Support link (web build only) | `Linking.openURL(SUPPORT_PAYPAL_URL)` in `TipJarSection.tsx`. Already gated by `canOpenSupportLink()`. | PayPal | The user | Allowed | Blocked (alert exists) |
| 7 | Links inside notes | `react-native-markdown-display` 7.0.2: its default `link` and `blocklink` rules call `openUrl`. Today no renderer passes `onLinkPress`, so a tap calls `Linking.openURL(href)` at once, for any scheme: `http(s)`, `mailto:`, `tel:`, other apps' schemes, and the app's own `cur://` links (markdown-it 14.3.3 drops only `javascript:`, `vbscript:`, `file:` and non-image `data:` links). Note text renders through it in `src/components/journal/JournalPane.tsx`, `src/app/entry/[factId].tsx` and `src/components/graph/GraphNodeSheet.tsx`. PR #120 (`474c7ac` on `fix/no-remote-images`) routes all three through one wrapper, `src/components/NoteMarkdown.tsx`, which forces #118's `markdownRules`; its props leave out `rules` and `renderer`. Lint rules in `eslint.config.js` forbid value-importing the library anywhere else, including its subpaths, a dynamic `import()` and a `require()` (type imports, such as `markdownRules.tsx`'s `import type { RenderRules }`, are allowed). The wrapper passes every other prop through, `onLinkPress` included. That text is written by the model or an imported bundle, so the app can't tell a link you wrote from one it invented. | None: after the change, nothing opens. Share… hands the address to the OS share sheet, where the user chooses | The user (a tap shows a dialog and nothing more) | Nothing opens, any scheme. A dialog shows the full address with Share… and OK (owner, 2026-11-21; OQ-3 and OQ-8 superseded) | Nothing opens, any scheme. The same dialog, same copy (R6) |
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
`specs/2026-11-16-download-cellular-continuation/spec.md`; head
`38d30bf`) ships before Step 2 as its own PATCH, and PR #133 then
moves it onto the download controller without changing what the user
sees, except as DC3 and DC5 say. This section is the only place this
spec describes that behavior, as the code has it after #133. #125's
three fixes of 2026-11-27 (`0dcfb34`, `10abca7`, `38d30bf`) are not
in #133's code yet. #133 ports them before it merges, and BL1, BL3,
BL4 and BL7 describe them as ported. Step 2
keeps all of it, and its tests, except where a row of Step 2 machine
changes says otherwise: M6 (lifts BL11), M7 (a `paused` row with no
pause state is checked before it settles, so BL5's "a `paused` row
waits for Resume" gains the complete-file case; BL3's declined
restore saves such a row), M8 (BL1's not-verified
exits, in strict only), and M14 and M15 (in strict only, the machine
ignores a model pick, `RESUME`, and `RETRY` with a pause state).

- **BL1 — Every continuation passes the network check.** The restore
  after a kill (`RESTORE_DOWNLOAD` of a `downloading` row →
  `checkingExisting`, whose not-verified exits, `onDone` fallback and
  `onError`, both go to `confirmingNetwork`), the foreground resume
  (`paused` + `APP_FOREGROUND`, reason `background`; BL4 has the one
  that is not a continuation), a manual `RESUME`,
  and `RETRY` from `failed` with a pause state each set the
  `continuation` flag and go to `confirmingNetwork` (the state a fresh
  `SELECT_MODEL` also reaches): Wi-Fi → `downloading` with no prompt,
  cellular → `cellularConfirm`, offline → `awaitingWifi`. `downloading` resumes
  from the resume data if any, else starts over; the controller saves
  the row `downloading` with no pause state before the task exists, so
  a download killed in the foreground restores with none and starts
  from the start.
- **BL2 — One owner for the cellular prompt.** `CellularConfirm`
  (`src/components/model-hub/cellular-confirm.tsx`), rendered once by
  the hub layout, shows it on whichever hub screen is in front and
  closes it whenever the machine leaves `cellularConfirm`.
- **BL3 — A declined prompt.** `CELLULAR_CANCEL` on a continuation →
`pausing`, then `paused` (reason `restored`; no transfer exists, so
  the controller's `pause()` only saves), keeping the pause state
  and saving the row `paused` with it (none, for a declined restore of
  a download killed in the foreground); Resume runs the check again. On
  a fresh download → `selecting`, and the download screen dismisses.
  A fresh start is still a fresh download here after a background
  pause during its check (BL4).
- **BL4 — Backgrounding during the check or the prompt.**
  `APP_BACKGROUND` in `confirmingNetwork` pauses the hub (`paused`,
  reason `background`), for a fresh start as for a continuation, so a
  Wi-Fi answer that comes late never starts a download behind an app
  in the background. In `cellularConfirm` only a continuation pauses.
  A fresh start's prompt stays up, since nothing downloads until the
  user taps. No transfer is live in either state.
  - A continuation's pause goes through `pausing`, which keeps its
    pause state and saves the row `paused` with it.
  - A fresh start's pause saves nothing. It has no row, and a saved
    one would come back later as a paused download the user never
    had. How #133's machine reaches `paused` without that write is
    its port's to say; this spec relies only on the outcome.
  - The next `APP_FOREGROUND` runs the check again. It is a
    continuation when the download had a row, or was running when it
    paused, and a fresh start otherwise. So a fresh start's declined
    prompt still goes to `selecting` (BL3).
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
    model keeps its pause state. It is a continuation when it holds a
    pause state, and also when the kept download already was one (a
    restored row with no pause state, left through `LEAVE_WAITING`).
    So it resumes, or starts over, behind the check, and a declined
    prompt keeps it paused (BL3).
  - A custom import (`src/app/model-hub/import.tsx`) reads the row's
    model (`readDownloadRow()`, which returns the model and the status); its sweep
    before the copy keeps that model's file (an unreadable row skips
    the sweep). On success it clears the row before committing the
    model's identity (`setModelPath`, `setModelId`), then sweeps with
    no model kept, removing the abandoned partial; the machine clears
    the row again on `IMPORT_SMOKE_OK`. A failed copy or smoke test
    leaves the row and its model file intact.
  - **Accepted limitation:** if `setModelPath` or `setModelId` throws
    after the row clear, the import ends `IMPORT_FAILED` with the row
    cleared; the kept file is a harmless orphan, and a same-session re-pick of
    the old model starts over (#133 D6).
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
  row is `paused` and only then (a `failed` row is never restored, so
  the hub's sweep does not spare it; the strict sweep may, R8); an
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

Known gap, pre-existing and out of scope here (filed from PR #125's
review):
[#126](https://github.com/equationalapplications/curated-journal/issues/126),
a Wi-Fi drop after the check falls back to cellular silently (fresh
downloads too), and an Ethernet connection counts as offline. The
Standard copy's "asks first if you're on cellular data" is true when
each continuation starts; #126 is about a network change after that,
and a hub that attaches to a transfer still running (DC5) starts no
continuation.
[#127](https://github.com/equationalapplications/curated-journal/issues/127)
(a foreground return during a background pause could drop the resume
data) and #132 are closed by #133 (DC3).

**What PR #133 adds, which Step 2 calls and does not re-specify.**
PR #133 (spec `specs/2026-11-21-model-download-controller/spec.md`,
status Implemented, 9.3.0) merges before this PR. Its spec is the
authority for everything in this list; an H, I, D, T or OQ id below is
that spec's.

- **DC1 — One owner.** `src/services/modelDownloadController.ts`, a
  process-wide singleton (`getModelDownloadController()`), plain
  TypeScript, so closing the hub does not stop it. It is the only code
  that creates a `DownloadTask` (through `startDownload` and
  `resumeDownload` in `modelDownloadService.ts`) and the only code
  that writes the saved download row.
  `__tests__/downloadOwnership.test.ts` (T-own) fails if anything else
  does. Its operations run one at a time on one queue.
- **DC2 — The calls this spec makes.** `load()`, `snapshot()`,
  `readRow()`, `start(modelId)`, `resume(modelId)`, `pause(modelId)`,
  `park(modelId)`, `abandon()`, `stopForStrict()`,
  `releaseStrictStop()`, and the construction input `gate`. What each
  guarantees is #133's "Public API" table.
- **DC3 — Pausing is a state of its own.** `PAUSE` and
  `APP_BACKGROUND` go to `pausing`, which waits for the controller's
  `pause()`. From there `paused`, with its Resume button, is entered
  only once the pause has settled. The entries to `paused` that skip
  `pausing` have no pause to wait for: the restore of a row that is
  already `paused` (H10), and a strict stop that reaches a hub in a
  network state (H15). A pause that fails cancels the transfer and
  ends in `failed` with "Could not pause the download. Try again."; a
  download that completes during the pause goes on to `verifying`.
  The `pausing` screen shows "Pausing…" and no buttons. `idlePause` is
  gone: a pause with no transfer also goes through `pausing`, where
  `pause()` only saves the row `paused` (H2–H5, D2–D4; closes #127 and
  #132).
- **DC4 — At rest, nothing is in flight** (I2). A transfer can exist
  only while the hub is in `downloading` or `pausing`, or while no hub
  is mounted. I2 names one more case and calls it unreachable: `failed`
  after a `start()` or `resume()` rejected with `TransferInFlightError`
  (a transfer for another model is live; picking a different model
  abandons first). Step 2 adds no way into it, because it starts no
  transfer anywhere. If it ever occurred, R8 step 1 would stop that
  transfer like any other. I2's converse, that no transfer appears
  behind a hub at rest, rests on I7. Step 2 keeps it the simple way:
  nothing it adds calls `start()` or `resume()`. R10g's Cancel calls
  `park()`, which starts nothing (owner, 2026-11-27).
- **DC5 — Reopening the hub attaches** (owner, #133 OQ-1). When the
  hub opens and the controller holds a running transfer, the layout
  restores with `live: true`, and the hub goes to `downloading` and
  attaches to it: no pause, no network check, no second transfer
  (H9). When the transfer finished while the hub was closed, the
  layout restores with `finished: true` and the hub goes to the file
  check (H9b). An attach that finds the transfer gone goes to the
  network check (`NOT_LIVE`).
- **DC6 — The strict hooks, built and not yet called.**
  `stopForStrict()` stops a running transfer (the row is saved `paused`
  before the pause, then again with the pause state), reports
  `nothing-running`, `kept`, `not-keepable` or `completed`, each with
  `rowSaved`, and never rejects. It also sets a latch,
  `stoppedForStrict`: until `releaseStrictStop()`, `start()` and
  `resume()` return `refused`. The optional `gate` makes them return
  `refused` too, before any write or state change. The hub maps
  `refused` to `REFUSED` (`downloading` → `pausing`, reason `strict`),
  and hears a stop as `TRANSFER_STOPPED` through one subscription that
  lasts as long as the machine (H1, H3, H5, H13, H15). Nothing in #133
  calls `stopForStrict()` or supplies a `gate`; Step 2 does (R4, R8).
- **DC7 — A failed row write never moves the hub** (D1). The result
  carries `rowSaved: false`, and the controller writes the row again
  before its next write and on the next `load()`.
- **DC8 — Names that changed.** `ModelHubApi.downloads` (the
  controller) replaces `startDownload`, `resumeDownload`,
  `pauseDownload`, `persistDownloadState`, `clearDownloadState` and
  `readDownloadModelId`. The hub context value has `abandonDownload()`
  and `readDownloadRow()`. The service has no `activeTask`,
  `pauseDownload` or `cancelActiveDownload`.

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
  (BL9, now `readDownloadRow()`, DC8).

A machine-state test alone cannot catch a prompt that never renders,
so the screen and layout tests matter as much as the machine block.
#133 already moved these suites' mocks to the controller, with the
assertion changes its D1, D4 and D6 list. Step 2 changes none of them
further; it only seeds the mode (Verification, Seeding).
**One existing test does change.** It is in neither keep-green list:
`__tests__/modelHubMachine.test.ts`,
`describe('restore, pause and resume (B1, B2, B6)')`, "restored pause
with no pause state stays paused until RESUME starts fresh" (B2 of
`specs/2026-11-12-ios-model-memory/spec.md`, which R10j extends). It
restores a `paused` row with no pause state while `verifyDownload`
returns true, and expects `paused`. Under M7 that restore goes on to
the smoke test. Step 2 rewrites it as M7's two cases (M7's Test
column). No other existing test sends the machine a `paused` restore
with no pause state (checked 2026-11-27, in #133's suites and in the
tests #125 added that day).
**#133's tests, kept green by Step 2, unchanged in what they assert:**
`__tests__/modelDownloadController.test.ts` and
`modelDownloadControllerHeld.test.ts` (T-C1 to T-C23 and their
regressions), `modelHubController.test.ts` (T-H1 to T-H9b, T-H11),
`modelHubGraph.test.ts` (T-H7), `downloadOwnership.test.ts` (T-own),
`modelHubPausingScreens.test.tsx` (T-S1, T-S2),
`modelHubLayoutLoadError.test.tsx` (T-S3) and
`modelHubLayoutRestore.test.tsx` (H9, H9b). T-H7 closes four lists:
the edges into `downloading`, the edges out of it, the edges out of
`pausing`, and the states that handle `TRANSFER_STOPPED`. Step 2 adds
to none of them. It does add two edges into `pausing` (M8), which no
T-H7 list closes and which #133 prescribes (Step 2 machine changes).

## Step 2 machine changes

Every hub-machine event, state, flag or signal that Step 2 adds or
changes in `src/machines/modelHubMachine.ts` and its provider
(`src/hooks/useModelHub.tsx`), on top of #133's machine (DC3–DC6).
The plan may rename events and flags; it may not change a row's source
states, target or effects. Every test named here runs in
`__tests__/modelHubMachine.test.ts` unless the row says otherwise, and
every test that ends in a strict pause asserts `pausedReason: 'strict'`
explicitly.

**At rest, nothing is in flight.** The states at rest are `selecting`,
`paused`, `failed` and `smokeFailed` (R7). None of them holds a live
transfer: that is #133's invariant (DC4), not a rule of this spec. So
R8 step 1, run from the hub, finds nothing to stop. It still calls
`stopForStrict()`, which sets the latch (R8).

**There is no strict event.** The hub never tells the machine that
strict privacy turned on. R8 step 1 calls `stopForStrict()`, and
whatever the controller holds reaches the machine as `TRANSFER_STOPPED`
through #133's subscription (DC6). From the hub at rest:

- `paused`: the controller holds a paused record, so the event arrives
  and relabels the pause (M1);
- `selecting`, `failed` or `smokeFailed`: these states do not handle
  the event, so the state stays as it is.

Nothing else reaches the machine. From a hub at rest step 1 stops
nothing, so R10g's warning never shows there, and no download
row is removed under a mounted hub (R10g).

Step 2 leaves #133's T-H7 lists as they are. It adds no edge into
`downloading`, none out of `downloading`, none out of `pausing`, and
no new `TRANSFER_STOPPED` handler, and `pausing` still invokes only
the pause. What it does add to the graph:

- two edges **into** `pausing`, from `checkingExisting`'s two
  not-verified exits in strict (M8). No T-H7 list closes the edges
  into `pausing`, and #133 prescribes this target: "M4a and M8 target
  `pausing` with reason `strict`, as `REFUSED` and H4 do" (#133, "How
  #117 shrinks"). M4a's own edge, `REFUSED`, is #133's;
- M7's check state, entered from `selecting`, with exits to
  `smokeTest` and `paused`;
- edges to `selecting` from `paused` (M6) and from `failed` (M11);
- guarded branches with no target, on `selecting` (M14) and on
  `paused` and `failed` (M15).

| Row | Event or signal | Source states | Target | Context effects | Row write | Copy shown | Test |
|---|---|---|---|---|---|---|---|
| M1 | `TRANSFER_STOPPED`, reason `strict`, emitted by R8 step 1's `stopForStrict()` on a held `paused` record. **Built by #133 (H5)**; Step 2 adds the caller and this test | `paused`, any reason | stays `paused` | `pausedReason: 'strict'`; `pauseState` ← the event's | none | the label from the mode (R10e) | From `paused` with reason `user`, and again with reason `restored` (the pauses a user can turn strict on from), Turn on from the hub: `stopForStrict()` returns `kept`, the reason becomes `strict`, and there is no `pauseAsync` and no `DownloadTask`. The same from reason `background`, where a later `APP_FOREGROUND` stays in `paused` and never reaches `confirmingNetwork`. That seed is synthetic: the machine holds a `background` pause only while the app is in the background, where nobody can tap Turn on. It is kept because it is the one case where a missed relabel would resume by itself |
| M4a | `REFUSED`: `start()` or `resume()` returned `refused`, from the `gate` Step 2 supplies (R4) or from the latch. **Built by #133 (H1, H3; T-H11)**; Step 2 adds the gate and this test | `downloading` | `pausing`, then `paused` on the result of `pause()` | `pausedReason: 'strict'`; `pauseState` ← the pause result's | by `pause(modelId)`: none on a held `paused` record; `paused` with the held pause state (null is fine) when the record holds no transfer and is not paused. Never `downloading`: a refusal comes before any write | the label from the mode: "Paused — strict privacy is on" in strict, "Paused" in Standard; never "Check your connection" | With the exported gate adapter (R4) passed to the test's own controller (`makeHubApi({ gate })`, an override the helper already takes) and the mode strict: a refused start and a refused resume end `paused`, reason `strict`, with no `DownloadTask` and no `downloading` row write; after stepping out, an `APP_FOREGROUND` starts nothing, and Resume, through the network check, starts the download |
| M6 | `LEAVE_PAUSED` ("Choose another model") | `paused` | `selecting` | none, like `LEAVE_WAITING`: `modelId` and `pauseState` kept | none: the row is kept ("not now"), and the controller's record stays paused | "Choose another model" on the download screen in `paused`; the screen dismisses to the list (BL6) | (a) In `pausing` the exit is not shown, and a `LEAVE_PAUSED` sent anyway is ignored (DC3); it shows and works in `paused`. (b) The focus-effect test (Verification) |
| M7 | `RESTORE_DOWNLOAD` of a `paused` row with `pauseState: null` (R10j), guarded after #133's `finished` and `live` branches (DC5) and ahead of the existing `paused` restore branch | `selecting` | a new check state (the plan names it; R7 hides the control in it) running `verifyTask` and nothing else. It does not run `checkingExisting`'s orphan sweep: a `paused` restore runs none today (H10), and this check only reads the file's size. By the result: verified → `smokeTest`; not verified (`onDone`) or the check threw (`onError`) → `paused`. Never `confirmingNetwork` | `modelId` ← the event's; `pauseState: null`; `pausedReason: 'restored'`; `error: null` | none: the row stays `paused`, and the controller already holds a paused record from `load()` | While the check runs, what the download screen shows in `checkingExisting`: the "Setting up your AI" title, no progress bar and no buttons (the plan leaves the state out of `download.tsx`'s `downloadPhase` list, as `checkingExisting` is). Then, in `paused`, "This download will start over when you resume." (R10e) | Complete file: reaches `smokeTest`, no `DownloadTask`; incomplete, or the check throws: `paused`, no `checkNetwork`, no `DownloadTask` until Resume, which starts fresh. A `paused` row with resume data keeps today's restore. These cases replace the existing test "restored pause with no pause state stays paused until RESUME starts fresh" (Baseline, "One existing test does change"): the incomplete-file case keeps that test's assertions, with `verifyDownload` returning false for the restore check. In the download-screen tests: in the check state the screen shows the "Setting up your AI" title and no Resume button |
| M8 | R10f's strict branch: `checkingExisting`'s not-verified exits (`onDone` fallback and `onError`) while the injected strict guard (R12) says strict | `checkingExisting` | `pausing` (in place of `confirmingNetwork`), then `paused` on the result of `pause()` | `pausedReason: 'strict'`; `pauseState` ← the pause result's (null for a download killed in the foreground) | by `pause(modelId)`: the row is rewritten `paused` with that pause state | "Paused — strict privacy is on", and "will start over" when there is no resume data | A `downloading` row restored in strict, from both exits: reason `strict`; no `checkNetwork`, no `getNetworkStateAsync`, no `start()` or `resume()`, no `DownloadTask`; the row is `paused`; after stepping out, reopening shows it paused |
| M10 | Restore-pending signal: the provider's `restore` prop is set and its `RESTORE_DOWNLOAD` has not yet been sent | provider, not machine | — | — | — | hides the R7 control | the R7 control test, restore-pending case |
| M11 | `LEAVE_FAILED` ("Choose another model") | `failed` | `selecting` | `modelId` and `pauseState` kept; `error: null`, so the list shows no stale failure banner | none: the row is kept | "Choose another model" on the download screen in `failed`, in any mode; the screen dismisses to the list (BL6) | In strict, from `failed` with a pause state (its Retry is blocked, R5): the exit reaches the list, "Import custom .gguf" is reachable, and the row is unchanged |
| M13 | The provider exposes `pauseState` on `ModelHubContextValue` | provider | — | — | — | the download screen reads it for R10e's "will start over" line | the screen tests in Verification |
| M14 | `SELECT_MODEL` while the injected strict guard (R12) says strict. A backstop: the list refuses the tap before it sends anything (R12), and this row holds whatever sent the event | `selecting` | stays `selecting`: a guarded branch ahead of the two existing ones, with no target and no actions | none: `modelId`, `pauseState`, `continuation` and `error` are unchanged | none: no `abandon()`, so a kept download's row survives | none from the machine; the list shows the downloads-off alert (R5) | With the guard strict, a model installed and a kept `modelId` for another model: a `SELECT_MODEL` sent straight to the actor leaves it in `selecting`; `retireCurrentModel`, `abandon()`, `verifyDownload` and `checkNetwork` are never called, and the row is unchanged. With the guard not strict, or absent, `SELECT_MODEL` behaves as today |
| M15 | `RESUME`, and `RETRY` when the context holds a pause state, while the injected strict guard (R12) says strict. A backstop, like M14: the download screen refuses both taps before it sends anything (R5) | `paused` (`RESUME`); `failed` (`RETRY`) | stays where it is: a guarded branch with no target and no actions, ahead of the branch that goes to `confirmingNetwork`. `RETRY`'s other two branches are unchanged (disk-full, and no pause state, both to `selecting`) | none | none | none from the machine; the screen shows the downloads-off alert (R5) | With the guard strict: a `RESUME` sent straight to the actor in `paused` leaves it `paused` with its reason, and a `RETRY` in `failed` with a pause state leaves it `failed`; `checkNetwork`, `start()` and `resume()` are never called. `RETRY` with no pause state still reaches `selecting`. With the guard not strict, or absent, both behave as today |

Notes on the table:

- **Rows #133 retired** (its "How #117 shrinks"). M0: a failed pause
  cancels the transfer (DC3). M2, M4b and M12: one `TRANSFER_STOPPED`
  event replaces the strict event, the stopped error and `pauseTask`'s
  strict branch (DC6). M5: `failed` never holds a transfer, so there
  is nothing to restart from the hub (DC4; R10g). M9: `paused` is
  always settled (DC3), so M6, M13 and the R7 control need no settle
  flag. One more row is gone, for a different reason. M3 was a
  "download removed" event that the hub sent itself after R10g's
  cleanup. The owner's rulings of 2026-11-27 left it nothing to do:
  no download row is removed under a mounted hub (R10g).
- **Why M4a and M8 go through `pausing`.** A pause that has to write
  the row goes through `pausing`: `pause()` is the call that saves the
  row `paused`, and `paused` follows only once it has settled (DC3).
  Both rows need that write. The entries to `paused` that skip
  `pausing` write nothing and have no pause to wait for: H10's restore
  and M7's find the row already `paused`, and H15 makes no controller
  call. Neither row is a `park()`, which would save
  `downloading`. If the controller holds an ended transfer that the
  hub has not yet acknowledged (a `completed` or `failed` record),
  `pause()` reports it and the hub goes to `verifying` or `failed`, as
  #133's H3 and D7 say. A refusal for a model other than the one the
  controller holds would end in `failed` (`pause()` rejects for the
  wrong model); R12 refuses a catalog pick in strict before
  `SELECT_MODEL`, and M14 ignores one that is sent anyway, so no such
  start is asked for.
- **What the machine never does for strict.** It never pauses for
  strict on its own and never starts a transfer for it. From Settings
  it never runs: Settings is not interactive while the hub is mounted,
  the hub's actor stops when the hub closes, and no hub loads while a
  switch runs (R8, "While a switch runs"). The controller is what
  stops a transfer (R10a).
- **The strict guard (M8, M14, M15).** It is one optional function on
  `ModelHubApi` (the plan names it). `createModelHubApi` always
  supplies it, and it answers from `canDownloadModels()` (R4), so
  before the mode has loaded it says strict (R3). A hub API built
  without one reads as not strict. That is what #133's and #125's
  suites build (`makeHubApi` in `__tests__/helpers/hubApi.ts`, and
  `build()` in `modelHubController.test.ts`), so neither file changes;
  a Step 2 test passes the guard as a `makeHubApi` override. A missing
  guard can never start a transfer, because the controller's `gate`
  still refuses (M4a). It would only lose M8's rewrite and the two
  backstops (M14, M15), so a test pins that `createModelHubApi`
  supplies it (Verification).
- **`failed`:** no strict event reaches it; `failed` stays as it is,
  its Retry with a pause state is blocked in strict (R5; M15 in the
  machine), and M11 is the way to the list.
- **Nothing in strict reaches the network check.** A restore is M7 or
  M8, a model pick is M14, and `RESUME` and `RETRY` are M15. A strict
  stop takes a hub that is already in a network state to `paused`
  (#133 H15). One continuation has no guard: `APP_FOREGROUND` in
  `paused`, which needs reason `background`. No pause holds that
  reason while strict is on. The mode cannot change while the app is
  in the background, Turn on relabels the pause (M1), and a pause
  made under strict has reason `strict` or `restored`. If the check
  ever ran anyway, it would ask only the OS, and the controller's
  `gate` would refuse the start (M4a).

## The two modes, as the user reads them

### Names

- **Strict privacy.** This is the charter's name.
- **Standard.** The default mode's on-screen name (owner, OQ-1). In
  code the mode stays `'default'`.
- **Connected (future, informational; owner ruling 2026-11-21).** The
  ladder is Strict ⊂ Standard ⊂ Connected. Connected is the name for
  the less-strict tier(s) of ROADMAP Step 3 (the mode ladder; sync is
  Steps 4–5), and takes the name sibling app Curated Thoughts uses for
  its sync tier. Naming it does not close ROADMAP's "Shape of the sync
  mode" open decision, which stays with the owner. Curated Thoughts'
  "Ephemeral" (hosted AI generation) is not adopted: Curated Journal
  never calls a hosted AI (INTENT rule 2). A future Connected spec may add opening
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
- A read that succeeds and finds no stored value is not a failure. It
  means the user has never chosen, so the mode is Standard (R1).
  Nothing is written until the user chooses.
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
- A status accessor, also synchronous (the plan names it, for example
  `getPrivacyModeStatus()`). The mode alone cannot tell a strict mode
  that is saved from one that is not, and R3 and R7 need to. It
  returns one of:
  - `loading`: the saved mode has not been read yet. No screen renders
    in this state (R3);
  - `saved`: the store agrees with the mode in memory. A store with no
    value agrees with Standard (R3);
  - `unsaved`: strict is on in memory, and its save failed (R8
    step 3);
  - `read-failed`: strict is on because the read failed, or because
    the stored value is not one this version knows (R3).

  A save that succeeds sets `saved`. A save that fails leaves
  `read-failed` as it is, and R9's failed save leaves the status as it
  was. R3's two read-failure messages show while the status is
  `read-failed`, and R7's not-saved line shows while it is `unsaved`.
  R7's tap on the selected Strict privacy choice saves
  again while it is `unsaved` or `read-failed`, and starts nothing
  while it is `saved`. The hub notice's Save strict privacy button
  shows only in those two statuses (R7).
- A load function, called once by the bootstrap and memoized for the
  life of the process: a second call returns the already-loaded mode
  instead of re-reading the store. The root layout's bootstrap can
  re-run (through `ModelHubCompletionProvider`'s `onComplete`), and a
  re-run that re-read the store after a failed R8 step 3 save would
  silently flip strict back to Standard. Memoization prevents that.
- A set function that saves the mode and applies the ordering in R8
  (steps 2 and 3) and R9. It does not call the download controller:
  R8 step 1, R8's `finally` and R9's backstop belong to the switch
  flow that calls it (the plan names that flow), so this module never
  imports the controller, which imports its gate from here. It runs
  one call at a time, in call order: a second call waits for the first
  call's save to settle before it applies or saves anything. So two
  saves never overlap, and the saved mode always ends as the last
  call's. The switch flow is single-flight as well (R8, "One switch at
  a time").
- A subscription, so open sessions can react when the mode changes
  (R8). It also fires when the status changes and the mode does not
  (`unsaved` or `read-failed` to `saved`, and to `unsaved` when
  step 3's save fails), so a read-failure message or a not-saved line
  on screen shows and clears with it. A subscriber that throws is
  caught and logged: the other subscribers still hear the change, and
  the set function goes on (R8, "When a step throws").
- One gate per kind of path: `canUseStorePurchases()` (path 5, exists),
  `canOpenSupportLink()` (path 6, exists), `canDownloadModels()` (paths
  1 and 2), and `canCheckForUpdates()` (path 3). Path 7 needs no gate: no mode
  opens a note's link, so the dialog in R6 needs no mode check at all.
- No error type. A refused download is the controller's `refused`
  result and a stopped one is its `TRANSFER_STOPPED` event (DC6), so
  the hub machine imports nothing from this module.

Each module that can reach the network also asks its gate itself, at
the point where it acts, the way `openTipJar` already does:

- `modelDownloadController.ts`: the singleton getter
  (`getModelDownloadController()`) passes the controller's `gate`
  input. This is the one edit Step 2 makes to #133's module, and
  #133's spec leaves it for this one: its getter builds the
  controller with "no gate", and "nothing supplies one until #117
  does (a strict-mode gate, Rule 11)" (#133, "Construction" and "The
  `gate` input"). The gate is a small adapter in the shape #133
  defines,
  `(modelId, op) => { allowed: true } | { allowed: false, reason }`.
  `privacyMode.ts` exports it (the plan names it, for example
  `strictDownloadGate`), written to that shape with no import from
  the controller. So the getter's edit is one import and one option,
  and a test can pass the same function to a controller it builds
  itself (Verification, "The gate").
  It ignores both arguments and answers from `canDownloadModels()`:
  `{ allowed: true }` when that is true, and otherwise
  `{ allowed: false, reason }` with one fixed reason string. The plan
  names the string; nothing reads it, because the hub maps every
  refusal the same way. `start()` and `resume()` ask it after the
  latch check and before any write, state change or task, and return
  `refused` (DC6); the hub maps that to a pause (M4a).
  `modelDownloadService.ts` asks no gate of its own: only the
  controller can call its `startDownload` and `resumeDownload`
  (T-own), and a throw from them would read as a failed download. No
  other operation is gated, because none of them starts a transfer:
  `attach()`, `pause()`, `park()`, `abandon()`, `record()`, `load()`,
  `readRow()`, `snapshot()`, `subscribe()`, `stopForStrict()` and
  `releaseStrictStop()`.
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
7 by the link dialog in R6, 8 by #118). A blocked tap on paths 1, 2, 3, 5 and 6
shows an alert that explains why and how to step out. The path 7 dialog
(R6) says no mode opens links and offers no step-out. Neither makes a
silent network call. Every alert and the dialog end "Nothing was
sent."

| Tap | Title | Message |
|---|---|---|
| A model in the hub list, Resume, Retry on a failed download that has a pause state, and (defensively) Try again (`CHECK_NETWORK`) and Download over cellular (`CELLULAR_CONFIRM`) | Downloads are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, and models download from the internet. To get a model, step out of strict privacy, download it, then step back in. Nothing was sent. |
| The same taps, **on iOS only** | Downloads are off in strict privacy | The message above, with this before "Nothing was sent.": "A download an older version of this app started may still be finishing on its own. The app itself sends nothing." It shows in every strict downloads-off alert on iOS, because the app can't tell whether such a download exists or has finished (R3). |
| Check (app updates) | Update checks are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, so it can't check for updates. To check, step out of strict privacy in Settings → Privacy, check, then step back in. Nothing was sent. |
| Open or a tip (tip jar) | Tips are off in strict privacy | The existing copy (`STRICT_PRIVACY_TIP_MESSAGE`), changed to say "step out of strict privacy in Settings → Privacy". |
| Support (web) | Tips are off in strict privacy | The existing `STRICT_PRIVACY_LINK_MESSAGE`, with the same Settings → Privacy change. |
| A link in a note, any scheme (one dialog, one copy, in both modes; R6) | Links don't open from notes | Curated Journal doesn't open links from your notes, in any mode. You can share or copy this address and open it yourself: `<full href>`. Nothing was sent. Buttons: **Share…** and **OK**. |
| The same tap, empty href (`[x]()`) | Links don't open from notes | Curated Journal doesn't open links from your notes, in any mode. This link has no address. Nothing was sent. Button: **OK** only. |
| The same tap, web build where `navigator.share` is undefined | Links don't open from notes | Curated Journal doesn't open links from your notes, in any mode. You can copy this address and open it yourself: `<full href>`. Nothing was sent. Button: **OK** only. |

"Try again" on a failed smoke test (`smokeFailed`'s `RETRY` →
`verifying`) is not blocked: it runs on the device and keeps working in
strict (R10h). "Try again" while waiting for Wi-Fi and "Download over
cellular" should never show in strict: nothing a strict hub's restore
or its screens send reaches the network check (Step 2 machine
changes, "Nothing in strict reaches the network check"; M7, M8, M14,
M15). They are in the table so that, if either is
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
  superseding OQ-3 and OQ-8). Note text is written by the model or an
  imported bundle, so the app can't tell a link you wrote from one it
  invented, and opening its links would be the riskiest traffic. A tap
  on any link in a note, for any scheme
  (`https`, `http`, `mailto:`, `tel:`, other apps' schemes, the app's
  own `cur://` links, no scheme), opens nothing and never calls
  `Linking.openURL`. It shows a dialog with the link's full address and
  two buttons, **Share…** and **OK**. One copy, in Standard and in
  strict:

  > **Links don't open from notes**
  > Curated Journal doesn't open links from your notes, in any mode. You
  > can share or copy this address and open it yourself: `<full href>`.
  > Nothing was sent.

  The "unqualified, with no iOS caveat" rule (owner, 2026-11-21)
  applies to the strict-privacy mode description (the copy under
  Settings → Privacy), not to this dialog or to the R5 alerts.
- **The dialog** is `useConfirmSheet` (`src/components/ui/confirm-sheet.tsx`):
  the app's themed, web-safe stand-in for `Alert.alert` (convention:
  the `confirm-sheet.tsx` header and
  `docs/superpowers/specs/2026-11-02-tip-jar.md`); its dialog shape is
  Curated Thoughts' `docs/design/DESIGN.md` §1.6, Dialog. It is rendered by `NoteMarkdown` through its
  `confirmElement`. `Alert.alert` is a no-op on react-native-web, so it
  is not used. **OK** is the `cancel`-style button, so a scrim tap or a
  back press counts as OK. The address is shown in full and is
  selectable (the hook's message text is not selectable on main, so
  Step 2 adds an optional `selectable` flag to the `confirm()`
  options (`Options`, beside `message`); JS only). On iOS, selectable text copies the whole
  message, and Share… covers Copy. Button order: **Share…** first,
  **OK** last, so OK is the primary button (the hook gives the last
  button the primary variant). Inside `GraphNodeSheet`, the dialog
  presents above that sheet, and OK returns to it. Two variants (an empty href wins on every platform) hide
  Share… and show **OK** only: an empty href (`[x]()`) shows "Curated
  Journal doesn't open links from your notes, in any mode. This link
  has no address. Nothing was sent."; and on web without
  `navigator.share`, "Curated Journal doesn't open links from your
  notes, in any mode. You can copy this address and open it yourself:
  `<full href>`. Nothing was sent."
- **Share… keeps the dialog open; the share sheet presents above it;
  OK closes the dialog.** On main, `run` calls `onClose()` before
  `onPress`, so Share… would close the dialog first. Step 2 adds a
  JS-only `keepOpen` flag to `ConfirmButton` (per button):
  a button with `keepOpen` skips `onClose()`. Presenting a share sheet
  while a Modal is closing is a known react-native failure (likely,
  not device-verified), which is why the dialog stays open.
- **Share…** calls exactly `Share.share({ message: href })`, react-native
  core. It never passes `url`, so the sheet gets a plain string and
  fetches no link preview. The OS share sheet offers Copy. A rejection
  is caught and ignored, and nothing is shown. On web, Share… is hidden
  when `navigator.share` is undefined. It is not `expo-clipboard`, which
  is not installed: adding a native dependency would be a MAJOR change
  plus the 14-day age gate. The share sheet counts as the user sending
  something where they choose. Rule 11's exception names files; this
  spec reads it as covering a text hand-off (a link address), per the
  owner ruling of 2026-11-21 (INTENT check item 7). So Share… stays
  available in strict.
- Every note link goes through one decision point: a shared
  `onLinkPress` that `src/components/NoteMarkdown.tsx` sets itself,
  after the props spread. Its props leave `onLinkPress` out, as they
  already leave out `rules` and `renderer` (PR #120), so no caller can
  replace it. It shows the dialog, and `NoteMarkdown` does not read the
  mode. It never returns `true`, which would make the library call
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
  on/off switch, because Step 3 adds more modes. A tap on the choice
  that is already selected starts no switch, with one exception:
  while strict privacy is on but not saved (after R3's read failure,
  or after a failed save in R8 step 3: R4's status is `read-failed`
  or `unsaved`), a tap on Strict privacy saves it again and does
  nothing else (R8, "When a save fails"). While the status is
  `unsaved`, the section shows a line under the Strict privacy
  choice, for as long as that status lasts: "Strict privacy is on,
  but Curated Journal couldn't save the setting, so it may be off the
  next time the app starts. Tap Strict privacy to save it." Without
  the line, step 3's message would be the only notice, shown once,
  and a later launch would start in Standard with nothing on screen
  having said so since. R3's message does the same job while the
  status is `read-failed`.
- In strict privacy, the model hub (`src/app/model-hub/index.tsx`)
  shows a "Strict privacy is on" notice with a **Step out of strict
  privacy** button. It is one notice, and its body is R11's with no
  model installed and R12's with one. That button opens the same
  confirmation as R9. This
  is required because with no model installed, Settings cannot be
  reached: `src/app/(tabs)/_layout.tsx` sends the user to the hub
  instead. For the same reason the notice is where an unsaved setting
  shows when no model is installed. While R4's status is `unsaved`
  or `read-failed`, R11's body starts with a sentence that says so:
  the not-saved sentence ("Strict privacy is on, but Curated Journal
  couldn't save the setting, so it may be off the next time the app
  starts.") or R3's read-failure sentence. The notice then also has
  a **Save strict privacy** button. It does what a tap on the
  selected choice does in Settings: it saves `'strict'` again and
  does nothing else, as a switch like any other (R8, "When a save
  fails"). When a save succeeds, the sentence and the button go.
  With a model installed, Settings → Privacy is where both show.
- In Standard, the model hub shows the symmetric control: a **Turn on
  strict privacy** button, which opens R8's confirmation. Without it, a
  Standard user with no model installed cannot reach strict privacy at
  all, because Settings redirects to the hub.
- **Only at rest.** The control is shown, and active, only while the
hub machine is at rest: `selecting` (on the list), and `paused`
(any reason; no pause is still running once the hub is in it, DC3),
`failed` or `smokeFailed` (on the download screen). It is never
shown while a restore is pending (M10). A tap on it asks the machine,
not the screen: the provider reads its actor's state at the tap, and
starts no switch unless that state is at rest and no restore is
pending. A control on screen can be one render behind the machine.
It is hidden in every
other state: `checkingExisting`, M7's check state,
`confirmingNetwork`, `awaitingWifi`, `cellularConfirm`,
`downloading`, `pausing`, `verifying`, `smokeTest`,
`retiringCurrent`, `customImport` and `complete`.
- At rest, nothing is in flight (DC4; Step 2 machine changes). R8
step 1 still calls `stopForStrict()`, from the hub as from
Settings.
- To get to rest, the user taps Pause mid-download and waits for
"Pausing…" to finish, "Choose another model" while waiting for
Wi-Fi (BL5), or Cancel on the cellular prompt (BL3). At rest, R8's
confirmation cannot race the machine, and no sheet can stack on
the cellular prompt. The hub stays at rest for the whole switch:
while one runs, its screens send the machine nothing (R8, "While a
switch runs"). What Turn on then does is R8's step 1; the machine
hears of it only as Step 2 machine changes says.
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

**No pre-check** (owner, 2026-11-27). The confirmation shows at the
tap, whatever opened it: Settings, or the hub's control in any
at-rest state (R7). Nothing is read first. A download that is not
running at Turn on is never warned about, whatever its saved row
says. A `paused` row stays as it is (R10e, R10j). A `downloading` row
with nothing running was already going to start over, or to be
checked, the next time the hub opened, in Standard too. That row is
left alone, and a hub opened under strict shows it paused (R10f), or
takes a finished file on to the smoke test (R10h). What such a
download left on disk and cannot use again goes in the strict sweep
(below). Only a transfer that is live at Turn on can bring R10g's
warning.

**One switch at a time.** A switch starts at the tap that opens R8's
or R9's confirmation. It ends in one of two ways:

- R8's or R9's own confirmation is cancelled or dismissed. Nothing
  has been asked for by then, so the switch ends at that tap.
- The flow's last step has finished: R8's `finally`, R9's backstop,
  and the last tap on a save-failure message ("When a save fails")
  included. Cancel on R10g's warning is of this kind. It does not
  end the switch at the tap: its `park()` runs inside R8's `try`,
  and the switch ends in the `finally`, after that call has returned
  (R10g).

While one runs, a tap on any control that starts a switch starts
nothing:
the two choices in Settings → Privacy, the hub's Turn on strict
privacy control, the hub notice's Save strict privacy button (R7),
and every Step out of strict privacy button. A second
call into the switch flow while one runs does nothing. Without this
rule, a second Turn on tapped during step 1's wait would have its
latch released by the first flow's `finally` (`releaseStrictStop()`
clears the latch at once), and R9's save could overlap step 3's.

**While a switch runs, the rest of the app waits.** This spec relies
on two things that are not true by themselves. No hub opens in the
middle of a switch, and R7's "at rest" means that a mounted hub
stays where it was until the switch ends. But
`useConfirmSheet` closes its sheet before a button's handler runs
(`run` in `confirm-sheet.tsx`), so the screen underneath would take
taps during step 1's wait. From Settings,
the user could open the hub (Change AI model). Its `load()` would
queue behind step 1 and restore the download as paused. R10g's Cancel
would then park the download, and its Turn on and remove would clear
the row, under a machine that still shows that download paused. In
the hub, a model picked before step 2 would retire the
installed model (the mode is still Standard then) before the latch
refused its download. So, for R8 and R9 alike:

- **One sheet, from the tap to the end.** The switch flow owns one
  modal sheet. It is on screen from the tap that starts the switch
  until the switch ends, with no gap between its contents: the
  confirmation, a waiting state (step 1), R10g's warning when there
  is one, a waiting state, and a save-failure message when there is
  one. The second waiting state covers Cancel's `park()` after the
  warning's Cancel. After Turn on and remove it covers the row clear,
  steps 2 and 3 and the strict sweep. With no warning, step 1's
  waiting state runs on through steps 2 and 3 and the sweep.
  - A waiting state cannot be dismissed: it has no buttons, and a
    scrim tap or the back button does nothing.
  - The confirmation and the warning keep their Cancel, and
    dismissing either still counts as Cancel. Cancel on the
    confirmation ends the switch and closes the sheet. Cancel on
    R10g's warning does not: the sheet goes to a waiting state while
    `park()` runs, and it closes when R8's `finally` has ended the
    switch.
  - The flow's buttons use `keepOpen` (R6), and the flow replaces the
    sheet's content instead of closing it. The hook as it stands
    remounts its sheet when the content changes, so the plan makes
    sure a content change leaves the sheet mounted.
  - The sheet is rendered in one place that no route change unmounts.
    The plan picks it; the root layout can hold it the way the hub
    layout holds the one cellular prompt (BL2). In the root layout
    that place is outside the subtree that depends on `isReady`:
    `src/app/_layout.tsx` renders the stack inside the journal's
    providers when the app is ready and bare when it is not, so the
    whole stack remounts when that flips, as it does when a model
    finishes installing. A screen can also go away while a switch is
    still running (a link from outside the app can change the
    route), and a sheet that the screen rendered would go with it.
  - When a switch starts from a button on another sheet (Step out of
    strict privacy on a hub alert), that sheet closes as this one
    opens. On iOS a modal presented while another closes is the
    failure R6 notes for the share sheet, so the plan orders the two,
    and an on-device check covers it.
  - What a waiting state says is the plan's (Open questions, 5).
- **The sheet is a screen asking first (R4). Two rules in state are
  the guarantee.**
  - *No hub loads under a switch.* The hub layout
    (`src/app/model-hub/_layout.tsx`) waits for a running switch to
    end before it calls `load()`, at the point where it already waits
    for `smokeTestSettled()`. With no switch running it does not wait
    at all (no extra `await`), so the layout's existing tests see the
    sequence they see today. A hub opened mid-switch (a tap that got
    past the sheet, or a `cur://` link from outside the app) shows the
    layout's spinner, mounts no machine, and then restores from the
    row as the switch left it. So from Settings no hub machine is
    mounted at any point of the switch, and step 1, Cancel's `park()`
    and the row clear of Turn on and remove never run under a hub
    that loaded in the middle (R10g; DC4). A hub that is already
    mounted never waits: its layout
    loaded before the switch began.
  - *A mounted hub is held.* While a switch runs, no tap on a hub
    screen sends the machine an event that can move it, and none
    changes the route: no `SELECT_MODEL`, `IMPORT_CUSTOM`, `RESUME`,
    `RETRY`, `CHOOSE_ANOTHER` or `LEAVE_…` event, no push, and no
    going back (the list's "← Settings" row calls
    `navigation.goBack()`, which would unmount the hub). A model pick
    that is already under way goes no further: Continue on the
    low-memory card does nothing, and no confirmation of the pick
    opens (R12). The plan picks where. The provider's `send` is the
    one path every screen event takes. The Import row also pushes a
    route, and the back row and the card act without `send`, so each
    of the three needs the hold itself. The hold is asked again
    after a wait. R10i's two confirmations read the saved row before
    they show (`readDownloadRow()`, a queued read), and R7's control
    stays active in `selecting` meanwhile, so a switch can start
    between the tap and the read's answer. When the read answers, the
    handler asks again whether a switch is running. If one is, it
    does nothing more: no confirmation opens, no `IMPORT_CUSTOM` is
    sent, and no route is pushed. If none is, a pick asks R12's
    refusal again, because the mode may have changed (R12, "A pick
    that outlasts a switch"). Two things still arrive, because no
    screen sends them: `TRANSFER_STOPPED` (M1), and the app-state
    events, which move no state at rest.
    A hub can still go away while a switch runs, when a link from
    outside the app changes the route. Its machine stops with it. The
    switch goes on the same: no step of it depends on whether a hub
    is mounted.
- **A switch always ends.** Every controller call the flow waits for
  is bounded by #133's bounds: step 1 (60 s of foreground time at
  worst), the `abandon()` of Turn on and remove, Cancel's `park()`,
  and the sweep's `load()`. Each of the last three is at most one
  retry of a pending row write and one store call of its own, 10 s
  each. The flow bounds three more waits itself, at 10 s each: the
  sweep's wait for `smokeTestSettled()`, and its `getModelPath()` and
  `getModelId()` (`expo-secure-store`). Those calls have no time limit
  of their own, and a hang would keep the sheet up, and the hub held,
  until the app is restarted. No answer in that time counts as a
  wait that did not end or a value that cannot be read, and the sweep
  deletes nothing ("The strict sweep", below).

  The size check and the file deletes are synchronous. The flow never
  waits for `releaseStrictStop()`: the latch clears as the call
  arrives, and only the call's result goes through the controller's
  queue (#133, "Public API"). So the flow does not await it, in R8's
  `finally` or in R9's backstop. A step that throws does not keep the
  sheet up either ("When a step throws", below). Two waits have
  no bound: the user's own time on a confirmation, a warning or a
  message, and the mode save, which is one `expo-secure-store` call.
  The app already depends on that store answering to leave its
  loading phase (R3).

On Turn on, in this order. R8's `try` encloses steps 1 to 6 (the strict sweep is step 6). It is one `try`, and its
`finally` calls `releaseStrictStop()` on **every** exit: success, a
warning the user cancels or dismisses, a failed save, a thrown error
("When a step throws", below, says where each throw leaves the app).

1. The app reads the controller's `snapshot()` and then calls
   `stopForStrict()` (R10a), **whatever opened the
   confirmation**. The snapshot is a synchronous read. A phase of
   `active` means a transfer is live at that moment, and R10g's
   warning can show in that case only. The call sets the controller's
   latch as it arrives,
   so from that moment nothing can start, resume or restart a download
   (DC6). It never rejects. From the hub at rest it finds nothing to
   stop (Step 2 machine changes, "At rest"), so its pause matters from
   Settings, with the hub closed. Pausing sends nothing. It comes
   first because only the pause shows whether the download can be
   kept. The wait is bounded (#133: 60 s of foreground time at worst,
   normally well under a second); the switch's sheet shows its
   waiting state meanwhile ("While a switch runs"). By its result:
   - `nothing-running`, or `kept` (with or without resume data): go on
     to step 2. A kept download's row is saved `paused`.
   - `completed`: the transfer finished before the pause took effect,
     or it had finished earlier with the hub closed (a held record).
     It is never warned about, and nothing is removed. Go on to
     step 2. The next hub open checks the file and runs the
     smoke test (DC5 in the same process; R10f or R10j after a
     restart).
   - `not-keepable`, when the snapshot showed nothing live: the
     controller holds the record of a transfer that had already
     failed, or whose pause had failed, with no hub open, and step 1
     reports that record as it is (it stops nothing and writes
     nothing). Nothing was running, so nothing is warned about
     (owner, 2026-11-27). Go on to step 2. The row is left as it was,
     and the strict sweep deals with the file: it spares the file
     when the held record's pause state has resume data, and
     otherwise deletes an incomplete one (R8).
   - `not-keepable`, when the snapshot showed a live transfer: the
     pause gave no resume data, the pause failed, or the transfer
     failed while pausing. No transfer is in flight by then. The flow
     first runs the size check on that model's file (`verifyDownload`,
     size only, BL10), because the file can be complete even so (a
     transfer that failed after its last byte was written). A
     complete file is treated as `completed`: no warning, nothing
     removed, on to step 2. For a file that is not complete, or that
     cannot be checked, R10g's warning shows now, before anything
     below.

   Every result carries `rowSaved`. A `false` does not stop the
   switch: the controller writes the row again on its own (DC7), and a
   row that is still `downloading` at the next launch is R10f's under
   strict. With the hub open, the machine hears of the stop only
   through `TRANSFER_STOPPED` (M1).
2. The mode in memory becomes strict, so every gate says no at once,
   the controller's `gate` included.
3. The mode is saved. If saving fails, strict privacy stays on for this
   session, and the user sees (after step 6): "Strict privacy is on, but Curated
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
6. The strict sweep runs ("The strict sweep", below). It waits for
   step 3's save to settle, runs whether that save succeeded or
   failed, and comes before a save-failure message shows.

**When a save fails** (step 3, and R9's save). The message is the
sheet's last content, with two buttons, **Try again** and **OK**. The
"Try again" that ends each message names that button. It runs the
same save again, with no confirmation, no step 1 and no sweep:
the user has already confirmed this switch, and for step 3 the mode
in memory is already strict. A save that succeeds is followed by what
follows it in the flow (for R9, the apply and the backstop). If the
save fails again, the message shows again. OK ends the switch. Try
again runs after R8's `try`: the `finally` has released the latch by
then, and since step 2 the mode's own gate is what refuses.

After OK on step 3's message, strict privacy is on but not saved
(R4's status is `unsaved`, or still `read-failed` when the switch
began from R3's read failure).
Settings → Privacy still shows Strict privacy selected, with R7's
not-saved line under it for as long as the status is `unsaved`, and a
tap on
it saves `'strict'` again and does nothing else, as Try again does
(R7). With no model installed, the hub notice carries the same
sentence and a Save strict privacy button (R7).
The same tap after R3's read failure is what "Choose a mode to
save it again" means for strict. That tap is a switch like any other:
one at a time, behind the sheet, and a failed save shows step 3's
message. After OK on R9's message the app is as it was before the
tap, in strict privacy with the store unchanged. Choosing Standard,
or a Step out button, runs R9 again from its confirmation.

**The strict sweep** (owner, 2026-11-27). A partial model file can be
1 to 3 GB, and a user who stays in strict privacy may never download
again, so nothing else would free it. As step 6 of every switch to
strict, the app deletes the model files that nothing can use again.
It is best effort, and it asks and warns about nothing: each file
belonged to a transfer that was already dead.

- **It deletes** every catalog model's file in the documents folder
  that the next item does not spare, through the hub's own
  `deleteOrphanedCuratedModelFiles` (`src/services/modelFiles.ts`),
  which catches and logs a delete that throws.
- **It never deletes** these. The installed model's file: the
  function's path comparison, and also the installed model's catalog
  id, when `getModelId()` returns one in the catalog, passed as
  `keepModelId`. `getModelId()` is `string | null` and may be `'custom'`
  or an id the catalog does not know; such a value is passed as
  `keepModelId: null`, and the path comparison covers a custom install.
  The file of a kept download: a `paused` saved row whose pause state
  has resume data, whose Android partial a later Resume continues
  (R10c). As a conservative exception, not a kept download, a `failed`
  row whose in-memory pause state has resume data is spared too. And a
  complete file of the saved row's model
  (the size check, BL10): a finished download waiting for its smoke
  test (R10f, R10h, R10j). A size check that throws, or cannot run,
  also spares that row's model: here a file that cannot be checked
  is kept (step 1 counts it as not complete, because there a warning
  is the safe direction; here deleting is the unsafe one). For the
  row's model in these last three cases the flow passes the row's
  model as `alsoKeepModelId`. A row whose model has left the catalog
  spares nothing; the flow looks the id up before the size check. "The
  row's model" is `snapshot().row.modelId` looked up in the catalog (not
  in the catalog gives null).
- **What counts as resume data.** A pause state whose `resumeData` is
  a non-empty string (`normalizePauseState`,
  `src/services/modelDownloadState.ts`). This is the conservative
  reading of the owner's condition (kept = has resume data). A
  `failed` row can carry it in memory: a failed pause keeps the
  controller's pause state, and `RETRY` with a pause state goes to
  `confirmingNetwork` as a continuation. That exception only helps an
  in-session Retry. After a restart a `failed` row is never restored, and
  picking the model calls `start()`, which starts over, so the spared
  file is not continued. For the owner to confirm, knowing that.
- **So what goes is** the partial of a `downloading` row with nothing
  running and no resume data, of a `paused` row with no resume data
  (it was already going to start over, R10e), and of a `failed` row
  with no resume data (a later Retry starts over cleanly, BL8); the
  file whose row Turn on and remove has just cleared (R10g); and a
  catalog file with no row. No row is changed. What the user sees
  afterwards depends on the row. A `paused` row with no resume data
  shows paused, with "This download will start over when you resume."
  A `downloading` row shows that same paused screen after M8, the
  next time a hub opens. A `failed` row is not restored (`toRestoreState`
  excludes it); a mounted hub in `failed` keeps its screen, and Retry
  continues in-session only.
- **Its order.** The reads come in one fixed order, one after the
  other, never in parallel, because a smoke test can commit while the
  sweep runs: `runSmokeTestAndCommit` sets the model path and only
  then clears the row. Step 1 awaits `smokeTestSettled()`. The
  row-then-path order is defensive: a commit after step 1 (for example,
  if a mounted hub's completed event ever commits despite DC4's hold)
  is still seen safely.
  1. Await `smokeTestSettled()`, bounded at 10 s. On the bound, skip
     the sweep: sparing everything is the safe direction, and the next
     switch to strict sweeps again (a partial can stay until then).
  2. Call the controller's `load()` (bounded, "A switch always ends")
     and read `snapshot().phase`, `snapshot().row.modelId` and
     `snapshot().pauseState`. `RowRecord` is `{modelId, status}` only,
     so the sweep sees the pause state only through the in-memory
     `snapshot().pauseState`, which is the truth; the persisted row can
     lag it. A record with resume data keeps the file (the safe
     direction). If `phase` is `active` (a transfer still live), the
     sweep spares that row's model.
  3. Run the size check on the row's model.
  4. Read `getModelPath()` last, and then `getModelId()`, each
     bounded at 10 s.
  A smoke test that commits between steps 2 and 4 is seen by step 4,
  so the installed file is kept. If any read cannot be made, or hits
  its bound, the sweep deletes nothing, as the hub's sweep does (BL9).
- **It runs only there.** Not on Cancel, at launch, when a hub
  opens, when strict comes on because the setting could not be read
  (R3), on a tap that only saves again (R7), or on stepping out. A
  switch that dies before step 6 leaves the files.
- **The hub's sweep does not cover this.** It runs only when
  `checkingExisting` starts, and it spares only a `paused` saved row's
  model (BL9). Under strict the only way into that state is the restore of
  that same row, because a pick is refused (R12). On iOS a paused
  download's bytes are in a temporary file that the app cannot
  delete (R10), so the sweep matters on Android, and on either
  platform for a finished file of the wrong size.

**When a step throws.** Whatever is thrown, and wherever, the flow
closes the sheet and ends the switch; for R8 that is after its
`finally` has released the latch. Where the app is left is fixed
too:

- **Known throws are caught where the call is made**, each with its
  own fallback: step 1's size check (a file that cannot be checked
  counts as not complete); Cancel's `park()` (R10g); the sweep's
  waits, reads, size check and deletes ("The strict sweep"; a size
  check that throws spares that row's model); and a subscriber of the
  mode module (R4).
- **Anything else thrown after Turn on, or Turn on and remove, and
  before step 2** is logged, and the flow goes on from step 2: strict
  privacy turns on and is saved, with no warning. An `abandon()`
  that rejects is of this kind: the row stays, a row with resume data is
  spared this time, and the next switch sweeps it. A row it left shows as
  a paused download (R10e, R10f). The user asked for strict privacy, and when
  the app cannot tell what happened it runs strict, which is R3's
  rule for a setting it cannot read. Staying in Standard would leave
  the app able to go online after a confirmed Turn on, with nothing
  on screen to say so.
- **After Cancel on R10g's warning** the user chose Standard, so a
  throw never turns strict privacy on. It is logged, and nothing
  more is called.
- **After step 2** the mode is already strict, and the flow goes on.
  A save that throws is a save that failed ("When a save fails"). In
  R9 too, where strict privacy then stays on.

**Why the `finally`.** Only `releaseStrictStop()` clears the latch. It
writes nothing, starts nothing and never rejects, and calling it twice
is harmless. After step 2 the mode's own gate refuses every download,
so the latch has done its job: it covered the time between step 1 and
step 2. On an exit before step 2 the mode is still Standard, and a
latch left set would refuse every download there: the hub would show
Paused with a Resume that does nothing. R10g's Cancel is such an
exit. Its `park()` is not a start, so the latch does not refuse it,
and the `finally` releases the latch after it. R9 releases once more,
as a backstop.

**The kill window between steps 1 and 3.** If the app dies after step
1 starts and before step 3 has saved the mode, it relaunches in
Standard. `stopForStrict()` saved the row as `paused` before it asked
for the pause, so the hub
shows the download paused and does not restart it. If the app died
before the pause state was saved, the row has no resume data, so R10j
checks the (incomplete) file at the next hub open, the row stays paused
with R10e's "will start over" line, and Resume starts it over, through
the network check. This corner is accepted. Without the first save,
the row would still say `downloading`, and the relaunch would restart
the download from zero by itself. The latch does not survive the kill, and nothing needs it to.

*(Rule 11.)*

**R9 — Stepping out of strict privacy.** Each step away from strict is
an explicit, informed choice, so a confirmation says what Standard
allows and with whom. That includes R6's download continuation, in the
Standard copy's terms, because the hub's Step out button opens this
confirmation without the Standard copy on screen:

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
> device. None of them gets your journal. Stepping out starts nothing:
> a paused download stays paused until you tap Resume. After you step
> out, a model download you start can carry on by itself when you come
> back to the app or open the model hub — sometimes from the start —
> and it asks first if you're on cellular data.
> [Cancel] [Step out]

On Step out, the new mode is saved first and applied second: every
gate says no until the save has finished. Only one switch runs at a
time (R8, "One switch at a time"), so this save never overlaps R8
step 3's. If saving fails, the app
stays in strict privacy and says: "Couldn't save the change, so strict
privacy is still on. Try again." The message's Try again button runs
the save again (R8, "When a save fails"). After a successful apply,
the app
calls `releaseStrictStop()` as a backstop: R8's `finally` has normally
released the controller's latch already, and a latch left set would
refuse every download in Standard (R8, "Why the `finally`"). The call
starts nothing. After stepping out, nothing starts by itself: no
download resumes, no update check runs, no store connection opens.
One kind of row is outside "no download resumes", and it is not a
download that strict privacy paused (R10d): a row still saved
`downloading` that no hub opened on while strict was on, so M8 never
rewrote it. Turning strict on leaves such a row alone when nothing
was running (R8, "No pre-check"), and a row write that did not land
can leave one too (`rowSaved: false`). Stepping out does not start
it. The next hub open restores it as R6's continuation, through the
network check, as the confirmation above says a download you started
can.
*(Rule 12; rule 9 ¶2; owner ruling 2026-11-16.)*

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
pause owner is not the hub machine. It is the download controller of
#133 (DC1), and this spec does not specify it again:

- **Stopping.** R8 step 1 calls `stopForStrict()`. Checking the task's
  state, the save order (the row `paused` before the pause, then again
  with its pause state or none), the cancel when a pause fails, and
  "no transfer is in flight when it returns" are that call's
  guarantees (DC6).
- **Refusing.** Step 2 supplies the controller's `gate` (R4). A
  refused `start()` or `resume()` changes nothing: no task, no write.
  The hub maps the refusal to a pause (M4a), and `pause()` saves the
  row `paused`. So **a gate refusal never leaves a `downloading` row,
  and is never a failure of its own** (both modes, defensive): no
  restart by itself after Step out (R9, R10d), and no "Check your
  connection". One refusal does end in `failed`, and the failure is
  not the refusal's: when the controller holds a transfer that had
  already failed, the pause reports it and the hub shows that failure
  (#133 H1; Step 2 machine changes, "Why M4a and M8 go through
  `pausing`"). Under strict a restore is M8's and never reaches
  `downloading`, so it meets no refusal.
- **The latch.** `stopForStrict()` also sets the controller's latch,
  which refuses every start until `releaseStrictStop()`. This spec
  releases it in two places and nowhere else: R8's `finally` and R9's
  backstop.
- With the hub open, the hub machine follows the controller through
  `TRANSFER_STOPPED` (M1; Step 2 machine changes). The `strict` reason
  lives in the machine's context only; the row stores none (R10e).

**b. One transfer at a time, and none outlives the app process.**
Strict privacy can only pause a transfer the app can still reach.

- **One transfer, always held by the controller** (DC1). A start or
  resume for the model whose transfer is running attaches to it, and
  never creates a second one.
- **Reopening the hub attaches to a running transfer** (owner,
  2026-11-21, #133 OQ-1; this replaces "a restore stops a live
  transfer first", which this spec had before #133). A transfer from a
  closed hub that is still running in the same process is neither
  paused nor restarted when the hub opens: the hub goes to
  `downloading` and shows it, with no network check, because the
  transfer never stopped (DC5). In strict privacy there is none to
  attach to: R8 step 1 stopped it, the gate refuses every start after
  that, and a new process holds no transfer (next item).
- **No transfer outlives the app process** (owner, OQ-7; #133 leaves
  this to Step 2, its OQ-8). Both `DownloadTask` constructions in
  `modelDownloadService.ts` (the fresh download and
  `DownloadTask.fromSavable`) pass `sessionType: 'foreground'`. Today
  the service sets no `sessionType`, the installed expo-file-system
  defaults to `'background'`, and on iOS a background `URLSession`
  keeps transferring after the app is killed, where nothing in the
  relaunched app can reach it. Android needs nothing: its transfer
  runs in the app process and ends with it (the option is ignored
  there).
- The owner accepted the costs and risks listed with OQ-7 (Resolved
  questions): with the hub closed, an iOS download stops while the app
  is suspended and starts over when the hub next opens (through the
  network check), unless iOS left it running, in which case the hub
  attaches; a hub pause that loses the race with suspension may
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
downloads-off alert (R5), and the machine ignores both events while
strict is on (M15). While the mode is strict, a paused download
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
  exit, `LEAVE_PAUSED` (M6). It shows in `paused` only, which the
  machine enters once the pause has settled; `pausing` shows no
  buttons (DC3). It keeps the saved row and the machine's
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
screen shows R10e's strict label and its "will start over" line. The
rewrite happens only when a hub opens under strict. A `downloading`
row that no hub opened on before the user stepped out restores as a
Standard continuation (R9). When the switch to strict itself found
the row with nothing running, the strict sweep has already removed
its partial file (R8).

M8 replaces only the not-verified exits. The hub's normal restore
still runs first (`checkingExisting` → `verifyDownload`). If the file
on disk is already
complete — a download that finished while the hub was closed leaves a
`downloading` row (or a `paused` row with no pause state, R10j), a
complete file, and no live transfer — the row is not rewritten and no
warning shows: the download continues through the smoke test to
`complete` (R10h). In the same process the layout already knows it finished, and restores straight to this check (DC5).

**g. A live download that can't be kept: warn, then park or remove**
(owner, OQ-6; narrowed 2026-11-27). A transfer that is running when
the user taps Turn on is paused by R8 step 1. It can't be resumed
later when the pause gives no resume data, when the pause fails, or
when the transfer fails while it is pausing. Then, unless its file
turns out to be complete (R8 step 1), the app warns before the
switch:

> **This download can't be kept**
> Curated Journal can't keep this download so that it continues later.
> If you turn on strict privacy now, Curated Journal throws away what it
> downloaded so far, and the download starts over the next time you
> get a model. If you cancel, strict privacy stays off, and the
> download starts over the next time you open the model hub.
> [Cancel] [Turn on and remove]

- **Only a transfer that was live at Turn on is warned about** (owner,
  2026-11-27). Only the pause shows whether it can be kept, so the
  warning shows after R8 step 1 and before step 2. The controller
  has already stopped the transfer; after a failed pause it cancelled
  it (DC3).
- **Nothing else is warned about.** Turning strict on changes nothing
  for a download that was not running: its row stays as it is, and
  the strict sweep removes a partial that nothing can resume (R8).
  - A download that was already paused, with or without resume data.
    `stopForStrict()` reports a held `paused` record as `kept`. One
    with no resume data was already going to start over, and its
    screen says so (R10e).
  - A `downloading` row with nothing running. Step 1 reports
    `nothing-running`, or `completed` for a transfer that finished
    with no hub open.
  - The record of a transfer that failed earlier with no hub open.
    Step 1 reports it as `not-keepable`, but the flow's snapshot
    showed nothing live, so no warning shows (R8 step 1).

  OQ-6's third cause, "no live handle", is retired. It meant a
  transfer the app could not reach, and R10b leaves none (Resolved
  questions).
- **In practice the warning shows from Settings.** At rest nothing is
  in flight behind a mounted hub (DC4), so from the hub's control
  step 1 has nothing to stop. Mid-download, Settings is reachable
  with the hub closed, mainly during a model change (R10a).
- **Cancel** (owner, 2026-11-16 and 2026-11-27): the app stays in
  Standard, and the download waits for the model hub. Dismissing the
  warning counts as Cancel. Cancel starts nothing, on any network,
  and asks the OS nothing about the network. It takes the model from
  the controller's `snapshot()` and calls `park(modelId)`, which
  saves the row `downloading` with no pause state and starts no
  transfer. That replaces the `paused` row step 1 saved, so the row
  matches what happens next: the hub restores it when the user next
  opens it, through the network check (BL1: Wi-Fi starts it over,
  cellular asks, offline waits). No transfer begins outside the hub
  (INTENT check, item 8). If the snapshot holds no model, Cancel
  calls nothing.

  Cancel does not end the switch at the tap. The sheet shows a
  waiting state until `park()` has returned, and the switch ends
  after it, in R8's `finally`, which releases the latch (R8, "One
  switch at a time"). Cancel shows no message and retries nothing:
  - `park()` returns `rowSaved: false`: the controller writes the row
    again (DC7). Until it has, the row is the `paused` one step 1
    saved, and the hub shows the download paused, with "will start
    over".
  - `park()` rejects (`TransferInFlightError`, which needs a live
    transfer, and step 1 left none): the error is caught and logged,
    and the row stays as step 1 left it.

  Cancel does the same wherever it is tapped. DC4 rules out a hub
  mounted over a live transfer, so no hub is there to see it. If one
  ever were, it would have heard `TRANSFER_STOPPED` and would show
  the download paused, and its Resume would start it over through
  the network check.
- **Turn on and remove:** the app clears the download, then carries
  on from R8 step 2. It calls `abandon()`, which cancels a transfer
  if the
  controller still holds one, forgets the resume data and with it the
  reference to the OS's temporary file (on iOS that file stays in the
  OS's tmp folder until the OS purges it; the app cannot delete it),
  and clears the download row, so the hub has nothing to restore.
  `abandon()` deletes no file. The strict sweep does, as step 6 of
  this same switch: with the row cleared, nothing spares that model's
  file (R8, "The strict sweep"). So the partial on Android goes, and
  the installed model's file never does. `abandon()` is awaited
  before R8 step 2. If the row
  clear did not land (`rowSaved: false`), or `abandon()` rejects, the
  row stays and a row with resume data is spared this time; the next
  switch sweeps it. The switch goes on: the
  controller clears it again (DC7), and until then a leftover row
  shows as a paused download (R10e, R10f). `abandon()` does not
  release the latch; R8's `finally` does. Nothing is sent to a hub
  machine: none is mounted over a live transfer (DC4), and the next
  hub open finds no row. A later download starts
  fresh.
  With R10b, a transfer the app cannot reach can only be one left by a
  version from before Step 2.

**h. On-device steps carry on.** Checking the file and the smoke test
happen on the device, so a download that has already finished
continues through them in strict privacy. Neither is an integrity check
(BL10).

**i. No deletion unless the user says so.** A kept download is one a
later Resume or Retry can continue: a saved row whose pause state has
resume data and status `paused`, and with it the Android partial
file or the iOS resume data (the conservative reading of the owner's
condition, kept = has resume data; for the owner to confirm). Switching modes,
starting the app and opening the hub never delete one. Only a choice
the user makes deletes one:

- Turn on and remove, which the user confirms in g;
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

The hub's orphan sweep keeps a kept download's file (BL9), and so
does the strict sweep (which also spares a `failed` row's file that
has resume data, R8; that is not a kept download). What the strict sweep deletes is not a kept
download: it is a partial file that nothing can resume (R8, "The
strict sweep"; owner, 2026-11-27).

**Import and a different-model pick both ask first** (lead rulings,
2026-11-16; the owner may overrule). Their basis is this item's own
principle (only a choice the user makes deletes a kept download) and
rule 2 (the user decides what happens to their data). Both look at the
saved row's model **and status**, which #133's `readDownloadRow()`
returns (DC8), so Step 2 adds no read. The read is awaited, so each
handler asks again, when it answers, whether a switch has started
(R8, "A mounted hub is held").

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
  the low-memory warning card when it applies (first, where it is
  today), then this confirmation, then the existing "Replace model"
  confirmation when it applies (the plan may merge those two, as long
  as both statements show).

A `failed` row shows neither confirmation. The hub never restores a
`failed` row, so it is not a kept download. The strict sweep still
spares the file of one whose in-memory pause state has resume data, as
a conservative exception, and deletes the file of one that has none
(R8).
After `LEAVE_FAILED` (M11) the machine still holds its `modelId` and
pause state for the session; picking another model, or a successful
import, clears them without asking. If `readDownloadRow()` rejects,
neither confirmation shows and the tap goes on as it does today. A
mounted hub cannot reach that case: its layout's `load()` succeeded
first, and after that the read cannot fail.

**j. A paused row with no resume data is checked first** (review,
2026-11-16; M7). In either mode, when the hub restores a `paused` row
whose pause state is null, it runs the size check (`verifyDownload`)
before it settles on `paused`. If the file is complete, the restore
goes on to the smoke test, as a `downloading` row's restore does
(R10f, R10h). Otherwise the download stays paused, with R10e's "will
start over" line; a paused row waits for the user, so neither
non-complete exit goes to the network check. Why: today such a restore
goes straight to `paused`, and Resume with no pause state reaches
`startDownload` (through the controller's `start()`), which on Android writes from byte 0
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
After a failed save (R8 step 3), it starts with the not-saved sentence
instead. In both cases it also has the **Save strict privacy** button
(R7).

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
model still opens the hub. The hub shows its one strict notice (R7),
with the same title, "Strict privacy is on", and the same Step out of
strict privacy button as in R11. With a model installed, this text
replaces R11's body: "Models download from the internet, which strict
privacy keeps Curated Journal away from. Your current model stays in
place. To change it, import a model file that's already on this
device, or step out of strict privacy first." R3's read-failure
sentence, the not-saved sentence and the Save strict privacy button
(R7) go with R11's body only; with a model installed, Settings →
Privacy is where they show. Picking a catalog model is refused (R5)
**before** anything
else: before the low-memory warning card that `selectModel` shows
(`modelRamWarning`), before R10i's different-model confirmation,
before the "Replace model…" confirmation that `commitSelection` shows
("… will be deleted now"), and before the `retiringCurrent` state that
follows it. Today, `SELECT_MODEL` deletes the current model
(`retiringCurrent`) before any download starts. In strict privacy that
would leave the user with no model and no way to download one.

**A pick that outlasts a switch.** The refusal is asked at every step
of a pick, not only at the first tap: at the tap on the model, at
Continue on the low-memory card, when R10i's read of the saved row
answers (before its confirmation opens), at Choose anyway (R10i) and
at Replace. The card is part of the list, not a sheet, and R7's control
stays active beside it in `selecting`. So a pick begun in Standard
can still be waiting on its card when strict privacy turns on. If the
mode is strict at any step, that tap shows the downloads-off alert
(R5), the card closes, and nothing else shows: no later confirmation
and no `SELECT_MODEL`. While a switch runs, the steps of a pick do
nothing at all (R8, "A mounted hub is held"). Without this rule,
Continue after the switch would show "Replace model … will be deleted
now" in strict, and its Replace would send a `SELECT_MODEL` that M14
drops with no alert.

The list's refusal is a screen asking first, which is not the guarantee
(R4). The guarantee is in the machine: while strict is on, `selecting`
ignores `SELECT_MODEL` (M14), so `retiringCurrent` cannot run and no
kept row is abandoned, whatever sent the event. The machine cannot
import `privacyMode.ts` (which has native imports), so strict reaches
it as an optional guard on `ModelHubApi`, which `createModelHubApi`
always supplies and which answers from `canDownloadModels()` (Step 2
machine changes, "The strict guard"). The machine sees only that
answer, not the mode. The same guard drives M8 and M15. *(Rules 1,
11.)*

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

**Step 2: expected MINOR** (the next MINOR on the 9.x island after
#133's 9.3.0: 9.4.0, or the next free MINOR on `main` when it lands),
shipped over the air to installed 9.x binaries. Because Step 2 lands
in this same pull request, the pull request's version bump becomes
that MINOR when the implementation lands; until then it carries a
PATCH for the spec alone, 9.3.1 on top of #133. Check `origin/main`'s
version when un-drafting. Step 2 is JS/TS only:

- the mode module, with its status accessor (R4), and its storage
  (`expo-secure-store` is already installed and already in
  `app.json` plugins);
- the Settings section, the hub notices, the hub's Turn on strict
  privacy control (R7), and the confirmations and alerts;
- the gates in the update check and the tip jar, the `gate` the
  singleton download controller is built with, and the strict guard
  injected into the hub (R4, R12);
- the switch flow that calls `snapshot()`, `stopForStrict()`,
  `abandon()`, `park()`, `load()` and `releaseStrictStop()` (R8, R9,
  R10g), its one sheet, the strict sweep, which calls the existing
  `deleteOrphanedCuratedModelFiles` (R8), the hub layout's wait for a
  running switch and the hold on a mounted hub's screens (R8, "While
  a switch runs"), and the flow's one 10 s bound (R8, "A switch
  always ends"); the controller's own code changes only in the getter
  that passes the `gate`, and it gains no event;
- the hub-machine changes in Step 2 machine changes (rows M6, M7,
  M8, M10, M11, M13, M14 and M15; M1 and M4a are #133's code);
- the JS-only `selectable` and `keepOpen` options on
  `useConfirmSheet` (R6);
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

Four changes ship on their own:

- **#118, PATCH, now** (PR #120). Remote images in notes stop loading.
  JS only. The Step 2 implementation needs it merged first
  (Sequencing): it adds the `NoteMarkdown.tsx` wrapper that R6's link
  handler goes into.
- **#124, PATCH, now** (PR #125): the Baseline. JS only.
- **#133, MINOR (9.3.0), before this pull request:** the download
  controller (Baseline, DC1–DC8). JS only. This pull request's branch
  is based on it.
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
- **#133**: the download controller (Baseline). It ships first, on its
  own. Step 2 calls it and changes neither its queue, its pause
  procedure nor what its tests assert (the suites that mount the real
  hub layout or render the hub's screens gain the mode seeding and
  nothing else: Verification, "Seeding"). The one edit to its module
  is the `gate`
  the singleton getter passes, which #133's spec leaves for this one
  ("nothing supplies one until #117 does"; R4). On the hub machine,
  Step 2 adds only the rows of Step 2 machine changes. Four of them
  narrow one of #133's hub rows under a guard, and change nothing
  about that row otherwise: M7 (H10, for a `paused` row with no pause
  state), M8 (the not-verified exits of `checkingExisting`, H9b's
  included, in strict), M14 (`SELECT_MODEL`, H8, in strict) and M15
  (`RESUME`, H5, in strict; it also narrows `failed`'s `RETRY` with a
  pause state, which #133 gives no row and leaves as #125 has it,
  BL1). The hub layout gains one wait before its
  `load()` (R8, "While a switch runs"). The controller gains no
  event, and Step 2 starts no transfer outside the hub (R10g).
- **#128**: hash verification of a downloaded model file (BL10).
- **#126**: the pre-existing gap found in PR #125's review (Baseline).
  #127 and #132 are closed by #133.
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
  this spec must seed Standard before asserting any allowed behavior,
  by loading through a mocked store that holds `'default'`. A shared
  helper may do the load, but each suite calls it itself. The shared
  setup file (`jest.setup.ts`, which jest runs in every test file)
  never loads the mode. The load is memoized and there is no
  test-only setter, so a file seeded there could no longer load
  `'strict'`, or assert anything about the time before the load. A
  file that needs a second mode gets it through the real set
  function, or through a fresh module registry for that case
  (`jest.isolateModules`). Without seeding, every gate says no and
  the suites fail. They are:
  - `privacyMode.test.ts`, the tip-jar tests and the update-check
    tests;
  - the hub suites that mount the real
    `src/app/model-hub/_layout.tsx`, whose `createModelHubApi`
    supplies the real strict guard:
    `modelHubLayoutRestore.test.tsx`,
    `modelHubLayoutRestoreCellular.test.tsx` and
    `modelHubLayoutLoadError.test.tsx`;
  - the hub screen suites that render `index.tsx`, `download.tsx`,
    `CellularConfirm` or `AwaitingWifi` over a mocked `useModelHub`.
    After Step 2 those components read the mode themselves, for the
    label and the notices (R7, R10e) and for R5's and R12's
    refusals. Unseeded, they would render the strict notices and
    label, and refuse the taps some of these suites assert:
    `modelHubDownloadNetworkStates.test.tsx` (its Download over
    cellular and Try again taps), `cellularConfirmClose.test.tsx`,
    `modelHubDownloadSmokeFailed.test.tsx`,
    `modelHubPausingScreens.test.tsx`, `modelHubRamWarning.test.tsx`
    (its model taps), `modelHubChangeContrast.test.tsx` and
    `modelHubDownloadContrast.test.tsx`.

  Those mocked hub contexts predate the fields Step 2 adds, and the
  screens must work without them. A missing `pauseState` (M13) reads
  as none. `readDownloadRow()` (R10i) is called only at the tap that
  needs it, never when a screen mounts, so a suite that taps neither
  a model nor the Import row needs no mock for it.
  `modelHubRamWarning.test.tsx` does tap models, so its mocked
  context gains a `readDownloadRow` that resolves null. That is a
  mock change with no assertion changed, and the suite is in neither
  keep-green list.

  Suites that build their own hub API pass no strict guard,
  which reads as not strict (Step 2 machine changes, "The strict
  guard"), so they need no seeding: every `makeHubApi` suite that does
  not mount the real layout, and `modelHubController.test.ts`. #133's
  controller suites build their own controller with no `gate`, never
  use the singleton, and need no seeding. One new suite does use the
  singleton, and only it does (below, "The gate").
- **#125's and #133's tests stay green:** every test in Baseline's two
  keep-green lists, unchanged in what it asserts. The one existing
  test Step 2 rewrites is outside those lists, and Baseline names it
  (M7).
- **Step 2 machine changes:** each row has the test in its last
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
    no Standard positive control here, because no mode opens a note's
    link. Its control is in the markdown test, where the bare library
    fires the spy (see Markdown, below).
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
    one, and show a note that has a remote image and a link, tap the link, then
    Share… (with `Share.share` mocked to resolve), then OK (the dialog
    is still open after Share…, because it stays open), and assert no
    network spy fired.
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
  - It also watches react-native `Share` and `expo-sharing`.
  - It fails if a file outside four reviewed allowlists uses one:
    - **Gated:** each file must import its gate from
      `@/lib/privacyMode`. For model downloads that file is
      `src/services/modelDownloadController.ts`.
      `src/services/modelDownloadService.ts`, which holds the
      `DownloadTask` calls, is listed as gated **by its only caller**,
      with that reason written next to it: T-own
      (`__tests__/downloadOwnership.test.ts`) proves nothing but the
      controller can reach its transfer functions.
    - **Wrapper only:** `src/components/NoteMarkdown.tsx`. Only this
      file may value-import `react-native-markdown-display` (#120's
      lint rules enforce this too, for static imports, subpaths,
      `import()` and `require()`; type imports, such as
      `markdownRules.tsx`'s `import type { RenderRules }`, are
      allowed). It imports nothing from `@/lib/privacyMode` (R4). It
      must pass #118's image rule and the shared `onLinkPress`, and
      its props must leave out `rules`, `renderer` and `onLinkPress`.
    - **No gate needed:** files that use such an API but send
      nothing, each with the reason written next to it:
      `src/lib/networkGate.ts` (asks only the OS) and
      `src/components/graph/GraphCanvas.web.tsx` (loads CanvasKit's
      bundled WebAssembly from the web build's own origin; web only).
    - **User hand-off (charter exception):** files that use `Share` or
      `expo-sharing` to give the OS share sheet something the user
      chose to send, each with the reason written next to it:
      `src/components/NoteMarkdown.tsx` (Share… hands a link address
      to the share sheet on the user's tap; rule 11's exception, read
      as covering text, INTENT check item 7) and `src/lib/okfExport.ts`
      (the OKF export through the share sheet and the Android folder
      picker).
  - It covers `src/` only. The survey covers libraries (R17). Together
    they cover ROADMAP Step 2's "and anything added later".
- `__tests__/privacyMode.test.ts`, extended:
  - the saved mode is read and written;
  - every gate says strict before the load;
  - a read failure, and an unknown stored value, mean strict; a read
    that finds no stored value means Standard and writes nothing (R1,
    R3);
  - turning strict on applies first and saves second (R8); stepping
    out saves first and applies second, so every gate says no until
    the save resolves, and stays no when it fails (R9);
  - the load is memoized (R4): after a failed R8 step 3 save, with the
    mode strict in memory and `'default'` still in the store, a second
    call to the load function returns strict and does not read the
    store again;
  - the set function runs one call at a time (R4): a second call made
    while the first call's save is pending neither applies nor saves
    until that save settles, and the store ends holding the second
    call's mode;
  - subscribers hear each change;
  - the status accessor (R4) reports `loading` before the load;
    `saved` after a read that finds `'default'`, `'strict'` or no
    value; `read-failed` after a read that rejects and after an
    unknown stored value; and `unsaved` after a failed R8 step 3 save
    from Standard. A save that succeeds sets `saved`, and subscribers
    hear that change even when the mode stays strict; they also hear
    the change to `unsaved` when a step 3 save fails. A subscriber
    that throws stops neither the other subscribers from hearing a
    change nor the set function from saving. A save that
    fails leaves `read-failed` as it is, and a failed R9 save leaves
    the status as it was;
  - the exported download-gate adapter (R4) refuses, with its fixed
    reason, before the load and in strict, and allows in Standard.
- Download controller and model hub, Step 2 cases
  (`modelHubMachine.test.ts`, `useModelHub.test.ts`, the `_layout`
  restore, the hub screens, and a new suite for the switch flow, which
  runs the real controller over #133's fake native task):
  - **Stop for strict (R8 step 1, R10a).** Turning strict on from
    Settings mid-download (hub closed) calls `stopForStrict()` once and
    waits for it; the row is `paused` with the pause state, and no
    `DownloadTask` is created until Resume. A relaunch in Standard
    after a kill between the two saves shows the download paused (R8
    kill window). The controller's own save order and outcomes are
    #133's T-C14 and are not tested again here.
  - **The gate (R4, M4a).** The exported adapter is tested on a
    controller the test builds with it (`makeHubApi({ gate })`, or
    `createModelDownloadController` directly). With the mode strict,
    `start()` and `resume()` return `refused`, no `DownloadTask` is
    created, and no row is written. With the mode Standard it allows.
    #133's singleton has no reset, so no shared suite uses it. That
    the getter passes the adapter is tested once, in a suite of its
    own, which is the only one to call the real
    `getModelDownloadController()` (jest gives each test file its own
    module registry, so the singleton there is fresh). Before the
    mode has loaded, its `start()` returns `refused` with the
    adapter's reason and constructs no `DownloadTask`; after Standard
    is loaded, the same call creates one. Neither
    `modelDownloadService.ts` nor
    `src/machines/modelHubMachine.ts` imports anything from
    `@/lib/privacyMode` (R4, R12). In `useModelHub.test.ts`:
    `createModelHubApi` supplies the strict guard, and the guard says
    strict before the mode has loaded and in strict, and not strict in
    Standard.
  - **The latch is always released (R8, R9).** One test per exit of
    R8: success; a failed mode save; `not-keepable` then Cancel;
    `not-keepable` then a dismissed warning; `not-keepable` then Turn
    on and remove; and a thrown step, one test per kind ("When a step
    throws"): `abandon()` rejects, which ends in strict, and `park()`
    rejects after Cancel, which ends in Standard. After each, the
    controller's
    snapshot has `stoppedForStrict: false`, the sheet is gone, and a
    new switch can start. After the exits that end
    in Standard, a `start()` creates a task. After the others the
    gate, not the latch, is what refuses. **Required by #133:** strict
    on with nothing running, step out (R9), then a `start()` in the
    same process creates a task. And with the latch set by hand, R9's
    Step out clears it.
  - **Nothing starts between step 1 and step 2.** A `resume()` issued
    after `stopForStrict()` was called and before the mode is strict
    returns `refused`.
  - **One switch at a time (R8).** With step 1 held pending, a second
    Turn on starts nothing: `stopForStrict()` was called once. When
    that first flow then ends in Standard (`not-keepable`, then
    Cancel), the snapshot has `stoppedForStrict: false` and no second
    flow is left running. A Step out tapped while R8 step 3's save is
    pending starts nothing. A second tap on a control while a
    confirmation is open opens no second one.
  - **While a switch runs (R8).** These tests press the controls
    directly. A test renderer does not model a sheet that covers the
    screen, so what they exercise is the two rules in state.
    - The sheet: from the tap to the end of the switch, the flow's
      sheet is rendered at every step (the confirmation, step 1 held,
      the warning, `abandon()` held, the save held, the sweep's
      `getModelPath()` held, a save-failure message). After Cancel on
      the warning it is still rendered, in a waiting state, while
      `park()` is held, and it is gone only after that call has
      returned. In each waiting state it has no dismiss handler and
      no buttons. The assertions are structural, by testID.
    - No hub loads under a switch: with step 1 held pending after
      Turn on from Settings, mounting the real
      `src/app/model-hub/_layout.tsx` (what Change AI model pushes)
      shows its spinner, mounts no provider and sends no
      `RESTORE_DOWNLOAD`. After `not-keepable` and Cancel, with
      Cancel's `park()` held, the layout still shows its spinner and
      has not called `load()`, because the switch has not ended. When
      `park()` returns, the layout loads and restores the
      `downloading` row through `confirmingNetwork`: on Wi-Fi the hub
      then starts the download over, and on cellular it asks. When
      the switch
      ends through Turn on and remove instead, the layout restores
      nothing.
    - A mounted hub is held: with step 1 held pending after Turn on
      from the hub in `selecting` (Standard, a model installed),
      pressing a model and pressing "Import custom .gguf" send no
      event and push no route, pressing "← Settings" does not go
      back, and `retireCurrentModel` is never called. With a
      low-memory card already on screen, pressing its Continue opens
      no confirmation. With `readDownloadRow()` held pending after a
      press on a model, and again after a press on "Import custom
      .gguf", a switch is started from the hub's control. When the
      read then resolves with a kept row, no confirmation opens, no
      event is sent and no route is pushed.
      From `paused`, Resume and Choose another model
      send nothing; from `failed`, Retry sends nothing. Positive
      control: after the switch ends by Cancel, the same presses
      work.
    - With no switch running the layout waits for nothing: the layout
      suites in the keep-green lists pass with no change.
    - A switch always ends (fake timers). With `getModelPath()` never
      answering in the sweep, 10 s later the sweep has deleted no
      file, and the switch ends with the mode strict and saved. The
      same with a hanging `smokeTestSettled()`, `load()` and
      `getModelId()`, one case each.
  - **One transfer (R10b).** Start and resume pass `sessionType:
    'foreground'`. Reopening the hub on a running transfer is #133's
    T-H6 (attach), kept green.
  - **Never resumes by itself (R10d).** Starting from a download paused
    with reason `background` (a synthetic seed; M1's Test cell says why
    it is kept), turning strict on (M1) sets reason
    `strict`; a later `APP_FOREGROUND` stays in `paused` and creates no
    `DownloadTask`. Nor does it resume on restart or on leaving strict.
  - **At rest (R7, R8 step 1).** In `pausing` the hub's Turn on control
    is hidden. Turn on from the hub in `failed`: `stopForStrict()`
    returns `nothing-running`, the machine stays in `failed` with its
    label, and `LEAVE_FAILED` reaches the list (M11).
  - **No pre-check (R8).** A tap on the control shows the
    confirmation at once. Before Turn on the flow calls none of
    `load()`, `readRow()`, `verifyDownload` and `stopForStrict()`,
    from Settings and from the hub. With a saved `downloading` row,
    nothing running and an incomplete file, Turn on shows no warning:
    step 1 reports `nothing-running`, the mode becomes strict, the
    row is still `downloading`, and the sweep has deleted the
    partial. The next hub open under strict shows the download paused
    with "will start over" (M8).
  - **Completed while closed (R8, R10f, R10j).** A `downloading` row
    whose file is complete, with no live transfer: Turn on shows no
    warning, and no hub machine is created. Step 1 reports
    `nothing-running` in a new process and `completed` in the process
    the transfer finished in (a held record). The sweep leaves the
    file. When the hub next opens
    under strict, the restore runs the size check and then the smoke
    test, the row is not rewritten as `paused`, and the download
    reaches `complete`.
  - **Completed during the stop (R8 step 1).** When `stopForStrict()`
    returns `completed`, no
    warning shows, nothing is removed (the sweep spares the complete
    file), the mode becomes strict, and
    the next hub open reaches the smoke test.
  - **Failed with no hub open (R8 step 1).** With a held `failed`
    record (a transfer that failed with no hub mounted, its row still
    `downloading`), the snapshot shows nothing live, step 1 reports
    `not-keepable`, and no warning shows. The mode becomes strict and
    the row is unchanged. The sweep deletes an incomplete file and
    leaves a complete one, and leaves the file when the held record's
    pause state has resume data.
  - **Held pause-failed record (R8 step 1, sweep).** The controller
    holds a pause-failed record whose in-memory `pauseState` has
    resume data, while the persisted row says `downloading`, or
    `paused` with no resume data. The snapshot shows nothing live,
    step 1 reports `not-keepable`, no warning shows, and the sweep
    keeps the file: the in-memory `pauseState` wins. With no resume
    data in the record and no complete file, the sweep deletes it.
  - **Can't keep (R10g).** With a transfer live at Turn on, each
    `not-keepable` reason (no resume data, a failed pause, a transfer
    that fails while pausing) shows the warning after step 1 and
    before the mode changes. With that model's file complete, none
    does: nothing is removed, the mode becomes strict, and the next
    hub open reaches the smoke test. Turn on and remove calls
    `abandon()` and leaves no row. The sweep then deletes that
    model's file (the Android partial) and never the installed
    model's. No event is sent to a hub machine. The latch is released
    only after the mode is strict.
  - **Cancel on the warning (R10g).** After a pause with no resume
    data, and again after a failed pause (the old transfer was
    cancelled first), Cancel keeps Standard and calls
    `park(modelId)`. The row is `downloading` with no pause state,
    and no file is deleted. With `checkNetworkGate` mocked to Wi-Fi,
    no `DownloadTask` is created, and none of `checkNetworkGate`,
    `getNetworkStateAsync` and `start()` is called. The next hub open
    restores the row through `confirmingNetwork`: Wi-Fi starts it
    over, cellular asks, offline waits. When `park()` returns
    `rowSaved: false`, nothing shows. When it rejects, the error is
    caught, and the row is the `paused` one step 1 saved. A dismissed
    warning does what Cancel does. After each, the snapshot has
    `stoppedForStrict: false`.
  - **The strict sweep (R8).** One test per case, with the files made
    through the suite's file-system mock. Deleted: the partial of a
    `downloading` row with nothing running, of a `paused` row with no
    resume data and of a `failed` row with no resume data, and a
    catalog file with no row; and a row whose model has left the
    catalog spares nothing and throws nothing. Kept: the installed model's file; the partial
    of a `paused` row with resume data; the partial of a `failed` row
    with resume data; and a complete file of the row's model (for a
    `downloading` row, a `paused` row with no resume data, a
    `smoke-testing` row and a `smoke-failed` row). A size check that
    throws, or cannot run, keeps that row's model. A path mismatch
    with the installed id: `getModelPath()` returns a string that
    differs from the file's `uri`, `getModelId()` returns the
    catalog id, and the installed file is kept (`keepModelId`). The
    read-order race: `smokeTestSettled()` is awaited first; with a
    smoke test that commits (sets the model path, then clears the
    row) between the sweep's row read and its `getModelPath()` read,
    the installed file is kept. Call order, with mocked
    `smokeTestSettled`, `load`, `getModelPath` and `getModelId`: they
    run sequentially in that order, and none starts before the previous
    one resolves. When `smokeTestSettled()`
    never answers, 10 s later nothing is deleted. The sweep writes
    and clears no row. When `load()` rejects, and when
    `getModelPath()` or `getModelId()` rejects, nothing is deleted
    and the mode is still strict and saved. It runs once, after the
    save has settled, also when the save failed (before the message
    shows), and Try again does not run it again. It does not run
    after Cancel on the confirmation or on the warning, at launch in
    strict, when a hub opens, on a tap that only saves again, or on
    stepping out.
  - **R10h.** In strict, a finished download on disk goes through
    `verifying` and `smokeTest` to `complete`, and no network spy
    fires.
  - **R10i.** Launching and opening the hub delete no model file.
    Switching modes deletes neither the installed model's file nor a
    kept download's file (a `paused` row with resume data).
    The test is scoped to those two files: the `checkingExisting`
    sweep (BL9) deletes other orphans by design. What a switch to
    strict does delete is the strict sweep's test, above. A
    successful custom import in strict clears a
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
    Picking A shows no such confirmation. With a `failed` row for A
    (after `LEAVE_FAILED`), picking B shows none either. When
    `readDownloadRow()` rejects, neither this confirmation nor the
    import one shows, and the tap goes on as today. On a device where
    B gets the low-memory warning, in Standard the card shows first,
    then this confirmation, then "Replace model". In strict, picking B
    shows only the downloads-off alert: no low-memory warning card, no
    different-model confirmation, no "Replace model", and no
    `SELECT_MODEL`, so `retiringCurrent` never runs. The machine's own
    backstop is M14's test. A pick that outlasts a switch (R12): in
    Standard, with a model installed, tap a model that gets the
    low-memory card, turn strict privacy on from the hub's control,
    then tap the card's Continue. The downloads-off alert shows, the
    card closes, no "Replace model" shows and no `SELECT_MODEL` is
    sent. With the mode made strict while R10i's confirmation, and
    then "Replace model", is open (through the mode module's set
    function, since no control can be reached behind a sheet), Choose
    anyway and Replace each show the alert and send nothing. The same
    when the mode is made strict while `readDownloadRow()` is still
    pending after the press on B: when the read resolves, the alert
    shows and no confirmation opens.
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
- **Hub notices.** The hub shows one strict notice (R7), in strict and
  not in Standard. It has the "Strict privacy is on" title and the
  Step out button in both of its forms: R11's body with no model
  installed, R12's body with one, and never both. After a read
  failure the read-failure sentence starts R11's body, and R12's body
  never carries it. After a failed step 3 save, R11's body starts
  with the not-saved sentence instead. In both of those statuses,
  with no model installed, the notice has the Save strict privacy
  button: a press saves `'strict'` with no confirmation and no
  `stopForStrict()`, and when the save succeeds the sentence and the
  button go. The notice has no such button while the status is
  `saved`, or with a model installed. The Step out button opens R9's
  confirmation.
- **Hub Turn on strict privacy control (R7)**, one test over the
  states: in Standard it is shown and active in `selecting` (on the
list), and in `paused`, `failed` and `smokeFailed` (on
  the download screen); hidden in `pausing`, while a restore is pending (the provider's `restore` prop
  set, its `RESTORE_DOWNLOAD` not yet sent: hidden on the list's
  initial `selecting`), and in every other state listed in R7,
  including M7's check state. It is hidden in strict. It opens R8's
  confirmation. A press that reaches the control's handler after the
  machine has left rest, and before the screen has rendered again,
  starts no switch (the handler reads the actor's state).
  Two more cases: from `paused` with reason
  `user`, Turn on calls `stopForStrict()`, then the
  reason becomes `strict` and the label changes (M1; the `background`
  seed and its `APP_FOREGROUND` check are M1's machine test); from
  `selecting` with a saved
  `downloading` row (a restore after a kill that waited for Wi-Fi,
  then "Choose another model") and an incomplete file, Turn on shows
  no warning. The machine stays in `selecting` with its `modelId`,
  the row is unchanged, and the sweep deletes the partial.
- **Settings → Privacy section (R7).** It renders as the first section;
  it offers exactly two choices, Standard and Strict privacy, each with
  the copy from "The two modes, as the user reads them"; the current
  mode is selected; a first install shows no first-run prompt (R1).
- **Confirmations (R8, R9).** Both render the required text (R9's
  includes the continuation sentence, "a model download you start can
  carry on by itself…"); on R8,
  Cancel keeps Standard on and changes nothing, and Turn on runs the R8
  order; on R9, Cancel keeps strict, and Step out saves first and
  applies second. R8's confirmation has one form: it always carries
  "A download in progress pauses now and won't restart on its own",
  and its button always reads "Turn on". After Step out, nothing
  starts by itself (R9): with the spies of
  `strictPrivacyJournal.test.tsx` in place, a paused download saved
  and the Settings screen mounted, stepping out constructs no
  `DownloadTask` and calls none of `checkForUpdateAsync`,
  `initConnection` and `getNetworkStateAsync`. Each fires only when
  the user then starts its path.
- **Save-failure messages (R8 step 3, R9).** When the save rejects, the
  exact failure message shows, and the mode the gates report matches
  the message (strict in both cases). The message has two buttons,
  Try again and OK. Try again runs the save again: no confirmation
  shows and `stopForStrict()` is not called again. When that save
  succeeds, the message closes and the store holds the mode (after
  R9's, the gates then allow); when it fails, the message shows
  again. After OK on step 3's
  message, and after R3's read failure, a tap on the selected Strict
  privacy choice saves `'strict'` with no confirmation, no
  `stopForStrict()` and no sweep. A tap on a selected choice that is
  saved starts
  nothing. While the status is `unsaved`, Settings → Privacy shows the
  not-saved line under the Strict privacy choice. The line is still
  there after the section is unmounted and mounted again, and it goes
  when a save succeeds.
- **R8 step 5.** After a check is stopped mid-flight, the update row
  reads "Strict privacy is on. The update check stopped."
- **R3 read-failure copy.** With the store read failing, Settings →
  Privacy shows "Curated Journal couldn't read your privacy setting…",
  and with no model installed the hub notice starts with it. Both
  clear once a save succeeds (R4's status).
- **R5 iOS sentence.** With `Platform.OS` mocked to `'ios'`, the
  strict downloads-off alert contains "A download an older version of
  this app started may still be finishing on its own. The app itself
  sends nothing." before "Nothing was sent."; on Android it does not.
- **R5 refusals, tap by tap.** In strict, on the hub's screens, with
  the machine in the state that shows each control: Resume in
  `paused`, Retry in `failed` with a pause state, and, with the
  machine put in `awaitingWifi` and in `cellularConfirm` for the
  test, Try again and Download over cellular. Each shows the
  downloads-off alert with R5's title and a message that ends
  "Nothing was sent.", sends the machine no event, and calls none of
  `checkNetwork`, `start()` and `resume()`. A model in the list is
  the different-model test above. Each of these alerts has a Step out
  of strict privacy button, and pressing it opens R9's confirmation.
  Not refused in strict: Retry in `failed` with no pause state, and
  Try again in `smokeFailed` (R10h). The Check alert and the tip-jar
  alerts carry R5's titles, end "Nothing was sent.", and have no Step
  out button (their suites, below).
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
  app's scheme, `cur://`, no scheme), shows the dialog (with the full
  href; one copy in both modes) and never calls `Linking.openURL`.
  **Share…** calls `Share.share` with exactly `{ message: href }` (no
  `url`); a rejected `Share.share` is ignored and shows nothing; **OK**
  calls nothing. Share… keeps the dialog open: the test asserts the
  dialog is still shown after Share… and gone after OK. An empty href
  shows exactly "Curated Journal doesn't open links from your notes,
  in any mode. This link has no address. Nothing was sent." and no
  Share…. With `Platform.OS = 'web'`: when `navigator.share` is
  undefined, the copy variant shows with OK only; when it is defined,
  the main copy shows with Share…. An empty href shows the no-address
  variant on every platform. The dialog's message renders with
  `selectable` set.
  - **Positive control for the `Linking.openURL` assertions (this test
    only):** render the bare library with its lint rule disabled and no
    `onLinkPress`, tap a link, and assert the `Linking.openURL` spy
    fired. With that same spy, assert `NoteMarkdown` never fires it,
    and assert the shared handler's return value is not `true`.
  - The compile-time check: passing `onLinkPress` to `NoteMarkdown`
    does not type-check. A `@ts-expect-error` inside `__tests__` checks
    nothing, because `tsconfig.test.json` inherits the base
    `exclude: ["__tests__", …]` (issue #134 tracks that CI gap). So the
    check lives in a never-imported file that `tsc` does check,
    `src/components/NoteMarkdown.typecheck.tsx`, holding the
    `@ts-expect-error` line in an exported component, so lint stays
    clean. It must pass lint (`expo lint`). The
    coverage test and its allowlists look only for the network APIs
    listed above, and this file uses none, so it needs no entry. A
    runtime test: a cast-in `onLinkPress` is
    never called, because the wrapper sets `onLinkPress` after the
    props spread.
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
      away, and nothing transfers after the app is killed. If the transfer is still running when the hub reopens, the hub shows it running, with no second download (DC5).
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
      request, and `stopForStrict()` reports nothing running. Note
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
      from notes" dialog with its full address, and opens nothing.
      Share… opens the OS share sheet with the address (Copy is there);
      OK closes the dialog. iOS: tap a link in the journal and in
      `GraphNodeSheet`, then Share…, and confirm the share sheet presents
      above the dialog (a share sheet presented while a Modal closes
      is a known react-native failure; likely, not device-verified).
- [ ] Tap a link inside a graph node's sheet. The dialog shows above
      the sheet, and OK returns to it.
- [ ] In strict privacy, with a proxy log running: tap a note link,
      then Share…, then Copy. Confirm no request is made.
- [ ] Turn on strict from Settings when the download can't be kept,
      then tap Cancel on the warning. The app stays in Standard, and
      nothing starts from Settings, on Wi-Fi either. The next time
      you open the model hub, the download starts over: at once on
      Wi-Fi, after asking on cellular, and after waiting for Wi-Fi
      with no connection.
- [ ] Android, strict sweep (R8): force-stop the app mid-download
      (`adb shell am force-stop …`), relaunch, and turn strict privacy
      on in Settings without opening the model hub. No warning shows.
      The partial `.gguf` is gone from the app's documents folder,
      and the installed model still answers. Open the hub: the
      download shows paused, with "This download will start over when
      you resume." Then repeat with a download paused by its Pause
      button: its partial is still there, and after stepping out
      Resume continues from where it stopped.
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
- [ ] While a switch runs (R8): turn strict privacy on from Settings
      mid-download and tap around while it pauses. Nothing else
      responds until the switch ends, and on Android the back button
      does nothing. On iOS, tap Step out of strict privacy on a hub
      alert: the alert closes and the confirmation shows (one sheet
      closing as another opens is the case to watch).
- [ ] Strict privacy with no model: the hub notice shows, Import custom
      .gguf works and makes no request, and stepping out from the hub
      works.
- [ ] iOS: watch a proxy log at launch for traffic from `expo-iap`'s
      launch-time listeners, before and after #119. This is evidence
      for #119.

## Resolved questions (2026-11-16 to 2026-11-27)

The owner answered these on 2026-11-16, 2026-11-21 and 2026-11-27; the
entry on #133 also records the owner's direction of 2026-11-23. Each
question is kept as it was asked, with the answer and where the spec
encodes it.

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
  **Narrowed (owner, 2026-11-27):** the third cause, "no live handle",
  is retired, and Cancel no longer starts the download itself. It
  waits for the model hub (the rulings of 2026-11-27, below).
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
  is written by the model or an imported OKF bundle, so the app can't
  tell a link you wrote from one it invented, and opening its links is
  the riskiest traffic. A tap shows a dialog
  with the full address and **Share…** and **OK**; Share… uses core
  `Share.share` (no new dependency). Standard's traffic is only the
  kinds rule 9 ¶2 lists, so no INTENT amendment is needed. A download
  the user started that continues after reopening is read as part of
  "model downloads the user starts"; no amendment. Rule 11's
  share-sheet exception names files; this ruling reads it as covering a
  text hand-off (a link address). *Naming
  (informational):* the ladder is Strict ⊂ Standard ⊂ Connected (future,
  ROADMAP Step 3, Curated Thoughts' name for its sync tier; naming it
  does not close the "Shape of the sync mode" open decision); Curated
  Thoughts' "Ephemeral" is not adopted (INTENT rule 2); a future Connected
  spec may add opening note links as a named unlock. *Strict copy:* the
  on-screen strict-privacy text stays unqualified, with no iOS caveat.
  *Encoded in:* path 7, Names, the Standard and strict copy, R4, R5, R6,
  R8, R9, Verification, Open questions.
- **Owner rulings on #133, 2026-11-21 — the download controller.**
  Three of them change this spec. *#133 OQ-1:* reopening the hub while
  a transfer is running attaches to it; it does not pause and
  continue. That replaces R10b's "a restore stops a live transfer
  first". *#133 OQ-5:* `stopForStrict()` and `TRANSFER_STOPPED` are
  built in #133, and this spec calls them. *#133 OQ-8:* the iOS
  foreground session (`sessionType: 'foreground'`, OQ-7 here) stays in
  this spec's Step 2. Owner direction, 2026-11-23: this spec drops its
  own download-race fixes, supplies the controller's `gate`, maps a
  refusal to a pause, and releases the latch in a `finally` around R8's `try`, which encloses steps 1 to 6, and in an R9 backstop. *Encoded in:* Baseline (DC1–DC8),
  Step 2 machine changes, R4, R7, R8, R9, R10a, R10b, R10g, Version
  cost, Verification.
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
- **Owner rulings, 2026-11-27 — the switch to strict is cut down:
  Cancel parks, no pre-check, the strict sweep.** Three review rounds
  kept finding defects in one place: the part of R8 and R10g that ran
  outside the hub, before and after the pause. The owner took both
  cuts that the review of that text proposed, and set a condition on
  the second.
  - *Cancel parks.* On R10g's warning, Cancel always calls `park()`,
    and the download waits for the model hub. There is no `start()`
    and no network check from Settings. This narrows the follow-up
    answer to OQ-6, and supersedes the lead ruling of 2026-11-16 that
    Cancel restarts at once on Wi-Fi.
  - *No pre-check.* The pre-check and the merged warning are retired.
    A row with nothing live to stop is not warned about. The flow is:
    confirm, `stopForStrict()`, warn only if a live transfer could not
    be kept, apply, save. This retires OQ-6's third cause, "no live
    handle".
  - *Condition: storage.* A dead partial model file can be 1 to 3 GB,
    and a user in strict privacy may never download again. So
    switching to strict removes partial model files that nothing can
    resume, best effort and with no warning. Never the installed
    model's file, and never a file that a kept paused row with resume
    data owns. The hub's existing sweep was checked first, and it
    does not cover this under strict (R8, "The strict sweep", says
    why).

  Removed with them, because nothing can reach it any more: the
  pre-check's wait; the hub's M3 event and the provider's
  registration with the switch flow; the 10 s bound on a network
  check made from Settings; and every `start()` branch of Cancel.
  *Encoded in:* Why this cycle exists, INTENT check item 8, survey
  path 1, Baseline DC4, Step 2 machine changes, R8, R9, R10a, R10f,
  R10g, R10i, Version cost, Out of scope, Verification.

  These rulings settle five of the eight questions raised since this
  spec moved onto #133. The owner named 3, 6 and 8. Questions 1 and 4
  follow from the rulings and were not asked again; the owner can
  reopen either.
  - **Question 1 — `not-keepable` because the transfer failed.**
    *Asked:* While the strict
    pause runs, or from a closed-hub transfer that failed earlier,
    #133's result adds a fourth cause to OQ-6's three. Default: same
    warning, and Cancel restarts on Wi-Fi (R8 step 1, R10g). Confirm,
    since it extends an owner ruling.
    **Settled by the rulings:** the flow warns "only if a live
    transfer could not be kept". A transfer that fails while the
    strict pause runs was live, so it gets the same warning. One that
    failed earlier, with the hub closed, was not, so it gets none.
    Cancel no longer restarts on Wi-Fi. *Encoded in:* R8 step 1,
    R10g.
  - **Question 3 — The pre-check's `load()` rejects** (row unreadable
    in Settings). *Asked:*
    Default: the plain confirmation, nothing removed, M8 handling any
    leftover `downloading` row later. Alternative: refuse to switch,
    which would let a database hiccup block strict privacy.
    **Answer:** There is no pre-check, so the case is gone. A row
    that cannot be read when the sweep asks for it only means the
    sweep deletes nothing. *Encoded in:* R8.
  - **Question 4 — Defensive Cancel with a hub mounted** (unreachable
    under DC4). *Asked:*
    Default: Cancel only releases the latch, the row stays `paused`, and
    the user taps Resume. This differs slightly from OQ-6's "Cancel
    resumes the download" in a case that cannot occur.
    **Settled by the rulings:** Cancel parks wherever it is tapped, so
    there is no second branch to choose, and the flow no longer needs
    to know whether a hub is mounted. In the case that cannot occur,
    the hub shows the download paused and its Resume starts it over.
    *Encoded in:* R10g.
  - **Question 6 — What Settings shows while R8's pre-check waits.**
    *Asked:* The
    pre-check awaits the controller's `load()` before the confirmation
    can show. That is normally immediate. At worst it is about 70 s of
    foreground time, behind a hub pause that is still settling after
    the hub closed (#133's bounds). Default: the tapped control starts
    nothing more while it waits (R8, "One switch at a time"), and what
    it shows is left to the plan, the same answer as question 5.
    Alternative: a time limit, after which the plain confirmation shows
    as it does when `load()` rejects (question 3). That could miss the
    merged warning, and M8 would then handle the leftover row.
    **Answer:** Nothing waits. The confirmation shows at the tap.
    *Encoded in:* R8.
  - **Question 8 — R10g's Cancel starts a download from Settings.**
    Drafted in review on 2026-11-27 and answered the same day, before
    it was added to this spec. *Asked:* INTENT's
    out-of-scope item "Silent model installs" says models enter the
    device "only through an explicit user action in the model hub".
    Cancel on R10g's warning, tapped in Settings on Wi-Fi, starts a
    download over with no hub open (INTENT check, item 8). The owner
    ruled that this Cancel resumes the download (OQ-6, follow-up), but
    the item's words were not weighed then. Default: as specified. It
    is read as putting back a download the user started in the hub, on
    an explicit tap whose warning says so. Alternative: Cancel never
    starts a transfer outside the hub. It calls `park(modelId)` on any
    network, and the download starts over when the hub next opens,
    through the network check, as it already does on cellular and
    offline. That follows the item's words. It also removes the
    network check made from Settings and its 10 s limit, every
    `start()` branch of R10g's Cancel, and the only transfer that
    begins outside the hub. The warning's sentences about Cancel would
    then say that the download waits in the model hub.
    **Answer:** The alternative. INTENT's words are followed.
    *Encoded in:* INTENT check item 8, R10g.

## Open questions for the owner

The two raised in review (2026-11-16) were answered on 2026-11-21
(see the owner ruling under Resolved questions):

- **Strict copy on iOS before #119.** The on-screen strict copy stays
  unqualified, with no iOS caveat. The caveat lives in the policy page
  (R15) and the iOS downloads-off alert (R5), as already written.
- **INTENT rule 9, paragraph 2.** No amendment is needed: no link opens
  in any mode, so Standard's traffic is only the kinds ¶2 lists. A
  download the user started that continues after reopening is read as
  part of "model downloads the user starts".

Eight questions have been raised since this spec moved onto #133: five
on 2026-11-23 (1 to 5), and three in review after that (6 to 8). The
owner's rulings of 2026-11-27 settled 1, 3, 4, 6 and 8, which are
under Resolved questions as they were asked. Three are open: 2 and 5,
the two bullets below, and 7. They keep their numbers and their
wording.

New, raised 2026-11-23 by the #133 rebase (each edit above assumes the
recommended default):

- **2 — `rowSaved: false` from `stopForStrict()` or `abandon()`.** Default:
  go on silently; the controller writes the row again (DC7) and M8
  makes a leftover row safe. Alternative: a message, or blocking the
  switch.
- **5 — What the dialog shows while R8 step 1 runs** (60 s worst case
  under #133's bounds). Default: left to the plan. If the owner wants
  specific copy, it belongs in R8.

New, raised in the review of "While a switch runs" (the edits above
assume the recommended default):

- **7 — The whole app waits while a switch runs.** From the tap until
  the switch ends, one sheet covers every screen, the journal
  included, and its waiting states cannot be dismissed (R8, "While a
  switch runs"). That is normally well under a second. The worst case
  needs a stuck database or a stuck pause: about 70 s before the
  confirmation shows (question 6), 60 s for step 1 (question 5), and
  up to 30 s more after Cancel or Turn on and remove on R10g's
  warning. The owner's ruling that #133's "Pausing…" screen has no
  buttons covers one hub screen, not the whole app. Default: as
  specified. Alternative: show the wait only where the switch was
  started and leave the rest of the app usable. The two rules in
  state still hold then (no hub loads under a switch; a mounted hub
  is held), but R10g's warning would have to appear over whatever
  screen the user had moved to.

Notes on the open questions, added 2026-11-27. The questions stand as
asked.

- Question 2 says M8 makes a leftover row safe. That holds when the
  hub next opens under strict. If the user steps out before any hub
  has opened, the row restores as a Standard continuation, through
  the network check (R9).
- Question 7 counted its worst case before the rulings of 2026-11-27.
  Nothing waits before the confirmation now (question 6 is settled),
  and Cancel's wait is one row write. What is left is 60 s for step 1
  (question 5) and, after it, at most a row write, the mode save and
  the sweep's wait for the smoke test and its reads.
