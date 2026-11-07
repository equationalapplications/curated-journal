#!/usr/bin/env node
// Supply-chain policy: every registry package in package-lock.json must have
// been published at least MIN_DAYS days ago (default 14), so a poisoned
// upstream release has time to be caught and unpublished before we install it.
//
// Usage: node scripts/check-release-age.mjs [--days 14] [--lockfile package-lock.json]
// Uses only Node built-ins so it can run before `npm ci`.
// To regenerate a compliant lockfile: npm install --before=<ISO date MIN_DAYS ago>
import fs from "node:fs"

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const minDays = Number(arg("--days", process.env.MIN_RELEASE_AGE_DAYS ?? 14))
const lockfile = arg("--lockfile", "package-lock.json")
const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000)
const REGISTRY = "https://registry.npmjs.org/"

const lock = JSON.parse(fs.readFileSync(lockfile, "utf8"))
const wanted = new Map() // name -> Set(version)
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path || meta.link || !meta.version || meta.inBundle) continue
  if (meta.resolved && !meta.resolved.startsWith(REGISTRY)) continue
  const name = meta.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)
  if (!wanted.has(name)) wanted.set(name, new Set())
  wanted.get(name).add(meta.version)
}

const violations = []
const failures = []
const names = [...wanted.keys()]
let next = 0
async function worker() {
  while (next < names.length) {
    const name = names[next++]
    let doc
    for (let attempt = 1; attempt <= 3 && !doc; attempt++) {
      try {
        const res = await fetch(REGISTRY + name.replace("/", "%2f"))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        doc = await res.json()
      } catch (err) {
        if (attempt === 3) failures.push(`${name}: ${err.message}`)
      }
    }
    if (!doc) continue
    for (const version of wanted.get(name)) {
      const published = doc.time?.[version]
      if (!published) failures.push(`${name}@${version}: no publish time in registry`)
      else if (new Date(published) > cutoff)
        violations.push(`${name}@${version} published ${published.slice(0, 10)}`)
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker))

console.log(
  `Checked ${names.length} packages against a ${minDays}-day minimum release age (cutoff ${cutoff.toISOString().slice(0, 10)}).`,
)
if (failures.length) console.error(`Could not verify:\n  ${failures.sort().join("\n  ")}`)
if (violations.length) {
  console.error(`Too new for policy:\n  ${violations.sort().join("\n  ")}`)
  console.error(
    `Regenerate with: rm -rf node_modules package-lock.json && npm install --before=${cutoff.toISOString()}`,
  )
}
process.exit(violations.length || failures.length ? 1 : 0)
