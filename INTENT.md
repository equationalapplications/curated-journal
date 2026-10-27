# INTENT — Curated Journal

**Read this file first.** It explains why Curated Journal exists, the rules
it must follow, what it deliberately does not do, and how changes are made.
If this file and another document disagree, this file wins on *intent* (what
we are trying to do) and the specs win on *detail* (exactly how).

Each rule has a **Status** line saying how much of it the code does today:

- **Built** — the code does this.
- **Partly built** — some of it exists; the line says what is missing.
- **Planned** — decided, but not in the code yet.
- **Open decision** — not decided yet.

Statuses were checked against the code on 2026-10-27. Every **Built** and
**Partly built** line below reflects that check. Rules 11 through 14 were
added afterwards to carry a newly ruled extension of the product's
intention; they are **Planned**, and nothing in the code implements them
yet. Update a status line in the same pull request that changes the
behavior.

## Why Curated Journal exists

Most mobile AI apps assume a data center. They stream your private notes to
a hosted model, need a network connection to be useful, and run invisible
background work that drains the battery. Curated Journal is the opposite: a
personal journal and knowledge base that works completely offline, on the
phone, with none of your data leaving the device.

You write ordinary journal entries. An on-device language model reads them
and organizes them into a small, searchable body of knowledge — notes,
connections, and citations. You can explore that knowledge as a graph,
ask questions about it, and export or import it in an open format. Out of
the box, the phone is the whole product: no account, no backend, no sync.
That is the default today, and it stays the default.

Curated Journal is also one app in a small family of products from the
same maker, and the family is where the product is headed. Its sibling
desktop app, Curated Thoughts, established the pattern the family follows:
the user picks a **privacy mode**, and the strictest mode cuts the app off
from the internet entirely. Curated Journal will follow the same pattern.
A user who wants more than the offline journal can step out of strict
privacy, one explicit and informed choice at a time, and unlock
connectivity: syncing their knowledge with **SynapseTree**, the family's
cloud knowledge service, or pairing with **Synapse Core** hardware — tiny
safety-and-memory devices for small drones that use the user's phone as
their brain. Curated Journal is the phone side of that pairing. None of
this connectivity exists in the code yet; it is written here so that every
spec for it starts from the same promise.

That promise is sovereignty. The knowledge the app organizes on the phone
belongs to the user. Sending it anywhere — to the cloud service, to a
hardware device — is a choice the user makes on purpose, through a privacy
mode, and never something the app does quietly on its own.

Curated Journal is also a working reference for developers: it shows, end
to end, how to build this class of app — local database, on-device
inference, and maintenance passes that respect real hardware limits.

## Glossary

- **Wiki engine** — `@equationalapplications/expo-llm-wiki`, the library
  that owns the local database, prompt construction, and knowledge writes.
  The app never writes knowledge tables directly.
- **Model hub** — the in-app screen for finding, downloading, and managing
  on-device models.
- **GGUF** — the quantized model file format the app runs on-device.
- **BYOI** — "bring your own inference": the app ships no model and calls
  no hosted AI service; you install the model you want.
- **Night Shift** — the full-screen maintenance mode that runs the heavy
  librarian and heal passes in the foreground while the device charges.
- **Librarian / heal pass** — the engine's two upkeep jobs: organizing
  entries into notes and connections (librarian), and repairing or
  retiring stale ones (heal). The engine also offers re-embedding and
  prune operations; the app has wired but never queues them.
- **Emergent ontology** — the default mode in which the model invents its
  own note categories and link types, instead of following a fixed schema.
- **OKF** — the Open Knowledge Format, the zip bundle used for import and
  export.
- **Citation chip** — the tappable `[cite:fact_id]` marker in an assistant
  reply that scrolls to the source note.
- **Runtime island** — the set of installed app binaries that a given
  over-the-air (OTA) update can reach. Today the island is derived from
  the app version, so *every* version bump starts a new island; the
  intended behavior, in which only native changes split the island, is
  not yet in place (see rule 10).
- **Privacy mode** — a setting the user picks that decides whether and how
  the app itself may communicate beyond the device. The strictest mode,
  **strict privacy**, allows no off-device communication by the app of any
  kind — no internet, no Bluetooth, no local network. (Files the user
  explicitly hands to an OS picker or share sheet move at the user's
  chosen destination; that is the user's action, not the app's network
  access.) Each less strict mode unlocks a further, named set of
  connectivity settings. Not yet in the code.
