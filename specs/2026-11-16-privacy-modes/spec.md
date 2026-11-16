# Spec: privacy modes — strict privacy and Standard, the default mode

**Status: Draft** — first written 2026-11-16; amended the same day
(owner answers OQ-1 through OQ-8, then review findings applied).
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
- Two questions are open for the owner (Open questions for the owner,
  at the end). Step 2 waits on those answers and on the owner's
  approval of this spec.

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
  privacy and asks to resume (R10). A successful custom import, which
  the user chooses, abandons it (R10i).
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
  (PR [#125](https://github.com/equationalapplications/curated-journal/pull/125),
  9.2.1, spec `specs/2026-11-16-download-cellular-continuation/spec.md`;
  R6).

## INTENT check

Checked against INTENT.md (static since 2026-11-04) and ROADMAP v1.2.
No requirement here contradicts INTENT on intent. The check found five
tensions. INTENT wins each one, or the owner has ruled on it:

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
   (path 8). The owner confirmed the block in both modes (OQ-4), and
   #118 ships it now as a PATCH. Once #118 lands, Standard is today's
   behavior with no exception, and Step 2 only keeps the block in place
   (R6). A later review found a second gap: a download the user started
   carries on by itself after a background pause, and restarts by
   itself when the hub opens after a kill, and both skip the cellular
   prompt that a fresh download shows. The owner kept the continuation
   (the user started the download) and ruled that both paths go through
   the same network check (2026-11-16). #124 ships that now as a PATCH
   (PR #125), which extends the check to every continuation, manual
   Resume and Retry included, and Step 2 only keeps it (R6). The
   Standard copy names the continuation, so its "Nothing else goes
   online on its own" leans on rule 9 ¶2's "else" (see the second open
   question).
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
5. **Links in notes, and downloads that outlive the app.** Rule 9 ¶2's
   list of default-mode traffic does not name a tap on a link in a
   note. Today's code opens such links only on the user's tap, so
   "nothing else runs on its own" holds, and the owner ruled that
   Standard keeps web links (OQ-3) and nothing else (OQ-8). The
   on-screen copy names web links, so the mode says everything it
   allows (rule 12). Separately, the owner ruled (OQ-7) that iOS
   downloads run in a foreground session. That changes how a Standard
   download behaves on iOS while the app is suspended, and the owner
   accepted that cost.

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
| 1 | Model download, fresh start | `startDownload` in `src/services/modelDownloadService.ts` (`expo-file-system` `DownloadTask`, User-Agent from `src/lib/buildUserAgent.ts`). It sets no `sessionType`, so on iOS the installed expo-file-system 58.0.13 runs it in a background `URLSession`, which can keep transferring after the app is suspended or killed (Android ignores the option; its transfer runs inside the app process). Reached from `modelHubMachine` state `downloading` when the machine holds no resume data (`runDownload` picks `startDownload` or `resumeDownload` by `pauseState?.resumeData`). With PR #125, `downloading` is entered only from `confirmingNetwork` on Wi-Fi and from `cellularConfirm` on `CELLULAR_CONFIRM`. `confirmingNetwork` is reached by `SELECT_MODEL` (through `retiringCurrent` and `checkingExisting`), by `CHECK_NETWORK` from `awaitingWifi`, by `RESTORE_DOWNLOAD` of a `downloading` record when the hub opens (`src/app/model-hub/_layout.tsx`, through `checkingExisting`), and by the continuations `RESUME`, `APP_FOREGROUND` and `RETRY` (path 2), which reach `startDownload` when their pause state has no resume data. On `main` before PR #125, the restore, `RESUME`, `APP_FOREGROUND` and `RETRY` skipped `confirmingNetwork` and went straight to `downloading`. | Hugging Face (`huggingface.co`, URLs in `src/catalog/modelManifest.ts`) and the file hosts it redirects to | The user. A download the app was killed during restarts by itself when the hub next opens; #124 (PR #125) routes that restart through the network check, which asks first on cellular. | Allowed | Blocked |
| 2 | Model download, resume | `resumeDownload` (`DownloadTask.fromSavable`). Reached from `downloading` when the machine holds resume data, after the continuations `RESUME` (`src/app/model-hub/download.tsx`), `APP_FOREGROUND` after a background pause (automatic), and `RETRY` from `failed` with a saved pause state. With PR #125 each of them goes through `confirmingNetwork` first; on `main` before PR #125 each went straight to `downloading`. | Same as 1 | The user, or the app on return to the foreground (a download the user started). With #124 (PR #125), every continuation goes through the network check, which asks first on cellular. | Allowed | Blocked |
| 3 | Update check | `checkForAppUpdates` in `src/lib/updateCheck.ts` (`expo-updates` `checkForUpdateAsync`, then `fetchUpdateAsync`). Reached only from the Check button in `src/components/settings/UpdateCheckRow.tsx`. | Expo's update service (`u.expo.dev`). It receives the platform, runtime version, channel, current and embedded update IDs, and a random ID for this install (the `EAS-Client-ID` header, set by `expo-updates`' native downloader). | The user | Allowed | Blocked |
| 4 | Launch-time native update check | Off: `updates.checkAutomatically: 'NEVER'` in `app.config.ts`, asserted by `__tests__/appConfig.test.ts` and checked on every built artifact (VERSIONING.md train step 4). | — | Nothing | Never runs | Never runs |
| 5 | Tip jar (iOS, Android) | `openTipJar` in `src/lib/tipJarStore.ts` (`expo-iap` `initConnection`, `fetchProducts`, `getAvailablePurchases`, `requestPurchase`, `finishTransaction`, `endConnection`). Reached from Open and the tip buttons in `src/components/settings/TipJarSection.tsx`. Gated today by `canUseStorePurchases()` at the start and before `requestPurchase`. | Apple App Store or Google Play | The user | Allowed | Blocked (alert exists) |
| 6 | Support link (web build only) | `Linking.openURL(SUPPORT_PAYPAL_URL)` in `TipJarSection.tsx`. Already gated by `canOpenSupportLink()`. | PayPal | The user | Allowed | Blocked (alert exists) |
| 7 | Links inside notes | `react-native-markdown-display` 7.0.2: its default `link` and `blocklink` rules call `openUrl`. No renderer passes `onLinkPress`, so a tap calls `Linking.openURL(href)` at once, for any scheme: `http(s)`, `mailto:`, `tel:`, other apps' schemes, and the app's own `cur://` links (markdown-it 14.3.3 drops only `javascript:`, `vbscript:`, `file:` and non-image `data:` links). Note text renders through it in `src/components/journal/JournalPane.tsx`, `src/app/entry/[factId].tsx` and `src/components/graph/GraphNodeSheet.tsx`. PR #120 (`a08cc92` on `fix/no-remote-images`) routes all three through one wrapper, `src/components/NoteMarkdown.tsx`, which forces #118's `markdownRules`; a `no-restricted-imports` lint rule in `eslint.config.js` forbids value-importing the library anywhere else (type imports, such as `markdownRules.tsx`'s `import type { RenderRules }`, are allowed). The wrapper passes every other prop through, `onLinkPress` included. That text comes from the model or from an imported OKF bundle. | Whatever site, app or service the link names | The user (a tap) | `http`/`https`: opens in the browser (owner, OQ-3). Any other scheme, or none: blocked with an alert (owner, OQ-8) | Blocked, every scheme |
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

