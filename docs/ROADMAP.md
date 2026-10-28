# ROADMAP — what gets built, in what order

> **ROADMAP.md** · v1.0 · 2026-10-28 ·
> Authority: derived from [INTENT.md](../INTENT.md) — the fourteen-rule
> charter — and the live state of this repository on the date above
> (`main` at `3fd45cf`, version 4.0.1, Expo SDK 58). Every step below
> rests on a numbered rule; the Grounding map at the end says which. If
> this file and INTENT.md disagree, INTENT.md wins on intent and this
> file is wrong until amended. Roadmaps rot; this one is checked against
> INTENT.md like every other document, and items move down (or off) as
> reality dictates. Changing the order is an amendment: say so in the
> pull request, don't drift.
>
> Derivation note: this is the first roadmap. It was derived from
> INTENT.md rules 9 through 14 (the privacy modes, the cloud service, and
> the hardware line), from `docs/VERSIONING.md` (which decides what each
> step costs in version terms), and from what the family's other projects
> need from this one. It contains no project dates. The two dates in the
> standing items are a vendor's schedule, not ours.

Curated Journal is a journal that works with no network, runs its model
on the phone, and keeps the user's knowledge on the device unless the
on the device unless the user says otherwise. Rules 1 through 9 of the
charter are built; rule 10 is partly built (the update delivery path has
never been exercised on a device, and no rollback drill has run). Rules
11 through 14 — privacy modes, step-by-step unlocks, sovereign sync, and
the phone side of Synapse Core — are decided but not in the code. This
file turns those four rules into an ordered plan and says why each item
sits where it does.

## How to read this file

**Steps are ordered by gates, not by calendar.** Each step names the gate
that opens it. A step with an open gate is not late; it is waiting. Where
a gate is a decision nobody has made yet, the decision is listed in the
Open-decisions register below, and the step waits for it.

**Spec work and implementation are gated separately.** The charter says
spec first, and a spec is cheap to write against a known contract. So a
step may say "spec may start now; implementation waits on X." That is
deliberate: writing the spec early is how we find out whether X is
really the only gate.

**Each step carries a promise class:**

- **BINDING** — the charter already promises it. This file only decides
  the order. Dropping it means amending INTENT.md first.
- **PLANNED** — decided in principle; its detail waits on a spec, an open
  decision, or an outside dependency. Its place in the order can move by
  amendment.
- **EXPLORATORY** — named here so nobody builds it by accident, and so
  the question is on the record. No commitment to build it at all.

**Each step names its version cost** in the classes of
`docs/VERSIONING.md`: MAJOR if it changes native surfaces (new binary
required, new runtime island), MINOR if it is a new feature in JS/TS
only (ships over the air to installed 4.x binaries), PATCH for fixes.
A step whose cost is MAJOR is also gated on being able to build a binary
at all — see the build HOLD under standing items.

## Foundation — privacy modes (rules 11 and 12)

Everything that connects the app to anything — the cloud service, the
hardware — is unlocked through a privacy mode. So the modes come first,
and a mode's definition comes before any feature that mode unlocks. A
mode that enables more than it says is a charter violation, and the only
way to be sure a mode says everything is to write the mode down before
the feature exists.

### Step 1 — Privacy-mode spec: strict privacy and the default mode — BINDING

Write the spec for the privacy-mode setting itself and for its two
modes that the charter has already fully decided:

- **Strict privacy** (rule 11): the app initiates no off-device
  communication for any reason — no internet, no Bluetooth, no local
  network; no update checks, no model downloads, no pairing. (The
  charter's exception stands: a file the user hands to an OS picker or
  share sheet goes where the user sends it.) It holds from the moment
  the app starts.
  A user who wants a model steps out on purpose, gets it, and steps back.
- **The default mode** (rule 9, paragraph 2): today's behavior, given a
  name. Model downloads the user starts and update checks the user starts
  from Settings; nothing else runs on its own.

The spec must say, in the plain language the user will read on the
screen, exactly what each mode allows and with whom. It must say what
happens to a half-finished model download when the user switches to
strict privacy. It must confirm that everything the journal does (rule
1) keeps working in strict privacy, with a test that proves it.

