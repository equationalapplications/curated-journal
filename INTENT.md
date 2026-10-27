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

Statuses were checked against the code on 2026-10-27. Update a status line
in the same pull request that changes the behavior.

## Why Curated Journal exists

Most mobile AI apps assume a data center. They stream your private notes to
a hosted model, need a network connection to be useful, and run invisible
background work that drains the battery. Curated Journal is the opposite: a
personal journal and knowledge base that works completely offline, on the
phone, with nothing leaving the device.

You write ordinary journal entries. An on-device language model reads them
and organizes them into a small, searchable body of knowledge — notes,
connections, and citations. You can explore that knowledge as a graph,
ask questions about it, and export or import it in an open format. The
phone is the whole product: no account, no backend, no sync.

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
  entries into notes and connections (librarian), and repairing or retiring
  stale ones (heal).
- **Emergent ontology** — the default mode in which the model invents its
  own note categories and link types, instead of following a fixed schema.
- **OKF** — the Open Knowledge Format, the zip bundle used for import and
  export.
- **Citation chip** — the tappable `[cite:fact_id]` marker in an assistant
  reply that scrolls to the source note.
- **Runtime island** — the set of installed app binaries that a given
  over-the-air (OTA) update can reach; native changes start a new island.

## The rules

### 1. The app works with no network

After a model is installed, every feature — writing, organizing, asking,
exploring the graph, importing and exporting — works in airplane mode. No
feature may require a backend call.

*Why:* the product's promise is privacy and reliability; a journal that
stops working in a basement or a flight is not a journal.

**Status: Built.**

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

**Status: Built.**

### 6. Knowledge is portable in the open format

The app imports and exports OKF (Open Knowledge Format) zip bundles, and
imports legacy v0.1 bundles. Export writes what the engine actually
stores; import is resumable and cancellable, and reports honest progress.

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

### 9. Data stays in the sandbox

All user data stays in the app's local storage. No analytics SDK, no
accounts, no cloud sync. The only network traffic is model downloads the
user starts and OTA update checks.

*Why:* privacy is the product, not a feature flag.

**Status: Built.**

### 10. Every change to main carries a version bump, decided by OTA compatibility

A change that breaks over-the-air updates for installed binaries is a
MAJOR bump; an OTA-safe user-visible feature is MINOR; a fix is PATCH.
The full policy and release train live in `docs/VERSIONING.md`. When in
doubt, regenerate the native project on a scratch branch — if it changes
at all, the bump is MAJOR.

*Why:* installed phones can only receive updates their binary can run;
the version number is how the app tells them apart.

**Status: Partly built.** OTA updates are configured (expo-updates,
production channel, app-version runtime policy) but the delivery path has
not been smoke-tested on a device and no rollback drill has been run.

## Out of scope (don't build these here)

- **Cloud sync, accounts, or a hosted backend.** The product is the phone;
  a backend would undo rule 1 and rule 9. Revisiting this requires its own
  decision and a demonstrated need that on-device portability (rule 6)
  cannot meet.
- **Background maintenance passes.** They are killed or throttled by
  mobile OSes, drain battery, and hide cost from the user — Night Shift
  (rule 4) exists so the cost is seen and consented to.
- **A second embedding model for retrieval.** It competes with the
  inference model for the same finite RAM and battery (rule 5). Changing
  retrieval needs a spec and measurements, not an extra dependency.
- **A hand-curated ontology editor.** The engine supports a strict schema,
  but exposing it is deferred, not refused: a later version may add it as
  a settings surface once the emergent explorer has shown the need.
- **Silent model installs.** Models enter the device only through an
  explicit user action in the model hub (rule 2).

## How changes are made

1. **Spec first.** Write a spec under `docs/superpowers/specs/`, based on
   an investigation that reads the real code (not memory). Spec, plan, and
   implementation go in one pull request.
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
   build the artifact through the machine's heavy-build wrapper.