## The two modes, as the user reads them

### Names

- **Strict privacy.** This is the charter's name.
- **Standard.** The default mode's on-screen name (owner, OQ-1). In
  code the mode stays `'default'`.

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
> - To open a web link in one of your notes, when you tap it. Your
>   browser opens it, and that website gets the link.
>
> Nothing else goes online on its own. A model download you started
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
> Files you choose in a file picker, or send with the share sheet, go
> where you send them.
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
  the app.** Step 2 moves iOS downloads to a foreground session
  (R10b, owner OQ-7), so a download started *after* Step 2 no longer
  keeps running after the app is killed. But a download that a version
  from before Step 2 started may still be running in a background
  `URLSession`, which survives the OTA update and the relaunch, and
  which nothing in the relaunched app — strict privacy's pause
  included — can reach or cancel from JavaScript. Like the StoreKit
  gap above, this is not something Step 2 can fix from JS; it drains
  as pre-Step-2 transfers finish on their own. Until it has drained,
  the downloads-off alert's closing line (R5) may not claim more than
  the app controls: the strict-privacy download alert adds a sentence
  — "A download an older version of this app started may still be
  finishing on its own. The app itself sends nothing." — so "Nothing
  was sent" stays true about what the app sends, without promising
  that no bytes are moving.

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
  1 and 2), `canCheckForUpdates()` (path 3) and `canOpenNoteLinks()`
  (path 7).
- One error type for a gate refusal, in a module with no native
  imports, so that the hub's state machine can import it (R10a).

Each module that can reach the network also asks its gate itself, at
the point where it acts, the way `openTipJar` already does:

- `modelDownloadService.ts`: before a start and before a resume. A
  refusal throws the gate error.
- `updateCheck.ts`: before the check, and again before the fetch.
- `tipJarStore.ts`: at the start of `openTipJar` and before
  `requestPurchase` (both exist), and also between its steps, so a jar
  that is still opening when strict turns on stops at the next one:
  - in `openTipJar`, after `initConnection` and before
    `fetchProducts`, and again before `recoverUnfinished`;
  - in `recoverUnfinished`, before `getAvailablePurchases`;
  - in `handlePurchase`, before `finishTransaction`.

  A refusal closes the session as R8 step 4 does.