*Gate:* none beyond the charter. This can start now and is testable
through Metro and the web browser under the build HOLD.

*Why here:* this is the foundation every later step stands on. Both
tracks below are mode-gated, and no mode can be unlocked before the
strictest one exists to be unlocked from.

*Version cost:* a spec has none. The implementation is Step 2.

### Step 2 — Build the mode system: strict privacy and the default mode — BINDING

Implement Step 1: the setting, the two modes, and the gate that makes
every network-capable code path in the app ask the mode before acting —
the update-check trigger, the model hub, and anything added later. The
native side of "strict from launch" is already configured (the
launch-time update check is set to never run) and takes effect in the
first 4.0.0 binary; this step adds the app-side mode that the native
gate was placed to protect.

*Gate:* Step 1 spec approved; CI green; the charter's review rules. The
device-level proof that strict privacy holds from launch needs the 4.0.0
binary, which waits on the build HOLD (standing items). The mode system
itself does not: it is JS/TS and can be built and tested on Metro and
the web browser now.

*Why here:* rule 11 is the promise the user can trust without reading
the code. It must be real, on a device, before any step that lets data
leave the device is even specified in its final form.

*Version cost:* MINOR, if the implementation stays in JS/TS as expected
(it ships over the air to installed 4.x binaries). If it turns out to
need a native change, it becomes MAJOR and joins the release train. Rule
9's status line and rule 11's status line change in the same pull
request.

### Step 3 — The mode ladder: the modes that unlock sync and pairing — PLANNED

Define the modes less strict than the default — the ones that unlock
syncing knowledge with SynapseTree and pairing with Synapse Core
hardware. Each is a named, bounded set of connectivity settings, told to
the user in plain language before they choose it (rule 12). The spec for
each unlock mode is written before the feature it unlocks; the feature's
own spec (Steps 4 and 6) then cites the mode by name and may not exceed
it.

The only automatic behavior the charter allows to return by this route
is the launch-time update check, as a mode unlock, "if at all" (rules 9
and 11). It is listed under Exploratory below, not here.

*Gate:* the open decision on the shape of the sync mode (Open-decisions
register). Step 2 built. Until the shape is ruled, this step is spec
investigation only: what the ladder could look like, written against the
sibling desktop app's pattern, with the choice marked as not ours to
make here.

*Why here:* this is the "mode definitions precede any unlock feature"
rule made concrete. It sits between the foundation and the two tracks
because both tracks need it and neither may run ahead of it.

*Version cost:* MINOR for the mode definitions themselves (JS/TS). The
permissions a hardware mode eventually needs belong to Step 7, not here;
defining a mode does not add a native surface.

## Track A — syncing with the cloud service (rule 13)

### Step 4 — Sync spec: explicit, mode-gated sync with SynapseTree — PLANNED

Write the spec for syncing the user's organized knowledge with
SynapseTree, under rule 13 in full: only inside a mode that unlocks it,
only when the user then chooses to do it, never in the background, never
as a default, never as a condition of using the journal. Knowledge coming
back from the cloud enters only through the wiki engine, under the same
mode rules as knowledge leaving.

What the spec must settle — these follow from the cloud service's own
founding document (its INTENT.md) and its published data-safety
promises, not from this charter:

- **One shared contract.** Every user of the cloud service — this app,
  the desktop sibling, the hardware line, outside developers — reaches it
  through the same documented API; the cloud service's founding document
  commits all four to one contract, and its engine is the same wiki
  engine this app runs. The app's engine version and the cloud's must
  stay compatible for graphs and bundles to round-trip; the spec names how
  that is checked.
- **Portability stays the open format.** The app already imports and
  exports OKF bundles (rule 6). The cloud service promises export in a
  standard, documented format on any plan (its founding document). The
  spec says how the
  on-device bundle and the cloud's export agree, so a user can leave
  either side with their knowledge intact.
- **No silent graph merging.** This app's retrieval index is keyword-only
  (rule 5). The cloud and the hardware line index with an embedding model
  of their own. The spec carries index and embedder provenance with
  anything that syncs, so that nothing built here is ever merged into a
  cloud or hardware graph without an explicit, separately confirmed
  conversion on the receiving side. This app never runs re-embedding;
  that stays true.
