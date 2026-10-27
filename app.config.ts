/**
 * Dynamic Expo config. Expo gives app.config precedence over app.json;
 * app.json stays the base and is imported so there is one source of truth.
 *
 * Runtime version: derived from the MAJOR version only (Clanker's model,
 * adopted 2026-10-27 per #64). MINOR and PATCH bumps keep the same runtime
 * version, so over-the-air updates reach every installed binary on the
 * current MAJOR; a MAJOR bump — the only class that may change native
 * surfaces — starts a new island, which requires a store install anyway.
 *
 * updates.checkAutomatically: 'NEVER' stops the native launch-time update
 * check that runs before any JavaScript (INTENT.md rule 11: strict privacy
 * must hold from app start). Update checks become an explicit app decision.
 */
import appJson from './app.json'
import { ExpoConfig } from 'expo/config'

// app.json is authored against ExpoConfig; the JSON import only widens
// its literal types, so recover them here once.
const base = appJson.expo as ExpoConfig

export function deriveRuntimeVersion(version: string): string {
  if (!/^(0|[1-9]\d*)\.\d+\.\d+$/.test(version)) {
    throw new Error(`Cannot derive runtime version from "${version}"`)
  }
  return `${version.split('.')[0]}.0.0`
}

const runtimeVer = deriveRuntimeVersion(appJson.expo.version)

export default {
  expo: {
    ...base,
    updates: {
      ...base.updates,
      checkAutomatically: 'NEVER' as const,
    },
    runtimeVersion: runtimeVer,
  },
} satisfies { expo: ExpoConfig }