A screen asking first is good manners. It is not the guarantee. Path 8
needs no gate: #118 makes remote images never load, in either mode
(R6). The plan may rename these functions. It may not add a second
place that decides the mode. *(Rule 11; ROADMAP Step 2: "every
network-capable code path in the app asks the mode before acting".)*

**R5 — Strict privacy blocks every path.** In strict privacy, paths 1,
2, 3, 5, 6 and 7 start nothing (path 8 is blocked in both modes by
#118). A blocked tap shows an alert that explains why and how to step
out, and never makes a silent network call. Every alert ends "Nothing
was sent."

| Tap | Title | Message |
|---|---|---|
| A model in the hub list, Resume, Retry, and (defensively) Try again (`CHECK_NETWORK`) and Download over cellular (`CELLULAR_CONFIRM`) | Downloads are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, and models download from the internet. To get a model, step out of strict privacy, download it, then step back in. Nothing was sent. |
| Check (app updates) | Update checks are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, so it can't check for updates. To check, step out of strict privacy in Settings → Privacy, check, then step back in. Nothing was sent. |
| Open or a tip (tip jar) | Tips are off in strict privacy | The existing copy (`STRICT_PRIVACY_TIP_MESSAGE`), changed to say "step out of strict privacy in Settings → Privacy". |
| Support (web) | Tips are off in strict privacy | The existing `STRICT_PRIVACY_LINK_MESSAGE`, with the same Settings → Privacy change. |
| A link in a note, any scheme | Links are off in strict privacy | Strict privacy keeps Curated Journal from opening links, in your browser or in another app. This link goes to `<host>`. Nothing was sent. (A link with no host, such as `mailto:` or `tel:`, shows the link itself.) |

"Try again" and "Download over cellular" should never show in strict:
a strict hub never runs the network check (R10f, R10j). They are in the
table so that, if either is ever reached in strict, the tap is refused
with the alert instead of starting anything. "Import custom .gguf" is
not in this table: it stays available in strict privacy (R11). Alerts
in the model hub also offer a "Step out of strict privacy" button,
because Settings may be out of reach there (R7). *(Rule 11 and its
out-of-scope item; the tip-jar alert pattern rule 11 already
requires.)*

**R6 — Standard, the default mode.**

- Paths 1, 2, 3, 5 and 6 run when the user starts them, as they do
  today.
- **A download the user started carries on** (owner, 2026-11-16).
  There are two automatic continuations:
  - **Foreground resume.** After a background pause, the download
    resumes when the app returns to the foreground, from its resume
    data. If the OS killed the app while it was in the background, the
    row was already saved as `paused`, so the relaunch shows it paused
    and it waits for Resume.
  - **Restore after a kill.** If the app was killed while it was
    downloading in the foreground, the row still says `downloading`
    with no pause state (the `downloading` state's entry saves
    `pauseState: null`), so when the hub next opens the download
    starts again **from the start**. On iOS with the hub closed, a
    download also stops while the app is suspended (R10b) and carries
    on only when the hub next opens.
- **Every continuation passes the network check** (#124; PR #125,
  9.2.1, spec `specs/2026-11-16-download-cellular-continuation/spec.md`).
  Every continuation of an existing download goes through the same
  check as a fresh download (`confirmingNetwork`): the restore after a
  kill, the foreground resume, a manual Resume from `paused`, and
  Retry from `failed` with a pause state. On Wi-Fi it goes ahead with
  no prompt, on cellular the cellular prompt comes first, and offline
  it waits in `awaitingWifi`. The machine marks these with a
  `continuation` flag. On `main` before PR #125 none of them was
  checked: the restore went from `checkingExisting` straight to
  `downloading`, and `APP_FOREGROUND`, `RESUME` and `RETRY` went
  straight to `downloading` (`src/machines/modelHubMachine.ts`). **#124
  delivers this now, as a PATCH, before Step 2.** Step 2 only has to
  keep it, and its tests, in place. The Standard copy names it ("A
  model download you started can carry on by itself… and it asks first
  if you're on cellular data"), and with PR #125 that holds for every
  continuation in the hub. R10g's Cancel runs outside the hub; R10g
  says how it keeps the same promise.
- **A declined prompt.** Cancel on the cellular prompt sends
  `CELLULAR_CANCEL`.
  - For a continuation, the machine goes to `paused` (reason
    `restored`), keeps its pause state, and saves the row as `paused`
    with it. The download screen stays in front, showing Paused and
    Resume, and a later Resume runs the check again (and asks again on
    cellular). A declined restore of a download killed in the
    foreground has no pause state, so its row becomes a `paused` row
    with none: Resume starts it over, and R10j's size check runs on it
    at the next hub open.
  - For a fresh download, the machine goes to `selecting`, as before,
    and the download screen dismisses to the list.
- **Backgrounding during the check or the prompt.** For a
  continuation, `APP_BACKGROUND` in `confirmingNetwork` or
  `cellularConfirm` goes to `paused` (reason `background`), with no
  live transfer to pause, and keeps the pause state. The next return to
  the foreground runs the check again.
- **Offline: Try again, or Choose another model.** `awaitingWifi`
  shows Try again (`CHECK_NETWORK`) and "Choose another model"
  (`LEAVE_WAITING` → `selecting`). Leaving keeps the saved row ("not
  now"), so a continuation resumes on a later hub open, and the list
  and "Import custom .gguf" are reachable.
- **An abandoned continuation's row is cleared** (PR #125). A
  successful custom import clears it: before the import commits the
  model's identity, and again on `IMPORT_SMOKE_OK`. Picking a different
  model clears it too. Otherwise a later hub open would restore the
  abandoned download and, on success, replace the user's chosen model
  without a "Replace model" confirmation. Picking the same model keeps
  its progress. R10i lists these as deletions the user causes.
- **The prompt and the retry show on whichever hub screen is in
  front** (review, 2026-11-16). A restore lands on the download screen
  (`router.replace('/model-hub/download')` in `_layout.tsx`), with the
  list unmounted, so the cellular prompt and the Wi-Fi retry must not
  live only on the list. PR #125 does this:
  - the cellular sheet has one owner, `CellularConfirm`
    (`src/components/model-hub/cellular-confirm.tsx`), rendered once by
    the hub layout, and it closes the sheet whenever the machine leaves
    `cellularConfirm`;
  - the download screen keeps its download framing while the check
    runs, shows "Checking your connection…" in `confirmingNetwork` and
    the shared `AwaitingWifi` component
    (`src/components/model-hub/awaiting-wifi.tsx`) in `awaitingWifi`,
    and shows "Starting download…" only in `downloading`;
  - the download screen dismisses to the list on any transition into
    `selecting` (not the initial `selecting` of a restore mount).

  Step 2 keeps all of this.
- **Known gaps, out of scope here** (pre-existing; filed from PR #125's
  review). [#126](https://github.com/equationalapplications/curated-journal/issues/126):
  a Wi-Fi drop after the check falls back to cellular silently, which
  also affects fresh downloads, and an Ethernet connection counts as
  offline. [#127](https://github.com/equationalapplications/curated-journal/issues/127):
  returning to the foreground while the background pause is still in
  flight can drop the resume data. The Standard copy's "asks first if
  you're on cellular data" is true when each continuation starts; #126
  is about a network change after that.
- On iOS, a download stops while the app is suspended with the hub
  closed, and never outlives the app process (R10b, owner OQ-7).
- **Web links only** (owner, OQ-3 and OQ-8). A tap on an `http` or
  `https` link in a note opens it in the browser, as today. The
  on-screen copy names this. Every other scheme (`mailto:`, `tel:`,
  other apps' schemes, the app's own `cur://` links) and a link with no
  scheme are blocked, with this alert:

  > **Only web links open**
  > Curated Journal opens only web links from your notes. This link is
  > a `<scheme>` link. Nothing was sent.

  A link with no scheme reads "This link has no web address." in place
  of the second sentence.
- Every note link goes through one decision point: a shared
  `onLinkPress` that `src/components/NoteMarkdown.tsx` sets itself.
  Its props leave `onLinkPress` out, as they already leave out
  `rules`, so no caller can replace it. It asks `canOpenNoteLinks()`
  (strict blocks every scheme, R5), checks the scheme, and opens the
  link itself or shows the alert. It never returns `true`, which would
  make the library call `Linking.openURL` on its own.
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
    hub machine is in a state with nothing network-capable in flight:
    `selecting`, `paused` (any reason), `failed` or `smokeFailed`. The
    list (`index.tsx`) shows it in `selecting`; the download screen
    (`download.tsx`) shows it in `paused`, `failed` and `smokeFailed`.
    It is never shown while a restore is still pending. It is hidden in
    every other state: `checkingExisting`, `confirmingNetwork`,
    `awaitingWifi`, `cellularConfirm`, `downloading`, `verifying`,
    `smokeTest`, and also `retiringCurrent`, `customImport` and
    `complete`.
  - Mid-download, the user taps Pause first, an existing and fully
    specified path, and the control appears in `paused`. While the
    hub waits for Wi-Fi, the user taps "Choose another model"
    (`LEAVE_WAITING`, PR #125), which keeps the row and lands in
    `selecting`, where the control shows. On the cellular prompt,
    Cancel lands a continuation in `paused` (PR #125). With the machine
    at rest, R8's confirmation cannot race the machine, and no sheet
    can stack on the cellular prompt (`CellularConfirm`).
  - From `paused`, turning strict on only changes the label (R10e): the
    machine takes the `strict` pause reason (R10a), so a later return
    to the foreground does not resume it. From `selecting`, `failed`
    or `smokeFailed` nothing is in flight, and R8's pre-check runs on
    the saved row, as it does in Settings. ("Choose another model"
    while a restore waits for Wi-Fi, for example, leaves the hub in
    `selecting` with a `downloading` row.)
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
> checks, tips, and links in your notes stop until you step out again.
> A download in progress pauses now and won't restart on its own; you
> can resume it after you step out. You won't get app updates,
> including security fixes, while strict privacy is on. Your journal
> keeps working, and you can still import a model file that's already
> on this device.
> [Cancel] [Turn on]

If the app can already tell, before this confirmation, that a download
can't be kept (its row says `downloading`, but the download service
holds no live transfer for it), R10g's warning is merged into the
confirmation. It **replaces** the download sentence ("A download in
progress pauses now and won't restart on its own; you can resume it
after you step out."), which would be untrue there, rather than being
added after it, and the button reads "Turn on and remove".

This pre-check looks only at `downloading` rows. A `paused` row is
never warned about here: it is kept as it is, and if it has no resume
data it shows R10e's "will start over" line, and R10j checks its file
at the next hub open. For a `downloading` row, "no live transfer" alone
is not enough: a download that **completed** while the hub was closed
leaves a `downloading` row with no live transfer and no service record.
So before the app treats such a row as unkeepable, it runs the plain
file check on the file the row points at: `verifyDownload` in
`src/services/modelDownloadService.ts` (the file exists and its size
matches the manifest). From Settings it does not run the hub machine's
restore states: the hub is closed and its actor is stopped. Settings
mounts no hub machine, and the dialog never waits on a model load. If
the file is complete, the row is not unkeepable: no warning shows, and
the smoke test runs later, when the hub next opens and its normal
restore runs (R10f, R10h). Only a `downloading` row whose file fails
the size check counts as "no live handle".

The hub's own control (R7) opens this confirmation only while the hub
machine is at rest, so there is no transfer to pause. From `paused`
only the label changes (R10e). From `selecting`, `failed` or
`smokeFailed`, the pre-check above runs on the saved row, as it does
in Settings.

On Turn on, in this order:

1. A live model download pauses (R10a, R10c). First its row is saved
   as `paused`, with no pause state yet. Then the transfer pauses, and
   the row is saved again with its pause state. Pausing sends nothing;
   it stops the transfer. It comes first because only the pause shows
   whether the download can be resumed later. If it can't, R10g's
   warning shows now, before anything below happens. Nothing may
   resume or restart the download between this step and step 2.
   If the transfer finishes between the first save and the pause (the
   task is no longer `active` when the owner checks it), the owner runs
   `verifyDownload` before it reports "can't be kept". A complete file
   is never warned about or removed: the row stays `paused`, and R10j
   takes it to verification and the smoke test at the next hub open.
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
Standard, because the mode was never saved. The row was saved as
`paused` before the pause, so the hub shows the download as paused and
does not restart it; the user resumes it. If the app dies before the
pause state is saved, the row has no resume data (on iOS the resume
data is lost; on Android the byte offset is). The hub's restore runs
the size check first (R10j); the file is incomplete, so the row stays
paused with "This download will start over when you resume" (R10e),
and the user's Resume starts the download over. Like every
continuation, that Resume goes through the network check first, so on
cellular it asks before it restarts (R6; PR #125). This corner is
accepted. Without the first save, the row would still say
`downloading`, and the relaunch would restart the download from zero
by itself when the hub opens (behind #124's network check, PR #125).

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
> - to leave a tip through the App Store or Google Play;
>   (on the web build, this bullet reads "to open the Support page,
>   which PayPal runs", matching the Standard copy);
> - to open a web link you tap in a note. Your browser opens it, and
>   that website gets the link.
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
turned on in Settings. Mid-download, Settings is reachable mainly
during a model change, with the hub closed, and the hub's state machine
stops when the hub closes. So the pause owner is the download service
(`modelDownloadService.ts`), not the hub machine:

- The service keeps one record of the live download: its task, its
  model id, and a way to save the download row. The hub hands these
  over when it starts or resumes a download, so the service can pause
  and save with the hub closed. The service clears the record when the
  transfer completes, fails, is cancelled or is paused. (Today
  `cancelActiveDownload()` is the only thing that clears `activeTask`,
  and nothing calls it; the service also knows neither the model id
  nor the store.)
- The strict pause checks the task's state first. `pauseAsync()`
  throws unless the task is `active`, so any other state counts as "no
  live transfer", not as an error.
- It saves the row as `paused` (no pause state yet), pauses, saves the
  row again with its pause state (or none), and reports whether the
  download can be resumed later (R8, step 1, and its kill window).
- The hub machine has a path for this too: it hears a machine event
  (named by the plan, for example `STRICT_PRIVACY_ON`) and moves to
  `paused` with a new pause reason, `strict`, taking the pause state
  the owner produced. Settings is not interactive while the hub is
  mounted, and popping the hub unmounts its actor, so from Settings
  this path does not run. The hub's own control (R7) shows only while
  the machine is at rest, so it never turns strict on with a transfer
  in flight; from `paused` the machine just takes the `strict` reason.
  With a transfer in flight, this path runs only on the web build and
  as a safety net, and the service's pause is what stops the transfer.
  The machine never pauses for strict on its own, so no second pause
  races the first, and it never starts a second transfer (R10b). This
  pause reason lives in the machine's context only; the download row
  stores none (R10e).
- **A gate refusal never leaves a `downloading` row** (both modes,
  defensive). When a gate refusal sends the machine into the strict
  pause, the row is saved as `paused` (a null pause state is fine),
  never left `downloading`. The `downloading` state's entry saves
  `downloading` before the transfer starts, so without this a refused
  start would leave a row that restarts by itself after Step out
  (against R9 and R10d).
- A start or resume the gate refuses raises the gate error (R4). So
  does a transfer that ends in an error while the strict pause is
  stopping it. The machine checks for that error
  before `classifyDownloadError` and treats it as the strict pause,
  never as `failed`. Today every error goes through
  `classifyDownloadError`, and a message that mentions "offline" or
  "internet connection" would show "Download failed. Check your
  connection and try again."

**b. One transfer at a time, always with a handle.**
Strict privacy can only pause a transfer the app can still reach.

- The service never holds two transfers. Before it starts or resumes a
  download, it stops any live transfer it holds (or hands that one back
  to the hub instead of starting another; the plan picks). Today,
  reopening the hub while a download from a closed hub is still
  running restores the `downloading` row and starts a second transfer
  to the same file, and the first runs on with no handle.
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
  network check, R6); a hub pause
  that loses the race with suspension may restart the download; and a
  download paused under the old background session may not resume.
  Their on-device checks stay in Verification, unchecked.

**c. Pauses at once, and keeps what it can.** When strict privacy
turns on, the live download pauses (R8, step 1) and its row is saved
as `paused` (`src/services/modelDownloadState.ts`), so after a restart
it still shows as paused.

- iOS: the resume data is saved in the row. The bytes stay where iOS
  put them, and the app cannot stop iOS from deleting them. If iOS
  has, a later Resume fails and the user can start over from there.
- Android: the partial model file is kept, and its length is saved as
  the resume data.

**d. Never resumes by itself.** This covers a download paused by
strict privacy: not when the app comes back to the foreground, not
after a restart, and not when strict privacy turns off. It resumes
only when the user, outside strict privacy, taps Resume, and that
Resume runs the network check first, like every continuation (R6; PR
#125). (It is scoped to strict pauses on purpose. In Standard, a
download the user started carries on by itself, after a background
pause or when the hub next opens after a kill, but only through the
same network check as a fresh download, which asks first on cellular:
R6, #124, PR #125.)

**e. Blocked in strict.** In strict privacy, Resume and Retry show the
downloads-off alert (R5). While the mode is strict, a paused download
shows "Paused — strict privacy is on"; after stepping out it shows
"Paused". Whether the label is the strict one comes from the current
mode alone: strict or not strict. Outside strict, the existing labels
stay as they are, including "Paused (resuming…)" for a background
pause in Standard. The download row stores no pause reason
(`model_download_state` has `model_id`, `pause_state_json`, `status`
and `updated_at`), and this spec adds no column, so a restored strict
pause shows the label without any hub-machine event. Any `paused` row
without resume data, in either mode, adds under the label: "This
download will start over when you resume." That covers R10f's
rewritten rows, R8's kill-window rows, a Standard pause that produced
no resume data, and a declined restore of a download killed in the
foreground (PR #125 saves it as `paused` with no pause state; R6). A
declined continuation is paused with reason `restored`, so outside
strict it shows the plain "Paused".

On that paused-for-strict download screen two things are required,
because the screen (`src/app/model-hub/download.tsx`) otherwise shows
only Paused/Resume and has no route back to the model list:

- a **Step out of strict privacy** button, which opens R9's
  confirmation (the same button the hub notice offers, R7);
- a way **back to the model list** (`index.tsx`), so "Import custom
  .gguf" stays reachable from the download screen (owner ruling on
  OQ-2: it stays available in strict privacy).

**f. Never restarted under strict.** A row left as `downloading` (the
app was killed mid-download, or the paused row was never saved) is
restored under strict as paused, not restarted, and the row is
**rewritten** as `paused`, so that stepping out and relaunching
doesn't restart it through the hub's restore. Such a row has no resume
data, so the screen shows R10e's mode label with its "will start
over" explanation.

Before the rewrite, the hub's normal restore path runs
(`checkingExisting` → `verifyDownload` → smoke test). This is the
hub-side counterpart of the plain file check that R8 runs in Settings
before the can't-keep warning. If the file on disk is already
complete — a download that finished while the hub was closed leaves a
`downloading` row (or a `paused` row with no pause state, R10j), a
complete file, and no service record — the row is not rewritten and no
warning shows: the download continues through verification and the
smoke test to `complete`, per R10h.

`checkingExisting` has two exits for a file that is not verified: its
`verifyTask` `onDone` fallback (the size check said no) and its
`onError` (the check threw). On `main` before PR #125 both went
straight to `downloading` for a restore; after PR #125 both go to
`confirmingNetwork`, which calls `checkNetwork`
(`getNetworkStateAsync`). Under strict, the strict branch replaces
**both** exits: the row is rewritten as `paused`, and neither
`checkNetwork` nor `getNetworkStateAsync` is called.

**g. A download that can't be kept: warn, then clean up** (owner,
OQ-6). Switching to strict leaves a download that can't be resumed
later when the pause gives no resume data, when the pause fails, or
when the app has no live handle for a download its row says is
running. Then the app warns before the switch:

> **This download can't be kept**
> Curated Journal can't keep this download so that it continues later.
> If you turn on strict privacy now, Curated Journal removes what it
> downloaded so far, and the download starts over the next time you
> get a model. If you cancel, strict privacy stays off and the download
> starts over. On cellular data, it waits to ask you in the model hub.
> [Cancel] [Turn on and remove]

- No live handle: the app knows before the confirmation, so the
  warning is merged into the confirmation (R8), without the sentence
  about cancelling. It replaces the confirmation's download sentence
  instead of following it. As R8 says, "no live handle" applies only
  to a `downloading` row and is decided only after the plain file check
  (`verifyDownload`) has run: a row whose file is already complete is
  kept, not warned about.
- No resume data, or a failed pause: only the pause shows this, so the
  warning shows after R8 step 1 and before step 2. The pause has
  already stopped the transfer. If it is still running after a failed
  pause, the owner cancels it.
- **Cancel** (owner, 2026-11-16): the app stays in Standard and the
  download carries on. Cancel is reached only when the pause gave no
  resume data or failed, so the download starts over. The hub's own
  control never opens R8 with a transfer in flight (R7), so this
  happens from Settings, with the hub closed, and PR #125's check,
  which lives in the hub machine, does not cover it. To keep the
  Standard copy's promise that a continuation asks first on cellular,
  the owner (R10a) first re-saves the row as `downloading` with no
  pause state, then asks the OS which network the phone is on
  (`checkNetworkGate`, which sends nothing):
  - on Wi-Fi, it restarts the download at once;
  - on cellular or offline, it starts nothing from Settings. The
    `downloading` row restores when the hub next opens, through PR
    #125's check, which asks on cellular and waits offline.

  This split is a lead ruling (2026-11-16), consistent with the #124
  owner ruling that a continuation asks first on cellular; the owner
  may overrule it. Re-saving the row as `downloading` matters either way:
  otherwise R8 step 1's first save would leave a `paused` row behind a
  running transfer, and if that transfer then finished with the hub
  closed, the restore would show a paused download that Resume fetches
  again (R10j). If the warning was part of the confirmation (no live
  handle), no pause ran, and nothing changes: the row is left as it
  was.
- **Turn on and remove:** the app cleans up, then carries on from R8
  step 2. Cleanup cancels the transfer if the app still holds it,
  drops the resume data and its references to the OS's temporary file
  (on iOS, after a successful pause the task is already cancelled via
  `cancelByProducingResumeData`, and the temporary file stays orphaned
  in the OS's tmp folder until the OS purges it — the app does not and
  cannot delete it itself), deletes the
  partial model file on Android (never the installed model's file),
  and clears the download row, so the hub has nothing to restore. A
  later download in Standard starts fresh. With R10b, a transfer the
  app cannot reach can only be one left by a version from before Step
  2.

**h. On-device steps carry on.** Checking the file and the smoke test
happen on the device, so a download that has already finished
continues through them in strict privacy.

**i. No deletion unless the user says so.** Switching modes, starting
the app and opening the hub never delete a kept download (the Android
partial file, or the iOS resume data). Only a choice the user makes
deletes one:

- the cleanup the user confirms in g;
- picking a different model in Standard, which replaces the old
  download, as today; PR #125 also clears the saved download row
  (with its resume data) when the user picks a model different from
  the row's model. Picking the same model keeps its progress;
- **a successful custom import abandons any kept download, in both
  modes** (lead ruling, 2026-11-16; the same principle as PR #125's
  different-model pick). Importing a model is the user's choice of a
  model, so it ends the download they had kept. Its row is cleared
  (PR #125: before the import commits the model's identity, and again
  on `IMPORT_SMOKE_OK`), so a later hub open has nothing to restore and
  cannot replace the imported model without a "Replace model"
  confirmation. Its partial file is not preserved either: the import's
  orphan sweep (`deleteOrphanedCuratedModelFiles` with
  `keepModelId: null`, in `src/app/model-hub/import.tsx`) may delete
  it. The sweep must never delete the **current** model's file; #115
  covers that guarantee. The import stays available in strict (R11),
  so this applies there too. Apart from the confirmation below, Step 2
  does not change the import path.

  **The import warns first** (lead ruling (2026-11-16), per rule 12;
  owner may overrule). When a saved download row is `paused` or
  `downloading`, in either mode, the custom-import flow shows a
  confirmation **before** the file picker opens, naming the row's
  model:

  > Importing your own model stops the download of `<model name>`.
  > What it downloaded so far is removed.
  > [Cancel] [Import anyway]

  Cancel opens no picker and leaves the row as it is. Import anyway
  opens the picker, and the import goes on as above. With no such row,
  no confirmation shows and the picker opens at once.

**j. A paused row with no resume data is checked first** (review,
2026-11-16). In either mode, when the hub restores a `paused` row
whose pause state is null, it runs the size check (`verifyDownload`)
before it settles on `paused`. If the file is complete, the restore
goes on to verification and the smoke test, as a `downloading` row's
restore does (R10f, R10h). Otherwise the download stays paused, with
R10e's "will start over" explanation. Both non-complete exits of that
check go to `paused`: the size check saying no (`onDone`) and the
check throwing (`onError`). Neither ever goes to `confirmingNetwork`;
a paused row waits for the user, in either mode. Today
`RESTORE_DOWNLOAD` of a `paused` row goes straight to `paused` with no
check, and Resume with no pause state reaches `startDownload` (after
PR #125, through the network check). On Android `startDownload`
writes from byte 0 (`prepareDestinationForWrite` with append off in
`FileSystemDownloadTask.kt`), so it truncates the file: a finished
2.4 GB model would be fetched again. A `paused` row whose pause state
has resume data keeps today's restore (B2: no pause call, wait for
Resume).

PR #125's declined continuations meet R10j like this. A declined
foreground resume, Resume or Retry keeps its resume data, so its
`paused` row keeps the B2 restore and R10j does not apply. A declined
restore of a download killed in the foreground has no pause state, so
its `paused` row gets R10j's size check at the next hub open.

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
  file. A successful import abandons any kept download, and the import
  flow asks first when one exists (R10i).

*(Rules 1, 2, 11.)*

**R12 — Changing the model in strict privacy.** Settings → Change AI
model still opens the hub. The hub shows the notice: "Models download
from the internet, which strict privacy keeps Curated Journal away
from. Your current model stays in place. To change it, import a model
file that's already on this device, or step out of strict privacy
first." Picking a catalog model is refused (R5) **before** the current
model is retired — and before the "Replace model…" confirmation that
`commitSelection` shows ("… will be deleted now"), not only before the
`retiringCurrent` state that follows it. Today, `SELECT_MODEL` deletes
the current model (`retiringCurrent`) before any download starts. In
strict privacy that would leave the user with no model and no way to
download one. The machine cannot import `privacyMode.ts` (which has
native imports), so the strict refusal arrives as a guard the plan
injects into `ModelHubApi`: the hub asks the gate before sending
`SELECT_MODEL`, and the machine sees only the refusal, not the mode.
*(Rules 1, 11.)*

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
  background pause or a kill (R6; #124, PR #125), which is a
  connection the app makes without a new tap. Step 2 rewords it to
  match the Standard copy: nothing else goes online on its own, and a
  model download you started can carry on by itself when you come
  back to the app or open the model hub, sometimes from the start, and
  asks first if you're on cellular data.
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
- the shared `onLinkPress` in `src/components/NoteMarkdown.tsx` (the
  wrapper and the image rule are #118's, in PR #120);
- the paused-row size check on restore (R10j) and R10g's Cancel
  re-save;
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

- **#118, PATCH, now.** Remote images in notes stop loading, in both
  modes. JS only.
- **#124, PATCH, now** (PR #125, 9.2.1, spec
  `specs/2026-11-16-download-cellular-continuation/spec.md`). Every
  continuation of a download the user started (after a background
  pause or a kill, and a manual Resume or Retry) goes through the same
  network check as a fresh download, which asks first on cellular, on
  whichever hub screen is in front. JS only.
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
- **#124** (PR #125): routing every continuation of a download
  (foreground resume, restore after a kill, manual Resume, Retry)
  through the network check, with the prompt on whichever hub screen is
  in front. It ships first, on its own. Step 2 keeps it in place (R6).
- **#126 and #127**: a Wi-Fi drop after the check falling back to
  cellular silently (and Ethernet counted as offline), and a foreground
  return mid-pause dropping resume data. Both are pre-existing, found in
  PR #125's review, and tracked on their own (R6).
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
  update-check tests and the download-service tests — must seed
  Standard before asserting any allowed behavior: by loading through a
  mocked store that holds `'default'`, or through a shared jest setup
  file. Without seeding, every gate says no and the suites fail.


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
    opening the tip jar, a link tap). So a silent spy in strict means
    the path was blocked, not that the spy was never wired up.
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
      `react-native-markdown-display` (#120's lint rule enforces this
      too; type imports, such as `markdownRules.tsx`'s
      `import type { RenderRules }`, are allowed), it must pass
      #118's image rule and the shared `onLinkPress`, and its props
      must leave out `rules` and `onLinkPress`.
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
- Download service and model hub (`modelDownloadService.test.ts`,
  `modelHubMachine.test.ts`, `useModelHub.test.ts`, the `_layout`
  restore):
  - turning strict on mid-download from Settings (hub closed) pauses
    through the service's owner, and the row is saved as `paused` with
    its pause state; on the web and safety-net path (R10a), the machine
    event sent while the machine is `downloading` ends in `paused` with
    reason `strict` and no second pause call;
  - a task that is not `active` counts as no live transfer, and the
    owner does not throw; the record is cleared when a transfer
    completes, fails, is cancelled or is paused;
  - a gate refusal, and a transfer ended by the strict pause, land in
    the strict pause, never in `failed` and never on the network copy;
    a gate refusal on the machine path saves the row as `paused` (a
    null pause state is fine) and never leaves it `downloading`, so
    Step out does not restart it (R10a, both modes);
  - starting or resuming while a transfer is live stops the old one
    first, so there is never a second transfer;
  - start and resume pass `sessionType: 'foreground'` (R10b);
  - a strict-paused download does not resume by itself on
    foreground, on restart, or on leaving strict (R10d);
  - the strict pause saves the row as `paused` before it calls
    `pauseAsync`, then saves it again with the pause state; a relaunch
    in Standard after a kill between the two shows the download paused
    and creates no `DownloadTask` until Resume (R8, kill window);
  - Standard continuation (R6): #124's tests (PR #125) stay in place,
    and Step 2 keeps every one of them green:
    - machine level: the
      `describe('continued downloads ask before using cellular data (#124)')`
      block in `__tests__/modelHubMachine.test.ts`. A restore after a
      kill, a foreground resume, a manual Resume and Retry from
      `failed` with a pause state all run the network check: Wi-Fi goes
      ahead with no prompt, and on cellular `cellularConfirm` comes
      before any `DownloadTask` call. A declined continuation stays
      `paused` with its pause state and persists it, and Resume asks
      again; a declined fresh download returns to `selecting`.
      `APP_BACKGROUND` during the check or the prompt re-pauses, and
      the next foreground re-checks. Offline, `LEAVE_WAITING` reaches
      the list and custom import. An abandoned row is cleared on a
      successful custom import and on picking a different model, and
      kept on picking the same model;
    - real layout: `__tests__/modelHubLayoutRestoreCellular.test.tsx`
      renders the **real** `src/app/model-hub/_layout.tsx` over a saved
      `downloading` row on cellular. It checks that the cellular sheet
      shows once, that the layout replaces to the download screen,
      that no download starts before Download over cellular, and that
      Cancel starts nothing. It fails if `<CellularConfirm />` leaves
      the layout. This is the screen-level guard;
    - screen states: `__tests__/modelHubDownloadNetworkStates.test.tsx`.
      The cellular sheet shows exactly once with only the download
      screen mounted (as after a restore's `router.replace`) and with
      both screens mounted. Its buttons send `CELLULAR_CONFIRM` and
      `CELLULAR_CANCEL`. `confirmingNetwork` shows "Checking your
      connection…". `awaitingWifi` shows Try again (`CHECK_NETWORK`)
      and Choose another model (`LEAVE_WAITING`). "Starting download…"
      shows only in `downloading`, and the download framing stays
      during the check. A transition into `selecting` dismisses to the
      list; the initial `selecting` of a restore mount does not. It
      mounts its own `<CellularConfirm />` beside the screens, so it
      cannot catch a layout regression; the real-layout test does;
    - `__tests__/cellularConfirmClose.test.tsx`: the sheet closes when
      the machine leaves `cellularConfirm`;
    - `__tests__/modelHubDownloadSmokeFailed.test.tsx`: "Choose
      another model" lands on the list through the transition effect.

    A machine-state test alone cannot catch a prompt that never
    renders, so the screen and layout tests matter as much as the
    machine block;
  - R10g's Cancel from Settings (hub closed): it re-saves the row as
    `downloading` with no pause state; with `checkNetworkGate` mocked
    to Wi-Fi, it restarts the download at once; mocked to cellular or
    offline, it starts no transfer, and the next hub open restores the
    row through `confirmingNetwork` (cellular asks; offline waits);
  - a `downloading` row restored under strict creates no
    `DownloadTask`, and the row is rewritten as `paused`; neither
    `checkNetwork` nor `getNetworkStateAsync` is called, from either of
    `checkingExisting`'s non-verified exits (`onDone` fallback and
    `onError`); after stepping out, reopening the hub shows it paused,
    not downloading (R10f);
  - **paused row with no pause state (R10j), both modes:** with a
    complete file on disk, the restore runs `verifyDownload` and goes
    on to verification and the smoke test, and no `DownloadTask` is
    created; with an incomplete file, it stays `paused`, shows "This
    download will start over when you resume", and creates no
    `DownloadTask` until Resume;
  - **completed-while-closed (R8, R10f, R10g, R10j):** a `downloading`
    row whose file on disk is already complete, with no live service
    record. When strict is turned on in Settings, only `verifyDownload`
    runs: no hub machine is created, the dialog does not wait on a
    model load, and the can't-keep warning does not show. A `paused`
    row with no pause state is never pre-checked in Settings (R8). When
    the hub next opens under strict, the restore runs the size check
    (for a `downloading` row, `checkingExisting` → `verifyDownload`;
    for a `paused` row with no pause state, R10j's check) and then the
    smoke test: the row is not rewritten as `paused`, and the download
    reaches `complete` through verification and the smoke test (R10h);
  - R10j's check throwing (`onError`) leaves the row `paused`, like the
    size check saying no, and neither calls `checkNetwork`;
  - **paused-for-strict screen (R10e):** the download screen for a
    strict-paused row shows the "Paused — strict privacy is on" label,
    a Step out of strict privacy button that opens R9's confirmation,
    and a way back to the model list, so Import custom .gguf is
    reachable from it; after stepping out, the label reads "Paused";
    the label follows the mode alone, with no pause-reason column;
    any `paused` row with no resume data, in either mode, also shows
    "This download will start over when you resume." under the label;
  - `SELECT_MODEL` in strict is refused before `retiringCurrent`;
  - a download that can't be kept (no resume data, a failed pause, no
    live handle) shows the warning before the mode changes; Turn on
    and remove cancels the transfer, drops the resume data, deletes
    the Android partial file but never the installed model's file, and
    clears the row (R10g);
  - Cancel, one test per variant (R10g): after a pause with no resume
    data, Cancel leaves Standard on, re-saves the row as `downloading`
    with no pause state, and (on Wi-Fi) calls `startDownload`; after a
    failed pause, the same, and the old transfer is cancelled first; with no
    live handle, Cancel leaves the row exactly as it was and starts no
    transfer; in the two variants that start a transfer (no resume
    data, failed pause), a transfer that then completes with the hub
    closed restores through the size check to the smoke test, not to
    `paused`;
  - R8 step 1 race: when the transfer finishes between the first save
    and the pause (the task is not `active`), the owner runs
    `verifyDownload`; with a complete file, no warning shows, nothing
    is removed, and the row stays `paused` for R10j;
  - in strict, a finished download on disk goes through `verifying`
    and `smokeTest` to `complete`, and no network spy fires (R10h);
  - switching modes, launching and opening the hub delete no model
    file (R10i); a successful custom import in strict clears a
    strict-paused download's row, so the next hub open restores
    nothing (R10i, lead ruling);
  - import confirmation (R10i, lead ruling): with a `paused` or
    `downloading` row saved, starting "Import custom .gguf" shows the
    confirmation naming the row's model before any picker call; Cancel
    makes no `DocumentPicker.getDocumentAsync` call and leaves the row
    unchanged; Import anyway opens the picker. With no such row, no
    confirmation shows and the picker opens at once.
- Hub notices: the strict notices in R7, R11 and R12 show in strict and
  not in Standard; the read-failure sentence shows after a read
  failure; the Step out button opens R9's confirmation.
- Hub Turn on strict privacy control (R7), one test over the machine
  states: in Standard the control is shown and active in `selecting`
  (on the list) and in `paused`, `failed` and `smokeFailed` (on the
  download screen), and hidden in every other state:
  `checkingExisting`, `confirmingNetwork`, `awaitingWifi`,
  `cellularConfirm`, `downloading`, `verifying`, `smokeTest`,
  `retiringCurrent`, `customImport` and `complete`. It is hidden in
  strict. It opens R8's confirmation. Two more cases:
  - from `paused`, Turn on only changes the label to "Paused — strict
    privacy is on" and gives the machine the `strict` reason; no pause
    call, no `DownloadTask` call, and a later `APP_FOREGROUND` does not
    resume;
  - from `selecting` with a saved `downloading` row (after "Choose
    another model" while a restore waited for Wi-Fi) and an incomplete
    file, the pre-check runs on the
    saved row as in Settings and shows the merged can't-keep
    confirmation; with a complete file, no warning.
- Settings → Privacy section (R7): it renders as the first section; it
  offers exactly two choices, Standard and Strict privacy, each with
  the copy from "The two modes, as the user reads them"; the current
  mode is selected; a first install shows no first-run prompt (R1).
- Confirmation copy and paths (R8, R9): both confirmations render the
  required text; on R8, Cancel keeps Standard on and changes nothing,
  and Turn on runs the R8 order; on R9, Cancel keeps strict, and
  Step out saves first and applies second. When R10g's warning is
  merged into R8's confirmation (no live handle), the confirmation
  shows the warning in place of the download sentence: "A download in
  progress pauses now and won't restart on its own" is absent, the
  warning's cancelling sentence is absent, and the button reads "Turn
  on and remove".
- Save-failure messages (R8 step 3, R9): when the save rejects, the
  exact failure message shows, and the mode the gates report matches
  the message (strict in both cases; the app stays strict on a failed
  step-out).
- R8 step 5 row text: after a check is stopped mid-flight, the update
  row reads "Strict privacy is on. The update check stopped."
- R3 read-failure copy: with the store read failing, Settings →
  Privacy shows "Curated Journal couldn't read your privacy setting…",
  and with no model installed the hub notice starts with it.
- R15: `docs/privacy/index.html` names Standard and strict privacy,
  matches the modes' copy (including "Nothing else goes online on its
  own" and the download-continuation sentence, in place of "The app
  makes no network connections on its own"); its heading no longer
  says "you start each one"; its update-check line names the random
  install ID Expo receives; and its iOS strict wording matches R3's
  caveats (#119 and the pre-Step-2 download drain).
- `updateCheck.test.ts`, `updateCheckRow.test.tsx`: a check is refused
  in strict; the gate is asked again between check and fetch.
- `tipJarStore.test.ts`, `tipJarSection.test.tsx`: the session closes
  when strict turns on; `openTipJar` stops after `initConnection` when
  the mode has turned strict, before `fetchProducts` and before
  `recoverUnfinished`; `getAvailablePurchases` and `finishTransaction`
  are not called in strict; the alert copy names Settings → Privacy.
- Markdown: #118's tests stay in place. A link tap in strict, for
  every scheme (`https`, `http`, `mailto:`, `tel:`, another app's
  scheme, `cur://`, no scheme), shows the alert and never calls
  `Linking.openURL`. In Standard, an `http(s)` tap calls
  `Linking.openURL` with the link; every other scheme, and a link with
  no scheme, shows the "Only web links open" alert and never calls it.
  The library never calls `Linking.openURL` itself (the shared
  `onLinkPress` never returns `true`), and a caller cannot pass its own
  `onLinkPress` to `NoteMarkdown`.
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
- [ ] iOS, pre-Step-2 transfer running (R3): with a download left
      RUNNING (not paused) by a version from before Step 2, apply the
      Step 2 OTA update, relaunch, and turn strict privacy on. Watch
      the proxy log from process start: the app itself makes no
      request, and the strict pause reports no live transfer. Note
      whether the leftover background transfer keeps running anyway
      (it is unreachable from JS), and record when it finishes or is
      otherwise drained. Check that the downloads-off alert shows the
      transitional sentence.
- [ ] R14: with an update downloaded but not yet installed, turn
      strict privacy on and restart the app. The update installs at
      that restart.
- [ ] In Standard (#124, PR #125): start a download on Wi-Fi, then
      switch to cellular data.
      - Background the app and come back: the cellular prompt shows on
        the screen in front before the download continues.
      - Separately, force-stop the app while it is downloading in the
        foreground, with the download screen in front. On Android use
        `adb shell am force-stop com.equationalapplicationsllc.curatedjournal`
        (Settings → Apps sends the app to the background first, which
        pauses the download and saves a `paused` row). On iOS, swipe it
        away from the app switcher. Then relaunch: the hub opens on
        the download screen, shows "Checking your connection…", then
        the cellular prompt, and the download starts again from the
        start only after you confirm. If the OS backgrounded the app
        before the kill, the row was saved as `paused` first: the
        download shows Paused and waits for Resume, with no automatic
        restart; tapping Resume on cellular shows the prompt first.
      - On the cellular prompt of a continuation, tap Cancel: the
        download stays Paused on the download screen, and Resume asks
        again. Background the app while the prompt is up, then come
        back: the prompt closes, and the check runs again.
      - Offline, with the hub waiting for Wi-Fi: "Choose another model"
        goes to the list, and the download comes back the next time
        the hub opens.
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
- [ ] In Standard: a `mailto:` or other non-web link in a note shows
      the "Only web links open" alert; an `https` link opens in the
      browser.
- [ ] Turn on strict when the download can't be kept, then tap Cancel
      on the warning: the app stays in Standard and the download
      carries on.
- [ ] In strict privacy, with a proxy or router log running from
      process start, launch the app and use every journal feature. The
      app makes no request. This is the proof R13 points to.
- [ ] Strict privacy survives a relaunch.
- [ ] Tip jar, update check, a link in a note, and Resume each show
      their alert in strict privacy.
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
  in both modes. Its row is cleared and its partial file is not
  preserved, so #115 no longer stops the import's cleanup from deleting
  a kept partial. #115's remaining scope is integrity verification of
  imported files that match a curated model, and the orphan sweep never
  deleting the current model's file. *Encoded in:* R10i, R11, Out of
  scope.
- **OQ-3 — Links inside notes, in the default mode.** *Asked:* In
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
  *Asked:* No note renderer passes `onLinkPress` today, so
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

Two, both raised in review (2026-11-16). Everything else this spec
needs is decided by INTENT.md, the ROADMAP and the answers above.

- **The strict-mode copy on iOS before #119 (and before pre-Step-2
  downloads drain).** The on-screen strict copy (rule 11, "The two
  modes") promises: "Curated Journal doesn't go online or connect to
  anything outside this device, for any reason." On iOS that promise
  is not fully kept until #119 ships and any download a pre-Step-2
  version left running in a background session has drained (R3): a
  launch-time StoreKit listener starts, and an orphaned transfer may
  still be moving bytes, neither reachable from JavaScript. How should
  the copy read until then — qualify it (for example, "The app itself
  doesn't go online; on iPhone, a few system- and update-related
  connections may still occur until the next MAJOR update"), or keep the plain
  promise and carry the caveat elsewhere (the policy page, R15)?
- **INTENT rule 9, paragraph 2 (amendment).** Rule 9 ¶2 lists the
  default mode's traffic — model downloads, update checks, tips — as
  things "the user starts", and says "nothing else runs on its own".
  OQ-3 and OQ-8 add a fourth user-started kind, tapped web links in
  notes. That fits the intent, but the paragraph's literal list does
  not name it. INTENT.md is static and wins on intent; amending it
  goes through PR review. Should rule 9 ¶2 be amended to name tapped
  web links, or is "the user starts" already read as covering them?
  The new Standard copy, "Nothing else goes online on its own" next to
  a download the user started that can carry on by itself (R6; #124,
  PR #125), leans on the same "else", so the answer bears on that
  wording too.