- **An account is never a condition.** The cloud service has accounts
  and sign-in, and a sync mode will link to one. Linking is part of the
  sync choice. The journal never asks for it to work (permanent
  non-goal).

*Gate:* Step 3's definition of the sync mode (which waits on the
sync-mode-shape decision). The cloud-side dependency — the data plane,
the API contract, and its generated developer tools — is built and live
on the cloud service's test stage today, so nothing on that side blocks
the spec. Spec investigation may start now against the live contract;
the spec is final only once the mode it cites is defined.

*Why here:* the dependency is available, the charter rule is written,
and the spec is cheap. Writing it early tells us whether the mode shape
is really the only gate, and gives the cloud service an early reading of
what this app needs from the contract.

*Version cost:* a spec has none.

### Step 5 — Build sync — PLANNED

Implement Step 4.

*Gate:* Step 4 spec approved; Steps 2 and 3 built and shipped; engine
version compatibility with the cloud confirmed at the time of build; the
charter's review rules.

*Why here:* after the mode that unlocks it, after the strict mode that
proves the app can keep a promise, and after the spec that says what
"sync" means here.

*Version cost:* MINOR if it stays in JS/TS (an HTTPS client to the
contract needs no new native surface). MAJOR the moment it needs one.
Rule 13's status line changes in the same pull request.

## Track B — the phone side of Synapse Core (rule 14)

Track B is separate from Track A and does not wait on it. A pairing
session is not sync. But the two tracks meet at one point: writing to or
refreshing a Solo device's own memory is sync under rule 13, and reuses
Track A's choice and machinery rather than inventing a second one.

### Step 6 — Pairing spec: the phone as the device's brain — PLANNED

Write the spec for pairing with Synapse Core hardware and running a
pairing session, under rule 14 in full:

- **Two tiers, one role for the phone.** A Lite device has no memory of
  its own; the phone runs the model and is the system of record for
  mission data. A Solo device carries its own memory as a user-controlled
  replica of what the phone holds.
- **A session is user-started and user-run.** It exists only while the
  user is running it and carries only the in-mission data the mode's
  description names. Nothing from a session persists into the journal
  afterwards except by a separate, explicit sync choice (rule 13).
- **The transport is the hardware line's contract, not ours to re-decide.**
  The spec adopts the hardware line's pairing and transport engineering
  documents as they stand — authentication, framing, liveness, and
  loss-of-phone behavior are theirs to define and change. This step
  carries only this app's side of that contract: running the brain loop
  inside those bounds, the session lifecycle, and the resource budget.
  It cites those documents for every detail and does not restate them.
- **The index discipline from Step 4 applies here too.** The hardware
  line indexes with its own embedding model. Nothing from this app merges
  into a hardware graph without an explicit conversion on the hardware
  or cloud side; this app carries the provenance that makes that
  enforceable.
- **Strict privacy forbids pairing** (rule 11). Pairing is a mode
  unlock (rule 12), defined in Step 3.

*Gate:* Step 3's definition of the hardware mode. The open decision on
the mission resource budget (how much battery, RAM, and inference time
the phone may spend during a mission) — a spec cannot size the session
without it. One external decision: the hardware line is still choosing
its certificate algorithm, and this app must not build against either
candidate until it is ruled; the spec marks that seam and leaves it
open. Spec investigation may start now; the spec is final only when the
budget is ruled.

*Why here:* a spec written before the budget is ruled is still useful —
it is the document the ruling will be written into — and starting it
shows whether the budget is the only gate. Implementation waits.

*Version cost:* a spec has none.

### Step 7 — Build pairing — PLANNED

Implement Step 6.

*Gate:* Step 6 spec approved; Steps 2 and 3 built and shipped; the
resource budget ruled; the hardware line's certificate decision made;
the build HOLD lifted (this step needs a binary); the charter's review
rules. Device testing needs real hardware in hand.

*Why here:* last among the steps because it has the most gates, the
highest version cost, and the only external dependency that is not yet
built on the other side.

*Version cost:* MAJOR, by definition — pairing needs new native
permissions (Bluetooth, local network), which starts a new runtime
island. It rides the release train in full. Rule 14's status line
changes in the same pull request.

## Exploratory — named so nobody builds them by accident

