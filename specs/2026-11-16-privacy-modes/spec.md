# Spec: privacy modes — strict privacy and the default mode

**Status: Draft** — 2026-11-16. ROADMAP Step 1 (BINDING). This PR is
the spec only. The build is ROADMAP Step 2, and it waits on owner
approval of this spec. A `plan.md` is written only after approval.

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
  privacy **pauses at once, and the partial file is kept**. It never
  resumes on its own. It resumes only after the user leaves strict
  privacy and asks to resume (R10).
- Getting a model in strict privacy without the network (a file picker
  for a model already on the device) is issue
  [#115](https://github.com/equationalapplications/curated-journal/issues/115).
  It is **out of scope** here. R11 says what the user sees until then.
- The default mode is today's behavior, given a name (ROADMAP Step 1).

## INTENT check

Checked against INTENT.md (static since 2026-11-04) and ROADMAP v1.2.
No requirement here contradicts INTENT on intent. The check found three
tensions, and INTENT wins each one:

1. **Status lines.** ROADMAP Step 2 says rule 9's and rule 11's status
   lines change in the Step 2 pull request. INTENT.md has been static
   since the 2026-11-04 ruling (no status lines, no delivery progress),
   and AGENTS.md repeats it. So Step 2 does not edit INTENT.md (R16).
   The ROADMAP sentence is stale. Amending it is not part of this PR.
2. **"Today's behavior" has a leak.** Rule 9, paragraph 2, says the
   default mode has three kinds of traffic (model downloads, update
   checks and tips, each started by the user) and "nothing else runs on
   its own". The survey below found one automatic request in today's
   code: images inside a note load from the internet when the note is
   shown (path 8). INTENT wins, so the default mode leaves it out (R6).
   That is the one place where "default mode = today's behavior" is not
   literal. OQ-4 asks the owner to confirm.
3. **Native work at launch.** Rule 11 expects "strict from launch" to
   ship as "a native, MAJOR change". ROADMAP Step 2 expects MINOR,
   because the launch-time update check was already set to never run.
   The survey found one more native item that runs at launch on iOS,
   before any JavaScript (path 9). JS cannot gate it. OQ-5 asks whether
   it must go, which would be a MAJOR change.

Rules each requirement rests on: rule 1 (the journal works with no
network), rule 2 (models are installed only by the user, in the model
hub), rule 8 (answers cite their sources), rule 9 (the default mode), rule 10 (version cost), rule 11
(strict privacy), rule 12 (each step away from strict is an informed
choice), rule 13 (the journal never depends on connectivity), and the
out-of-scope items "Any off-device communication in strict privacy" and
"Silent model installs".

## Survey: every path that can go off-device

Read from `main` at `94296e7` (9.1.1) on 2026-11-16. The list is meant
to be complete. A path added later must be added here, and the coverage
test in Verification fails until it is.

| # | Path | Code | Who it reaches | Started by | Default mode | Strict |
|---|---|---|---|---|---|---|
| 1 | Model download, fresh start | `startDownload` in `src/services/modelDownloadService.ts` (`expo-file-system` `DownloadTask`, User-Agent from `src/lib/buildUserAgent.ts`). Reached from `modelHubMachine` state `downloading`, which is entered by `SELECT_MODEL` (through `retiringCurrent`, `checkingExisting` and `confirmingNetwork`), `CELLULAR_CONFIRM`, `CHECK_NETWORK`, `RETRY` from `failed`, and `RESTORE_DOWNLOAD` of a `downloading` record when the hub opens (`src/app/model-hub/_layout.tsx`). | Hugging Face (`huggingface.co`, URLs in `src/catalog/modelManifest.ts`) and the file hosts it redirects to | The user. A download the app was killed during restarts on its own when the hub next opens. | Allowed | Blocked |
| 2 | Model download, resume | `resumeDownload` (`DownloadTask.fromSavable`). Reached from `RESUME` (`src/app/model-hub/download.tsx`), from `APP_FOREGROUND` after a background pause (automatic), and from `RETRY` with saved resume data. | Same as 1 | The user, or the app on return to the foreground | Allowed | Blocked |
| 3 | Update check | `checkForAppUpdates` in `src/lib/updateCheck.ts` (`expo-updates` `checkForUpdateAsync`, then `fetchUpdateAsync`). Reached only from the Check button in `src/components/settings/UpdateCheckRow.tsx`. | Expo's update service (`u.expo.dev`). It receives the platform, runtime version, channel, current and embedded update IDs, and a random ID for this install (the `EAS-Client-ID` header, set by `expo-updates`' native downloader). | The user | Allowed | Blocked |
| 4 | Launch-time native update check | Off: `updates.checkAutomatically: 'NEVER'` in `app.config.ts`, asserted by `__tests__/appConfig.test.ts` and checked on every built artifact (VERSIONING.md train step 4). | — | Nothing | Never runs | Never runs |
| 5 | Tip jar (iOS, Android) | `openTipJar` in `src/lib/tipJarStore.ts` (`expo-iap` `initConnection`, `fetchProducts`, `getAvailablePurchases`, `requestPurchase`, `finishTransaction`, `endConnection`). Reached from Open and the tip buttons in `src/components/settings/TipJarSection.tsx`. Already gated by `canUseStorePurchases()`. | Apple App Store or Google Play | The user | Allowed | Blocked (alert exists) |
| 6 | Support link (web build only) | `Linking.openURL(SUPPORT_PAYPAL_URL)` in `TipJarSection.tsx`. Already gated by `canOpenSupportLink()`. | PayPal | The user | Allowed | Blocked (alert exists) |
| 7 | Links inside notes | `react-native-markdown-display` 7.0.2: its default `link` and `blocklink` rules call `Linking.openURL` when tapped. Note text renders through it in `src/components/journal/JournalPane.tsx`, `src/app/entry/[factId].tsx` and `src/components/graph/GraphNodeSheet.tsx`. That text comes from the model or from an imported OKF bundle. | Whatever site the link names | The user (a tap) | **OQ-3** | Blocked |
| 8 | Images inside notes | The same library's `image` rule renders `![…](url)` with `react-native-fit-image`, which fetches the URL as soon as the note is shown. By default it allows `https://` and `http://`, and it adds `https://` to a source with no scheme. | Whatever host the image names | **Nothing; it happens on its own** | Not allowed (rule 9 ¶2) | Blocked |
| 9 | iOS store listener at launch | `expo-iap` 6.4.1 registers `ExpoIapAppDelegateSubscriber`, which creates `OpenIapModule.shared` in `didFinishLaunching`, before any JavaScript runs. OpenIAP's StoreKit module then starts a `PurchaseIntent.intents` listener (iOS 16.4 and later) or adds an `SKPaymentQueue` observer (earlier iOS). On Android, billing loads only on the first `initConnection`. | Apple's StoreKit on the device. This survey found no request that it sends, but cannot rule out StoreKit doing something on its own. | The app, at every launch | Today: runs | **OQ-5**. JS cannot gate it. |

