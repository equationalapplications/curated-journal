# LEDGER — 2026-11-06-sideload-signing-brand-followup

Transient decision log while the cycle is in flight. Deleted in the
same-PR cleanup commit.

- 2026-11-06 — User ruling (this session): all 11 review findings fixed
  now, blockers + hygiene in one PR; release train only after blockers.
- 2026-11-06 — Bump is MAJOR 7.0.0, not PATCH: adaptive/splash assets and
  an `app.json` plugin both feed native prebuild (VERSIONING rule 1; same
  reasoning as #85's 6.0.0).
- 2026-11-06 — No new keystore: `credentials/keystore.properties` already
  points at the EAS upload keystore (verified SHA-1/SHA-256 via keytool);
  GitHub-APK lineage from 7.0.0 = upload key, doc'd in VERSIONING.md, so
  the gap reduces to guard + verification + docs.
- 2026-11-06 — Adaptive art derived from the 1024 master by chroma-key
  (no designer variants exist); PR shows rendered results for approval.
- 2026-11-06 — Guard no-ops when keystore.properties exists (EAS path
  untouched); EAS supplies its own properties, so store builds unaffected.