These carry no step number and no commitment. Each would need its own
spec, and two of them would need INTENT.md amended first.

- **Automatic launch-time update checks as a mode unlock.** The charter
  allows this to return only as a privacy-mode unlock, "if at all"
  (rules 9 and 11). Whether it returns at all is undecided; the default
  mode stays explicit-only regardless.
- **Letting the cloud service call a hosted model on the user's behalf.**
  The cloud service has a built, audited bring-your-own-key surface. This
  app never calls a hosted AI service (rule 2), so using that surface
  from here would need INTENT.md amended first. Listed so the question
  is on the record, not because anyone has asked for it.
- **A hand-curated ontology editor.** Deferred in the charter's
  out-of-scope list, not refused. It becomes a step only after the
  emergent graph explorer has shown the need.

## Standing items (not steps)

These are gated on things outside the development order — a hold, a
device, a link, a vendor's calendar. They are not steps; the gate lifting
is what moves them.

- **Build HOLD (in force since 2026-10-28).** No builds on this machine
  until lifted; development and testing run through Metro and the web
  browser only. Every item below that needs a binary waits here. The
  HOLD is a state, not a decision in this file; it lifts when its owner
  says so.
- **The 4.0.0 release train.** Steps 2 through 5 of the train in
  `docs/VERSIONING.md` for the SDK 58 binary: prebuild and verify the
  generated stamps (including that the launch-time check is baked as
  never); build through the resource-discipline wrapper; verify the
  built artifact, including the manifest entry on the artifact itself;
  tag and release. This train adds one new gate: a device smoke test of
  the release build with code shrinking pinned off, confirming the native
  inference library loads and runs on a real device before the artifact
  is tagged. Waits on the HOLD.
- **OTA smoke test and rollback drill, re-targeted to a 4.0.0 binary.**
  Rule 10 is Partly built until a published bundle has reached a device
  through the Settings trigger and a bad bundle has been rolled back on
  purpose. The drill was planned against an earlier binary and now
  targets the 4.0.0 one, because that is the island installed phones will
  be on. Waits on the release train.
- **Device QA backlog.** The keyboard and model-hub fixes that shipped on
  Metro and web still need a pass on a real device, and the database
  connection audit is owed. Waits on the HOLD; none of it is blocked on a
  step.
- **Issue #62 — About page and donate link.** Blocked on a payment link
  from the project owner. Needs a spec first (every change does). When
  unblocked it is a small MINOR on the current island and can ship over
  the air without a binary.
- **Dependency-update gate checks.** The automated dependency updates are
  adjudicated at their gate per the standing supply-chain policy: a
  14-day upstream cooldown for every version (fail-closed on unknown
  age; only a CRITICAL-security ruling breaks the gate), and
  Expo-family and native-module bumps only through their own trains.
  Two gate checks are scheduled for the currently open dependency
  bumps; their gates mature Oct 30 and Nov 10. Those are the only
  dates in this file, and they are the schedule's, not the project's.
- **Engine compatibility with the cloud service.** The app's wiki engine
  and the cloud's are the same engine at possibly different versions. Not
  a step; a condition Track A checks at every engine bump from now on, so
  that Step 5 does not arrive at a contract the engine cannot round-trip.

## Open-decisions register

These are gates, not steps. Each is owned by a person, not by a spec,
and the steps that wait on it are named. A spec may investigate around
an open decision; it may not decide it.

| Decision | Charter rule | What waits on it | Owner |
|---|---|---|---|
| **Mission resource budget** — how much battery, RAM, and inference time the phone may spend during a pairing session. | Rule 14 (named there as an open decision) | Step 6 final; Step 7 entirely. | Project owner |
| **Shape of the sync mode** — how many modes sit between the default and full connectivity, and exactly which connectivity each one names. | Rule 12 | Step 3 final; through it, Steps 5 and 7. Steps 4 and 6 may investigate but not finalize. | Project owner |

One external decision is recorded here so it is not mistaken for ours:
the hardware line's **certificate algorithm** is a hardware-side choice.
This app must not build against either candidate; Step 7 waits on it,
Step 6 marks the seam.

## Stale-docs register

Documents elsewhere in the family that describe this app in a way the
charter has since superseded. Each is a cross-repo fix owed by the other
document's owner; this file records them so the drift is visible, and
the charter governs in the meantime.