These are **not** off-device paths. They are listed so nobody has to
survey them again:

- `expo-network` `getNetworkStateAsync` (`src/lib/networkGate.ts`)
  asks the OS whether the phone is on Wi-Fi or cellular. It sends
  nothing. In strict privacy the hub never needs to ask.
- OS pickers and the share sheet: `expo-document-picker` (OKF import,
  `src/app/import.tsx`; model import, `src/app/model-hub/import.tsx`)
  and the Android folder picker plus `expo-sharing`
  (`src/lib/okfExport.ts`). These are covered by the charter's
  exception: a file the user hands to an OS picker or share sheet goes
  where the user sends it (rule 11 and the glossary).
- The wiki engine (`@equationalapplications/core-llm-wiki` and
  `expo-llm-wiki` 8.4.0). The shipped `dist` code has no `fetch`,
  `XMLHttpRequest` or `WebSocket` (checked 2026-11-16). `llama.rn`
  loads a local file.
- Development only: `expo-dev-client` and Metro. Development builds
  talk to the developer's bundler. Release builds do not.
- The web build is a development and test surface (this survey found
  no deployed web app). The host serves the page itself; this spec
  covers what the app starts after the page loads.
- The app has no Bluetooth, local-network, analytics or crash-reporting
  code.

## The two modes, as the user reads them