- **Curated Thoughts** — the family's desktop app, and the sibling whose
  privacy-mode pattern Curated Journal adopts.
- **SynapseTree** — the family's cloud knowledge service. A user who
  chooses a privacy mode that allows it can sync their knowledge with it.
  Not yet connected to this app.
- **Synapse Core** — the family's hardware line: tiny safety-and-memory
  devices for small drones that use the user's phone as their brain.
  Curated Journal is the phone side of that pairing. Not yet connected to
  this app.
- **Synapse Core Lite** — the entry tier of Synapse Core hardware; it
  relies on the phone for memory.
- **Synapse Core Solo** — the higher tier of Synapse Core hardware, with
  its own on-board memory.

## The rules

### 1. The app works with no network

After a model is installed, every feature of the journal — writing,
organizing, asking, exploring the graph, importing and exporting — works in
airplane mode. No feature of the journal may require a backend call. (On
web, OKF import is a native-only capability and is unavailable — a platform
limitation, not a network dependency.) The connectivity a privacy mode can
unlock (rules 12 and 14) is an addition on top of the journal; the journal
never comes to depend on it.

*Why:* the product's promise is privacy and reliability; a journal that
stops working in a basement or a flight is not a journal.

**Status: Built.** (The additions named in rules 12 and 14 do not exist
yet; today there is nothing for the journal to depend on.)

### 2. Inference is bring-your-own

The app runs quantized GGUF models on-device through `llama.rn`. It never
ships a model silently, never calls a hosted AI service, and never makes a
feature depend on one provider's model. The model hub makes model
download, selection, and deletion explicit and user-controlled.

*Why:* the user owns the model choice and the data that flows through it.

**Status: Built.**

### 3. All memory lives in local SQLite, through the wiki engine

Knowledge is stored on-device in SQLite via the wiki engine, which uses
prefixed tables so its schema never collides with the app's own tables
(such as chat history). App code does not write knowledge tables directly.

*Why:* one storage owner means migrations, integrity, and backups have a
single accountable component.

**Status: Built.**

### 4. Heavy maintenance runs only in the foreground Night Shift

The librarian and heal passes run only when the user starts Night Shift,
with the screen kept awake and the device charging. Automatic background
passes are disabled. (On web, Night Shift skips the charging gate — the
browser battery API is unreliable outside Chromium.)

*Why:* mobile operating systems kill or throttle background work, and a
silent heavy pass drains the battery of the device that holds the user's
journal.

**Status: Built.**

### 5. Retrieval is keyword search, not embeddings

Answering questions retrieves notes with keyword search (MiniSearch,
inside the wiki engine). No second embedding model runs alongside
inference.

*Why:* RAM and battery on a phone are finite; running a second model next
to the inference model is the design error this rule exists to prevent.