- **SynapseTree's INTENT.md describes this app as offline-first and
  "syncing with the cloud whenever a connection is available."** That
  was true of an earlier intention. Rules 12 and 13 of this charter
  narrow it: sync happens only inside a privacy mode the user chose,
  only when the user then chooses to do it, never in the background and
  never because a connection appeared. The cloud service's own data
  safety rule — nothing but the memories you choose to sync ever leaves
  your machine — already matches this charter; only the one descriptive
  line about this app is stale. Fix: a sentence in the cloud service's
  INTENT.md, through that repository's review process. Until then, this
  charter governs what this app does.

## What is intentionally absent

- **No dates.** The project runs on gates and reviews, not calendars. The
  two dependency-check dates above are a schedule, not a plan.
- **No sync or pairing implementation before its mode and its spec.**
  Steps 5 and 7 stay behind Steps 3, 4, and 6. A pull request that opens
  either early is an amendment to this file first.
- **No second embedding model.** Rule 5 is a permanent non-goal pending
  evidence. The cloud and hardware index with their own; this app carries
  provenance so they can tell, and never merges silently.
- **No building against the hardware line's unmade decisions.** The
  certificate seam stays open in Step 6 until ruled on the hardware side.
- **No internal names.** The hardware tiers are Lite and Solo, as the
  charter names them. Working names used inside the company do not appear
  in this repository.
- **No account requirement, ever.** Linking an account is part of a sync
  choice (Step 4). The journal works in airplane mode forever.

## Appendix — Grounding map

Where each item rests. "Dossier" refers to the research grounding
prepared for this draft on 2026-10-28; "charter" is INTENT.md.

| Item | Charter rules | Dossier sections |
|---|---|---|
| How to read (gates, spec-vs-implementation, promise classes, version cost) | How changes are made §1, §5; rule 10 | §4 (items 2, 3, 7) |
| Step 1 — privacy-mode spec (strict + default) | Rules 9 ¶2, 11; rule 1 | §1 (rules 11–12), §4 (items 1–2) |
| Step 2 — build the mode system | Rules 9, 11; glossary "privacy mode" | §1 (native gate shipped), §4 (item 1) |
| Step 3 — the mode ladder | Rule 12; rules 9 and 11 on the update-check unlock | §1 (rule 12), §4 (item 2) |
| Step 4 — sync spec | Rules 13, 6, 5; out-of-scope "required account", "automatic sync" | §2 (one contract, portability, sync discipline, auth), §3 (index provenance), §4 (item 3) |
| Step 5 — build sync | Rules 13, 10 | §2, §4 (item 3) |
| Step 6 — pairing spec | Rules 14, 11, 12, 13, 5 | §3 (phone-side brain, transport, liveness, index provenance, CJ-side consequences), §4 (item 4) |
| Step 7 — build pairing | Rules 14, 10 | §3 (MAJOR, cert decision), §4 (item 4) |
| Exploratory — automatic update check | Rules 9, 11 | §1 (rule 12 note) |
| Exploratory — cloud calling a hosted model | Rule 2 | §2 (BYOK shipped) |
| Exploratory — ontology editor | Rule 7; out-of-scope "hand-curated ontology editor" | — |
| Standing — build HOLD, release train, OTA drill, device QA | Rule 10; How changes are made §5; `docs/VERSIONING.md` train steps 2–5 | §1 (live constraints), §4 (item 5) |
| Standing — #62 About/donate | How changes are made §1 | §1, §4 (item 6) |
| Standing — dependency gate checks | — | §4 (item 7, vendor dates only) |
| Standing — engine compatibility | Rule 3; glossary "wiki engine" | §2 (two doors into one engine) |
| Open decision — resource budget | Rule 14 | §1, §3 |
| Open decision — sync-mode shape | Rule 12 | §1, §4 (item 2) |
| External — certificate algorithm | — | §3 (hardware-side) |
| Stale doc — cloud INTENT on auto-sync | Rules 12, 13; out-of-scope "automatic sync" | §2 (sync discipline), §5 |
| Intentionally absent — no internal names | Glossary (Lite, Solo) | §3 (naming ruling) |