### Names

- **Strict privacy.** This is the charter's name.
- **The default mode.** The charter does not name it. This spec uses
  **"Standard"** as a working name only; the owner picks the real name
  (OQ-1). In code the mode stays `'default'`, whatever it is called on
  screen.

### What each mode allows, and with whom (on-screen copy)

This copy goes under each choice in Settings → Privacy (R7). Step 2
may fix wording or layout. It may not claim more or less than the
requirements allow.

**Standard** *(working name, OQ-1)*

> Curated Journal goes online only when you ask it to:
>
> - To download an AI model you pick. It comes from Hugging Face, which
>   hosts the model files.
> - To check for an app update, when you tap Check. Expo runs the
>   update service.
> - To leave a tip. The App Store or Google Play handles it.
>
> Nothing goes online on its own. Your journal stays on this device
> unless you export or share it.

On the web build the tip line reads: "To open the Support page, when
you tap Support. PayPal runs it."

**Strict privacy**

> Curated Journal doesn't go online or connect to anything outside this
> device, for any reason. No model downloads, no update checks, no
> tips. No Bluetooth or local network either.
>
> Everything your journal does keeps working: writing, organizing,
> asking questions, the graph, import and export.
>
> Files you choose in a file picker, or send with the share sheet, go
> where you send them.
>
> While strict privacy is on, the app gets no updates, including
> security fixes. To update, step out of strict privacy and check in
> Settings, or install a new version from the App Store or Google Play.

## Requirements

**R1 — One setting, two modes.** The user picks one of two modes:
Standard (the default mode; working name, OQ-1) or Strict privacy. A
fresh install starts in the default mode and shows no first-run
prompt. *(Rule 9 ¶2: "the everyday setting needs no switch." Rule 11.)*

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
- If the saved mode cannot be read, the app runs in strict privacy for
  that session. Settings → Privacy says: "Curated Journal couldn't read
  your privacy setting, so it's using strict privacy for now. Choose a
  mode to save it again."

