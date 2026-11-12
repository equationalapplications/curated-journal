#!/usr/bin/env node
// Supply-chain policy: registry package versions must have been published at
// least MIN_DAYS days ago (default 14), so a poisoned upstream release has
// time to be caught and unpublished before we install it.
//
// Modes:
//   --base <git-ref>  PR check: age-check only the package-lock.json DELTA vs
//                     <ref> (entries whose version, resolved or integrity is new; a tarball
//                     already locked in <ref> at another path is inherited). A PR
//                     whose delta is empty passes with no cooldown.
//   (no --base)       Whole-lockfile audit of every registry package — the
//                     manual `workflow_dispatch` sweep.
//
// Usage:
//   node scripts/check-release-age.mjs [--base origin/main] [--days 14]
//     [--lockfile package-lock.json] [--registry https://registry.npmjs.org/]
// Uses only Node built-ins so it can run before `npm ci`.
// To regenerate a compliant lockfile: npm install --before=<ISO date MIN_DAYS ago>
//
// First-party exemption: packages we publish ourselves (FIRST_PARTY_SCOPES) are
// not held to the cooldown, which targets third-party upstream poisoning. An
// entry is exempt only when its real package name is in the scope AND its
// tarball resolves from that scope on the npm registry, so an npm alias placed
// under our scope (e.g. "@equationalapplications/x": "npm:other@1") is still
// age-checked. Exempt entries skip the cooldown but are still existence-checked
// against the registry: a first-party version with no publish time (typo,
// failed release, lockfile drift) fails closed. Exempt entries that verify are
// listed in the output.
//
// Provenance: every node_modules entry that is not a link or bundled must
// resolve to exactly the registry's canonical tarball for its own name and
// version (<registry>/<name>/-/<basename>-<version>.tgz). That is the tarball
// npm installs, so the name and version the gate checks are the ones that
// land. A non-canonical URL (other host, git, `..` path segments, encoded
// slashes, a version or name that disagrees with the entry) or a missing
// version/resolved fails closed rather than being skipped.
import fs from "node:fs"
import { execFileSync } from "node:child_process"

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const minDays = Number(arg("--days", process.env.MIN_RELEASE_AGE_DAYS || 14))
if (!Number.isFinite(minDays) || minDays <= 0) {
  console.error(`Invalid minimum release age: ${minDays}`)
  process.exit(2)
}
const lockfile = arg("--lockfile", "package-lock.json")
const baseFlag = args.indexOf("--base")
const baseRef = baseFlag >= 0 ? args[baseFlag + 1] : undefined
if (baseFlag >= 0 && !baseRef) {
  console.error("--base requires a git ref (e.g. --base origin/main)")
  process.exit(2)
}
const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000)
const registryArg = arg("--registry", "https://registry.npmjs.org/")
if (!registryArg || registryArg.startsWith("--")) {
  console.error("--registry requires a URL (e.g. --registry https://registry.npmjs.org/)")
  process.exit(2)
}
// A non-URL value would match no lockfile `resolved` URL, so every registry
// entry would be skipped and the gate would pass without checking anything.
// Match against the parsed, normalized form (lower-case scheme and host, no
// query or hash): npm writes `resolved` URLs normalized, so an
// `HTTPS://REGISTRY.NPMJS.ORG` argument would otherwise skip every entry too.
let registryUrl
try {
  registryUrl = new URL(registryArg)
} catch {
  registryUrl = undefined
}
if (registryUrl?.protocol !== "http:" && registryUrl?.protocol !== "https:") {
  console.error(`--registry must be an http(s) URL, got: ${registryArg}`)
  process.exit(2)
}
const registryBase = `${registryUrl.origin}${registryUrl.pathname}`
const REGISTRY = registryBase.endsWith("/") ? registryBase : `${registryBase}/`
const FIRST_PARTY_SCOPES = ["@equationalapplications/"]
// Only called after the entry's `resolved` has been verified as the
// canonical registry tarball for `name`, so the name is the tarball's.
const isFirstParty = (name) => FIRST_PARTY_SCOPES.some((scope) => name.startsWith(scope))

const entryName = (path, meta) =>
  meta.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)
const canonicalTarball = (name, version) =>
  `${REGISTRY}${name}/-/${name.slice(name.lastIndexOf("/") + 1)}-${version}.tgz`

// path -> meta for every packages entry, including link:/file:/bundled ones
// (the delta comparison must see them or a changed non-registry entry would
// look new every run).
function metaMap(lock) {
  const metas = new Map()
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (path && meta && typeof meta === "object") metas.set(path, meta)
  }
  return metas
}