**Status: Built.** The engine exposes re-embedding and prune operations
and the app has wired them (`journalWikiMachine.ts`, `useJournalWiki`,
`nightShiftCopy.ts`) but never queues them; removing those dead paths is
tracked cleanup (issue #64).

### 6. Knowledge is portable in the open format

The app imports and exports OKF (Open Knowledge Format) zip bundles, and
imports legacy v0.1 bundles. Export writes what the engine actually
stores; import persists partial progress (chunks already imported stay
imported), is cancellable, and reports honest progress.

*Why:* the user's knowledge must not be held hostage by the app.

**Status: Built.**

### 7. The graph is emergent, not hand-edited

The default ontology mode lets the model invent note categories and link
types during maintenance. The graph explorer visualizes what the engine
actually discovered — it does not impose a fixed schema or let the user
hand-curate one.

*Why:* the product demonstrates what a model can organize on its own; a
hand-built taxonomy would answer a different question.

**Status: Built.** (The engine also supports a strict, user-defined
schema; exposing that in the UI is deferred — see out of scope.)

### 8. Assistant answers cite their sources

When the assistant answers from journal memory, its reply carries tappable
citation chips that scroll to the source note. An answer that cannot point
at its sources is a bug, not a style choice.

*Why:* a private journal's trust depends on being able to check what the
model claims.

**Status: Built.**

### 9. Data stays in the sandbox unless the user chooses otherwise

All user data stays in the app's local storage. There is no analytics SDK
and no account. Today there is no cloud sync of any kind, and the only
network traffic is model downloads the user starts and OTA update checks
and downloads, on every launch.

That behavior is also the app's default mode: the everyday setting needs
no switch, and it consists of model downloads the user starts and OTA
update checks — nothing else. The privacy modes in rules 11 through 14
are the one sanctioned way for user data to go anywhere else, and each of
them starts from an explicit choice by the user. Strict privacy will
tighten today's behavior further, not loosen it: in that mode nothing
reaches beyond the device, update checks included.

*Why:* privacy is the product, not a feature flag.

**Status: Built** for today's behavior in paragraph 1 and for the
default-mode naming that opens paragraph 2; the privacy-mode machinery
the rest of that paragraph describes (rules 11 through 14) is
**Planned**.

### 10. Every change to main carries a version bump, decided by OTA compatibility

A change that breaks over-the-air updates for installed binaries is a
MAJOR bump; an OTA-safe user-visible feature is MINOR; a fix is PATCH.
The full policy and release train live in `docs/VERSIONING.md`. When in
doubt, regenerate the native project on a scratch branch — if it changes
at all, the bump is MAJOR.

*Why:* installed phones can only receive updates their binary can run;
the version number is how the app tells them apart.

**Status: Partly built.** OTA updates are configured (expo-updates,
production channel), but under the current app-version runtime policy
every version bump starts a new runtime island, so updates do not yet
reach installed binaries the way the bump classes intend. Changing that
policy is planned native work and will be a MAJOR change (issue #64). The
delivery path has not been smoke-tested on a device and no rollback drill
has been run.

### 11. The user picks a privacy mode, and strict privacy means nothing leaves the device

The user will choose a privacy mode, following the pattern of the sibling
desktop app, Curated Thoughts. In strict privacy the app cannot
communicate beyond the device for any reason — no internet, no Bluetooth,
no local network; no update checks, no model downloads, no pairing; no
exceptions. Strict privacy holds from the moment the app starts: nothing
that can reach outside may act before the mode is honored (making that
true today is expected to ship as a native, MAJOR change). A user in
strict privacy who wants a new model steps out of strict privacy on
purpose, gets the model, and steps back; the app never makes that trip
for them. A device left in strict privacy receives no over-the-air
updates, including security fixes; updates arrive when the user steps out
of strict privacy or installs a new binary. Files the user explicitly
hands to an OS picker or share sheet are the user's chosen destination,
not the app's network access. Everything the journal does (rule 1) keeps
working in strict privacy.

*Why:* a privacy promise with an exception is a promise with a hole, and
the user cannot see how big the hole is. A mode that means "nothing, ever"
is one the user can trust without reading the code.

**Status: Planned.** There is no privacy mode setting in the code. Today
the app's network behavior is fixed as rule 9 describes.

### 12. Each privacy mode away from strict unlocks connectivity step by step

Every privacy mode less strict than strict privacy unlocks a named,
bounded set of connectivity settings — for example, syncing knowledge
with SynapseTree, or pairing with Synapse Core hardware.
Each step away from strict privacy is an explicit, informed choice: the
user is told in plain language what that step allows the app to do and
with whom, and nothing is unlocked that the user has not chosen. A mode
never bundles in more connectivity than its description says.

*Why:* the user should be able to trade privacy for capability in small,
understood steps, and should never discover afterwards that one switch
turned on more than it said.

**Status: Planned.** No privacy modes, no sync, and no hardware pairing
exist in the code.

### 13. Locally organized knowledge stays sovereign

The knowledge the app organizes on the phone belongs to the user and
stays theirs. Syncing it with SynapseTree, or consolidating it into a
cloud or hardware knowledge graph, happens only because the user chose a
privacy mode that allows it and then chose to do it. It is never an
automatic background behavior, never a default, and never a condition of
using the journal. Knowledge that arrives from the cloud service or from
hardware enters the journal only through the engine, under the same mode
rules as knowledge leaving. The user can stay in strict privacy forever
and lose nothing the journal does today.

*Why:* the product's founding claim is that private notes do not belong
in a data center unless their owner says so. Extending the product to a
cloud service and to hardware must not quietly reverse that claim.

**Status: Planned.** Nothing in the code can sync or consolidate
knowledge anywhere; this rule is written down now so that the first spec
to add such a thing starts from it.

### 14. Curated Journal is the phone side of Synapse Core

Synapse Core devices are small: a Lite device has no memory of its own,
so the phone runs the model and is the system of record; a Solo device
carries its own memory as a user-controlled replica of what the phone
holds. When a user has unlocked hardware pairing through a privacy mode
(rule 12), Curated Journal is the app that pairs with the device and
serves as its phone-side brain, in a pairing session the user starts and
runs. An active pairing session is not sync (rule 13): it exists only
while the user is running it, and it carries only the in-mission data the
mode's description names. Writing to or refreshing a Solo replica is sync
under rule 13 and needs its own explicit choice. What the phone may
spend — battery, RAM, a model's attention — during a mission is an open
decision.

*Why:* the family's hardware is only useful with a phone-side partner,
and that partner must honor the same privacy rules as the journal — a
drone accessory must not become the back door to the user's notes.

**Status: Planned.** The app has no hardware pairing of any kind in the
code, and the resource budget for phone-side inference in a mission is an
**Open decision**.

## Out of scope (don't build these here)

Permanent non-goals and deferrals are marked separately. A deferral may be
revisited through a spec; a permanent non-goal needs this file amended
first.

- **A required account or a backend the journal depends on to work.**
  *Permanent.* The journal must work in airplane mode forever (rule 1).
  Syncing with the cloud service was once ruled out entirely; that
  position has been superseded by rules 12 and 13, which allow sync only
  through a privacy mode the user chose. What has not changed, and will
  not: the journal never requires a backend, an account, or a connection
  to do its job. A backend dependency would undo rule 1 and rule 9.
- **Automatic or background sync of any kind.** *Permanent.* Knowledge
  moves to the cloud service or to hardware only when the user has
  unlocked it through a privacy mode and asked for it (rule 13). A sync
  that runs on its own, even once, turns the privacy mode into a label
  rather than a guarantee. (An active pairing session the user starts and
  runs is not sync; it is allowed only in modes that unlock hardware
  pairing — rule 14.)
- **Any off-device communication in strict privacy.** *Permanent.* Not
  update checks, not telemetry, not model downloads, not Bluetooth or
  local-network pairing (rule 11). The first "just
  this one harmless request" is the hole that makes the whole mode
  untrustworthy.
- **Background maintenance passes.** *Permanent.* They are killed or
  throttled by mobile OSes, drain battery, and hide cost from the user —
  Night Shift (rule 4) exists so the cost is seen and consented to.
- **A second embedding model for retrieval.** *Permanent, pending
  evidence.* It competes with the inference model for the same finite RAM
  and battery (rule 5). Changing retrieval needs a spec and measurements,
  not an extra dependency.
- **A hand-curated ontology editor.** *Deferred.* The engine supports a
  strict schema, but exposing it is deferred, not refused: a later version
  may add it as a settings surface once the emergent explorer has shown
  the need.
- **Silent model installs.** *Permanent.* Models enter the device only
  through an explicit user action in the model hub (rule 2).

## How changes are made

1. **Spec first.** Write a spec under `docs/superpowers/specs/`, based on
   an investigation that reads the real code (not memory). Spec, plan, and
   implementation go in one pull request. A spec for anything in rules 11
   through 14 is checked against those rules before implementation begins;
   if it contradicts them on intent, this file is amended first.
2. **Decision history** lives in this repo — GitHub issues, pull request
   discussions, and the specs themselves. There is no private channel a
   contributor cannot read.
3. **Review, then merge.** CI must be green (type check, tests, lint,
   CodeQL), automated and independent reviews must pass, and unresolved
   questions hold the pull request.
4. **Tests gate behavior changes.** The test suite must pass with no
   regressions; a change that updates a status line in this file must
   arrive in the same pull request as the behavior change.
5. **Releases follow the train** in `docs/VERSIONING.md`: version-bump PR,
   prebuild, verify the generated version stamps before building, then
   build the release artifact on this machine (which runs builds
   through a resource-discipline wrapper — see `docs/VERSIONING.md`).