*(Rule 11: "nothing that can reach outside may act before the mode is
honored.")*

**R4 — Every gate goes through `src/lib/privacyMode.ts`.** This module
is the only place that knows the mode. It provides:

- `getPrivacyMode()`: synchronous. Returns `'strict'` until the saved
  mode has been read (R3).
- A load function, called once by the bootstrap.
- A set function that saves the mode and applies the ordering in R8
  and R9.
- A subscription, so open sessions can react when the mode changes
  (R8).
- One gate per kind of path: `canUseStorePurchases()` (path 5, exists),
  `canOpenSupportLink()` (path 6, exists), `canDownloadModels()` (paths
  1 and 2), `canCheckForUpdates()` (path 3) and `canOpenNoteLinks()`
  (path 7).

Each module that can reach the network also asks its gate itself, at
the point where it acts, the way `openTipJar` already does. Those are
`modelDownloadService.ts` (start and resume), `updateCheck.ts` (before
the check, and again before the fetch) and `tipJarStore.ts` (exists).
A screen asking first is good manners. It is not the guarantee. Path 8
needs no gate: remote images never load in either mode (R6). The plan
may rename these functions. It may not add a second place that decides
the mode. *(Rule 11; ROADMAP Step 2: "every network-capable code path
in the app asks the mode before acting".)*

**R5 — Strict privacy blocks every path.** In strict privacy, paths 1,
2, 3, 5, 6, 7 and 8 start nothing. A blocked tap shows an alert that
explains why and how to step out, and never makes a silent network
call. Every alert ends "Nothing was sent."

| Tap | Title | Message |
|---|---|---|
| A model in the hub list, Resume, Retry | Downloads are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, and models download from the internet. To get a model, step out of strict privacy, download it, then step back in. Nothing was sent. |
| Check (app updates) | Update checks are off in strict privacy | Strict privacy keeps Curated Journal from reaching beyond this device, so it can't check for updates. To check, step out of strict privacy in Settings → Privacy, check, then step back in. Nothing was sent. |
| Open or a tip (tip jar) | Tips are off in strict privacy | The existing copy (`STRICT_PRIVACY_TIP_MESSAGE`), changed to say "step out of strict privacy in Settings → Privacy". |
| Support (web) | Tips are off in strict privacy | The existing `STRICT_PRIVACY_LINK_MESSAGE`, with the same Settings → Privacy change. |
| A link in a note | Links are off in strict privacy | Strict privacy keeps Curated Journal from opening web pages. This link goes to `<host>`. Nothing was sent. |

Alerts in the model hub also offer a "Step out of strict privacy"
button, because Settings may be out of reach there (R7). *(Rule 11 and
its out-of-scope item; the tip-jar alert pattern rule 11 already
requires.)*

**R6 — The default mode.**

- Paths 1, 2, 3, 5 and 6 run when the user starts them, as they do
  today. A user-started download also carries on as it does today: it
  resumes when the app returns to the foreground after a background
  pause, and it restarts when the hub opens after the app was killed
  mid-download.
- Nothing else runs on its own.
- Remote images in notes (path 8) never load, in this mode or in
  strict. The note shows the image's alt text instead. This is the one
  change from today's behavior (INTENT check, item 2; OQ-4).
- What a link tap in a note does in this mode is OQ-3.
- Nothing connects to anything new: no sync, no pairing, no automatic
  update checks. Those are Step 3 unlocks.

*(Rule 9 ¶2; rule 12: a mode never bundles in more than its
description says.)*

**R7 — Where the setting lives.**

- Settings gets a new **Privacy** section, placed first. It shows the
  two modes as a choice of two, each with the copy above, and the
  current mode selected. It is a choice, not an on/off switch, because
  Step 3 adds more modes.
- In strict privacy, the model hub (`src/app/model-hub/index.tsx`)
  shows a "Strict privacy is on" notice with a **Step out of strict
  privacy** button. That button opens the same confirmation as R9. This
  is required because with no model installed, Settings cannot be
  reached: `src/app/(tabs)/_layout.tsx` sends the user to the hub
  instead.

*(Rule 11: "a user in strict privacy who wants a new model steps out of
strict privacy on purpose".)*

**R8 — Turning strict privacy on.** A confirmation comes first:

> **Turn on strict privacy?**
> Curated Journal will stop going online. Model downloads, update
> checks, and tips stop until you step out again. A download in
> progress pauses now and keeps what it has so far; it won't restart on
> its own. You won't get app updates, including security fixes, while
> strict privacy is on. Your journal keeps working.
> [Cancel] [Turn on]

On Turn on, in this order:

1. The mode in memory becomes strict, so every gate says no at once.
2. The mode is saved. If saving fails, strict privacy stays on for this
   session, and the user sees: "Strict privacy is on, but Curated
   Journal couldn't save the setting, so it may be off the next time
   the app starts. Try again."
3. A running model download pauses (R10).
4. An open tip-jar session closes: its listeners are removed and its
   store connection ends. A purchase update that arrives later is not
   acted on.
5. An update check that is already running does not go on to its fetch
   step. A request already sent cannot be called back. The row then
   says "Strict privacy is on. The update check stopped."

*(Rule 11.)*

**R9 — Stepping out of strict privacy.** Each step away from strict is
an explicit, informed choice, so a confirmation says what the default
mode allows and with whom:

> **Step out of strict privacy?**
> Curated Journal will be able to go online, but only when you ask it
> to: to download a model from Hugging Face, to check for an update
> with Expo, or to leave a tip through the App Store or Google Play.
> Each of them sees the request come from this device, and Expo also
> gets a random ID for this copy of the app. None of them gets your
> journal. Nothing starts on its own: a paused download stays paused
> until you tap Resume.
> [Cancel] [Step out]

On Step out, the new mode is saved first and applied second. If saving
fails, the app stays in strict privacy and says: "Couldn't save the
change, so strict privacy is still on. Try again." After stepping out,
nothing starts by itself: no download resumes, no update check runs, no
store connection opens. *(Rule 12; rule 9 ¶2; owner ruling 2026-11-16.)*

**R10 — A half-finished model download** (owner ruling, 2026-11-16).

- **a. Pauses at once.** When strict privacy turns on, the running
  download pauses. That means the native task held in
  `modelDownloadService.ts`, wherever it is running, whether or not
  the model hub is open. (Today the hub's state machine stops when the
  hub closes, but the native task keeps downloading.)
- **b. Keeps what it has.** The partial file and its resume data are
  kept, and the paused record is saved
  (`src/services/modelDownloadState.ts`), so after a restart the
  download still shows as paused.
- **c. Never resumes by itself.** Not when the app comes back to the
  foreground, not after a restart, and not when strict privacy turns
  off. It resumes only when the user, outside strict privacy, taps
  Resume.
- **d. Blocked in strict.** In strict privacy, Resume and Retry show
  the downloads-off alert (R5). The download screen shows "Paused —
  strict privacy is on".
- **e. Never restarted under strict.** A download record left as
  `downloading` (the app was killed mid-download, or the pause was
  never saved) comes back as paused under strict, not restarted.
- **f. If there is no resume data.** If the platform gives no resume
  data, or the pause itself fails, the download is stopped anyway,
  because strict privacy wins. The app does not delete the partial
  file. A later Resume starts the download over, and the screen says
  so first: "Paused. This download will start over when you resume."
  (OQ-6 asks the owner to confirm.)
- **g. On-device steps carry on.** Checking the file and the smoke
  test happen on the device, so a download that has already finished
  continues through them in strict privacy.
- **h. No deletion.** Switching modes, starting the app and opening
  the hub never delete the partial file. (The import path's cleanup
  can; see OQ-2.)

*(Rule 11; rule 2: model installs stay explicit.)*

**R11 — Strict privacy with no model installed.** The journal needs a
model to run (rule 1 starts "after a model is installed"). With none
installed, the app opens on the model hub, as it does today. In strict
privacy the hub shows:

> **Strict privacy is on**
> Your journal needs an AI model to run, and models download from the
> internet. Strict privacy keeps Curated Journal off the internet, so
> the journal can't open until you get a model. To get one, step out of
> strict privacy, download a model, then step back in.
> [Step out of strict privacy]

The model list stays visible, and tapping a model shows the
downloads-off alert (R5). The journal cannot run the model until the
user steps out of strict privacy, or until #115 ships (picking a model
file already on the device). #115 is out of scope. Whether the existing
"Import custom .gguf" row stays available in strict privacy is OQ-2.
*(Rules 1, 2, 11.)*

**R12 — Changing the model in strict privacy.** Settings → Change AI
model still opens the hub. The hub shows the notice: "Models download
from the internet, which strict privacy keeps Curated Journal away
from. Your current model stays in place. To change it, step out of
strict privacy first." Picking a catalog model is refused (R5)
**before** the current model is retired. Today, `SELECT_MODEL` deletes
the current model (`retiringCurrent`) before any download starts. In
strict privacy that would leave the user with no model and no way to
get one. *(Rules 1, 11.)*

**R13 — The journal keeps working in strict privacy.** Everything rule
1 names works in strict privacy and starts no off-device traffic:
writing and saving notes (the save queue), organizing (the Night Shift
librarian and heal passes, and the opt-in prune pass), asking questions
with citation chips (rule 8), exploring the graph, importing and
exporting OKF bundles (through the OS picker and share sheet), and
using the current model. The automated test
`__tests__/strictPrivacyJournal.test.tsx` proves it (Verification).
*(Rules 1, 11, 13: "the user can stay in strict privacy forever and
lose nothing the journal does today".)*

**R14 — Updates in strict privacy.** The strict-mode copy says the app
gets no updates, including security fixes (rule 11). An update that
was downloaded before strict privacy turned on still installs at the
next restart, because that step happens on the device. *(Rules 10,
11.)*

**R15 — The privacy policy matches.** Step 2 updates
`docs/privacy/index.html` to describe the two modes. It also makes the
policy's "The app makes no network connections on its own" true again,
by blocking path 8. *(Rule 9: "privacy is the product".)*

**R16 — No INTENT.md edits.** Step 2 does not change INTENT.md. The
implementation status lives in this spec's status line (INTENT check,
item 1; AGENTS.md).

## Version cost of Step 2

**Expected: MINOR** (the next MINOR on the 9.x island when it lands),
shipped over the air to installed 9.x binaries. Step 2 is JS/TS only:

- the mode module and its storage (`expo-secure-store` is already
  installed and already in `app.json` plugins);
- the Settings section, the hub notice, and the confirmations and
  alerts;
- the gates in the download service, the update check and the hub
  machine;
- the markdown link and image rules;
- the privacy policy page.

It adds no native module, no `app.json` plugin and no permission. The
native half of "strict from launch", the launch-time update check set
to never run, is already in the binaries Step 2 can reach (the 9.x
runtime island). It is checked on each built artifact (VERSIONING.md
train step 4).

**What would make it MAJOR:** anything that changes the
`npx expo prebuild` output beyond the version stamps (the
VERSIONING.md test). In particular:

- removing or deferring `expo-iap`'s iOS launch-time listener (path 9),
  whether by a patch to its native code, a config plugin, or dropping
  its app-delegate subscriber (OQ-5);
- adding a native module, for example to block traffic at the OS level
  or to store the mode somewhere else;
- changing `app.json` plugins or permissions.

If the owner rules that path 9 must go (OQ-5), that part is a separate
MAJOR on the release train, and the JS/TS part can still ship as MINOR
first.

## Out of scope

- **#115**: loading a model from a file the user picks, with the
  manifest's byte and integrity checks. It needs its own spec.
- **Step 3**: modes less strict than the default (sync, pairing), and
  launch-time update checks as a mode unlock (ROADMAP Exploratory).
- **OS-level blocking.** An app cannot remove its own network
  permission while it runs. Strict privacy means the app starts no
  traffic, and the tests prove that.
- **Changing what the default mode allows**, beyond R6.

## Verification

Automated (Step 2; `npm test`, `npm run lint` and `npx tsc --noEmit`
must pass):

- **`__tests__/strictPrivacyJournal.test.tsx` — rule 1 holds in strict
  privacy.**
  - Setup: the mode is strict. Every network-capable entry point is
    replaced by a spy that fails the test if it is called:
    - `expo-updates`: `checkForUpdateAsync`, `fetchUpdateAsync`;
    - `expo-iap`: `initConnection`, `fetchProducts`,
      `getAvailablePurchases`, `requestPurchase`, `finishTransaction`;
    - `expo-file-system` `DownloadTask`: construct, `downloadAsync`,
      `resumeAsync`;
    - `expo-network` `getNetworkStateAsync`;
    - `Linking.openURL`;
    - global `fetch`, `XMLHttpRequest` and `WebSocket`.
  - Run, on the mock LLM provider and the node SQLite adapter
    (`__tests__/helpers/nodeSqliteAdapter.ts`): save a note through
    the save queue, run a Night Shift librarian pass, ask a question
    and get a cited answer, load the graph, export an OKF bundle, and
    import one.
  - Expect: every feature succeeds, and no spy was called.
- **`__tests__/privacyGateCoverage.test.ts` — no ungated path.** It
  scans `src/` for network-capable APIs (`expo-updates`, `expo-iap`,
  `DownloadTask`, `expo-network`, `Linking`, `fetch`, `XMLHttpRequest`,
  `WebSocket`, `react-native-markdown-display`). It fails if a file
  outside a reviewed allowlist uses one. Each allowlisted file must
  import its gate from `@/lib/privacyMode`; the markdown files must use
  the shared rules that block images. This covers ROADMAP Step 2's
  "and anything added later".
- `__tests__/privacyMode.test.ts`, extended:
  - the saved mode is read and written;
  - every gate says strict before the load;
  - a read failure means strict;
  - the write-failure behavior in R8 and R9;
  - subscribers hear each change.
- Model hub (`modelHubMachine.test.ts`, `useModelHub.test.ts`, the
  `_layout` restore):
  - turning on strict mid-download pauses the native task and keeps
    the file and its resume data;
  - there is no automatic resume on foreground, on restart, or on
    leaving strict;
  - a `downloading` record restored under strict becomes paused and
    creates no `DownloadTask`;
  - `SELECT_MODEL` in strict is refused before `retiringCurrent`;
  - a missing-resume-data pause still stops the download (R10f).
- `updateCheck.test.ts`, `updateCheckRow.test.tsx`: a check is refused
  in strict; the gate is asked again between check and fetch.
- `tipJarStore.test.ts`, `tipJarSection.test.tsx`: the session closes
  when strict turns on, and the alert copy names Settings → Privacy.
- Markdown: a note with `![x](https://…)` and `![x](example.com/x.png)`
  makes no image request in either mode. A link tap in strict shows the
  alert and never calls `Linking.openURL`.
- `__tests__/appConfig.test.ts` keeps asserting
  `checkAutomatically: 'NEVER'`.

On-device checks. These are the user's to run and never block the
status line, un-drafting or cleanup (AGENTS.md):

- [ ] A fresh install starts in the default mode, and Settings →
      Privacy shows it.
- [ ] Turn on strict privacy mid-download (Pixel 6, iPhone): progress
      stops at once and the hub shows paused. Kill and relaunch: still
      paused, and the partial file is still there. Step out: still
      paused until Resume. Resume continues from where it stopped.
- [ ] In strict privacy, with a proxy or router log running from
      process start, launch the app and use every journal feature. The
      app makes no request.
- [ ] Strict privacy survives a relaunch.
- [ ] Tip jar, update check, a link in a note, and Resume each show
      their alert in strict privacy.
- [ ] Strict privacy with no model: the hub notice shows, and stepping
      out from the hub works.
- [ ] iOS: watch a proxy log at launch to see whether `expo-iap`'s
      launch-time listener causes any traffic. This is evidence for
      OQ-5.

## Open questions for the owner

INTENT.md and the ROADMAP do not decide these. Step 2 waits on the
answers. None of them is decided in this spec.

- **OQ-1 — The default mode's name.** The charter calls it "the app's
  default mode" and does not name it on screen. This spec uses
  "Standard" as a working name. Curated Thoughts' modes are Strict,
  Ephemeral and Connected, and its default is Strict. None of those
  names fits this mode, which is not strict and connects nothing new.
  What should the user see?
- **OQ-2 — The existing "Import custom .gguf" in strict privacy.** The
  model hub already has this row (`src/app/model-hub/import.tsx`). It
  uses the OS document picker, runs a smoke test, and has no manifest
  byte or integrity check. Under the charter's picker exception it
  reaches nothing itself, so a user in strict privacy could install a
  model with it today, before #115. Should it stay available in strict
  privacy, or be hidden there until #115 lands? (Note: its cleanup
  deletes curated model files that are not the current model,
  including a download kept by R10.)
- **OQ-3 — Links inside notes, in the default mode.** In strict
  privacy they are blocked (R5). In the default mode, rule 9's list
  (downloads, update checks, tips) does not name them. Should a tap
  open the link in the browser (the user started it), or show an
  explanation as strict privacy does?
- **OQ-4 — Remote images in notes: confirm the block in both modes.**
  Today a note that contains `![…](https://…)` loads that image on its
  own as soon as the note is shown. A note can come from the model or
  from an imported bundle. Rule 9 ¶2 ("nothing else runs on its own")
  rules this out of the default mode, so this spec blocks it in both
  modes (R6). That means the default mode is not exactly today's
  behavior. Confirm.
- **OQ-5 — `expo-iap`'s iOS listener at launch.** On iOS, `expo-iap`
  starts a StoreKit listener at every launch, before any JavaScript.
  JS cannot gate it. This survey found no request it sends. Removing it
  is a native change, so MAJOR. Is it acceptable under rule 11's
  "nothing that can reach outside may act before the mode is honored"
  until evidence says otherwise? Or must it go, as a separate MAJOR on
  the release train?
- **OQ-6 — A strict pause with no resume data.** If the platform
  returns no resume data, or the pause fails, R10f stops the download
  anyway and keeps the partial file. A later Resume then starts the
  download over from zero. Is that acceptable?