// Registry-checkable subset of the given paths: name -> Set(version).
// Workspace/root entries (no node_modules/ segment), links and bundled
// entries have no own tarball to age-check and are reported as skipped.
// Everything else must carry a version and the canonical registry tarball
// URL; anything else is returned in `invalid` and fails the run. First-party
// entries are returned separately as exempt versions to existence-check
// (not age-check).
function wantedFrom(metas, paths) {
  const wanted = new Map()
  const skipped = []
  const invalid = []
  const exemptWanted = new Map()
  for (const path of paths) {
    const meta = metas.get(path)
    if (!meta || !path.includes("node_modules/") || meta.link || meta.inBundle) {
      skipped.push(path)
      continue
    }
    if (!meta.version || !meta.resolved) {
      invalid.push(`${path}: missing ${meta.version ? "resolved" : "version"}; cannot verify its source`)
      continue
    }
    const name = entryName(path, meta)
    if (meta.resolved !== canonicalTarball(name, meta.version)) {
      invalid.push(
        `${path}: resolved ${meta.resolved} is not the registry tarball for ${name}@${meta.version}`,
      )
      continue
    }
    const target = isFirstParty(name) ? exemptWanted : wanted
    if (!target.has(name)) target.set(name, new Set())
    target.get(name).add(meta.version)
  }
  return { wanted, skipped, invalid, exemptWanted }
}

// The registry's `time` values are UTC ISO-8601 strings
// ("2026-10-28T15:10:57.079Z"). Anything else fails closed: `new Date(1)` is
// a valid 1970 date that would pass as "old", and V8 rolls impossible dates
// over (2026-02-30 -> 2026-03-02), so the parsed value must round-trip.
const PUBLISH_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
function parsePublishTime(value) {
  if (typeof value !== "string" || !PUBLISH_TIME.test(value)) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : undefined
}

const lock = JSON.parse(fs.readFileSync(lockfile, "utf8"))
const currentMetas = metaMap(lock)
// Fail closed: a lockfile with no readable entries (v1 format, truncated, or
// regenerated) would otherwise pass silently in either mode ("Checked 0
// packages" / "No dependency changes").
if (currentMetas.size === 0) {
  console.error(
    `${lockfile} has no "packages" entries (lockfileVersion 1 is not supported); cannot verify release ages.`,
  )
  process.exit(2)
}
let wanted
let exemptWanted = new Map()
let inherited = 0
const skipped = []
const invalid = []
let scope
if (baseRef) {
  let baseRaw
  try {
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    }).trim()
    baseRaw = execFileSync("git", ["show", `${baseRef}:${lockfile}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (err) {
    console.error(`Could not read ${lockfile} from ${baseRef}: ${String(err.stderr ?? err.message).trim()}`)
    process.exit(2)
  }
  const baseMetas = metaMap(JSON.parse(baseRaw))
  // Fail closed: a base lockfile with no readable entries would mark every
  // current entry as changed, silently turning the delta check into a
  // full-lockfile audit.
  if (baseMetas.size === 0) {
    console.error(
      `${baseRef}:${lockfile} has no "packages" entries; cannot compare the delta against a base we cannot read.`,
    )
    process.exit(2)
  }
  // A tarball already locked anywhere in base is inherited even if npm
  // re-hoisted it to a new path (keyed by name@version + source + hash).
  const tarballKey = (path, meta) =>
    `${entryName(path, meta)}@${meta.version ?? ""}|${meta.resolved ?? ""}|${meta.integrity ?? ""}`
  const baseTarballs = new Set(
    [...baseMetas].filter(([, m]) => m.resolved && m.integrity).map(([p, m]) => tarballKey(p, m)),
  )
  const changedPaths = []
  for (const [path, meta] of currentMetas) {
    const before = baseMetas.get(path)
    if (meta.resolved && meta.integrity && baseTarballs.has(tarballKey(path, meta))) {
      inherited++
      continue
    }
    // treat a changed resolved/integrity (same version, new tarball) as a change too
    if (
      before &&
      (meta.version ?? "") === (before.version ?? "") &&
      (meta.resolved ?? "") === (before.resolved ?? "") &&
      (meta.integrity ?? "") === (before.integrity ?? "")
    )
      inherited++
    else changedPaths.push(path)
  }
  if (changedPaths.length === 0) {
    console.log(`No dependency changes vs ${baseRef}; nothing to age-check.`)
    console.log(
      `${inherited} packages inherited unchanged from ${baseRef} are not re-audited in delta mode (workflow_dispatch runs the whole-lockfile audit).`,
    )
    process.exit(0)
  }
  const delta = wantedFrom(currentMetas, changedPaths)
  wanted = delta.wanted
  skipped.push(...delta.skipped)
  invalid.push(...delta.invalid)
  exemptWanted = delta.exemptWanted
  scope = `delta vs ${baseRef}`
} else {
  const all = wantedFrom(currentMetas, [...currentMetas.keys()])
  wanted = all.wanted
  skipped.push(...all.skipped)
  invalid.push(...all.invalid)
  exemptWanted = all.exemptWanted
  scope = "whole lockfile"
}

const violations = []
const failures = [...invalid]
const verifiedExempt = new Set()
const names = [...new Set([...wanted.keys(), ...exemptWanted.keys()])]
let next = 0
async function worker() {
  while (next < names.length) {
    const name = names[next++]
    let doc
    // Retry only what can be transient (network errors, 429, 5xx), with
    // backoff; a 404 or other 4xx is final.
    for (let attempt = 1; attempt <= 3 && !doc; attempt++) {
      let retryable = true
      try {
        const res = await fetch(REGISTRY + name.replace(/\//g, "%2f"), {
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          retryable = res.status === 429 || res.status >= 500
          throw new Error(`HTTP ${res.status}`)
        }
        doc = await res.json()
      } catch (err) {
        if (attempt === 3 || !retryable) {
          failures.push(`${name}: ${err.message}`)
          break
        }
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)))
      }
    }
    if (!doc) {
      if (!failures.some((f) => f.startsWith(`${name}:`)))
        failures.push(`${name}: empty or invalid registry response`)
      continue
    }
    // Publish date of name@version, or undefined after recording a failure.
    const publishedAt = (version) => {
      const published = doc.time?.[version]
      if (!published) failures.push(`${name}@${version}: no publish time in registry`)
      else {
        const at = parsePublishTime(published)
        if (at) return at
        failures.push(`${name}@${version}: unparsable publish time in registry`)
      }
      return undefined
    }
    for (const version of wanted.get(name) ?? []) {
      const at = publishedAt(version)
      if (at && at > cutoff)
        violations.push(`${name}@${version} published ${at.toISOString().slice(0, 10)}`)
    }
    // Exempt entries skip the cooldown but must still exist: fail closed on a
    // first-party version that was never published (typo, failed release,
    // lockfile drift).
    for (const version of exemptWanted.get(name) ?? []) {
      if (publishedAt(version)) verifiedExempt.add(`${name}@${version}`)
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker))

if (baseRef) {
  const versionCount = [...wanted.values()].reduce((n, s) => n + s.size, 0)
  console.log(
    `Checked ${versionCount} changed package version(s) across ${wanted.size} packages (${scope}) against a ${minDays}-day minimum release age (cutoff ${cutoff.toISOString().slice(0, 10)}).`,
  )
  console.log(
    `${inherited} packages inherited unchanged from ${baseRef} are not re-audited in delta mode (workflow_dispatch runs the whole-lockfile audit).`,
  )
} else {
  console.log(
    `Checked ${wanted.size} packages against a ${minDays}-day minimum release age (cutoff ${cutoff.toISOString().slice(0, 10)}).`,
  )
}
if (skipped.length)
  console.log(
    `Not age-checkable, skipped (workspace/link/bundled entries): ${[...new Set(skipped)].sort().join(", ")}`,
  )
if (verifiedExempt.size)
  console.log(
    `First-party, exempt from the cooldown (${FIRST_PARTY_SCOPES.join(", ")}): ${[...verifiedExempt].sort().join(", ")}`,
  )
if (failures.length) console.error(`Could not verify:\n  ${failures.sort().join("\n  ")}`)
if (violations.length) {
  console.error(`Too new for policy:\n  ${violations.sort().join("\n  ")}`)
  if (baseRef) {
    console.error(
      `Resolve by waiting until these publish dates are ${minDays} days old (or pinning releases published before ${cutoff.toISOString().slice(0, 10)}).`,
    )
  } else {
    console.error(
      `Regenerate with: rm -rf node_modules package-lock.json && npm install --before=${cutoff.toISOString()}`,
    )
  }
}
process.exit(violations.length || failures.length ? 1 : 0)
