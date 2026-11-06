const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Sideload release guard (specs/2026-11-06-sideload-signing-brand-followup).
 *
 * The template build.gradle signs release builds with the PUBLIC debug
 * keystore whenever ../credentials/keystore.properties is missing — the
 * state of every fresh clone. This plugin appends a Gradle guard that
 * fails any `*Release*` task loudly in that situation, so a release APK
 * can never silently extend the public debug-key lineage.
 *
 * No-op when keystore.properties exists (local builds sign via the
 * template's own wiring) and on EAS, which supplies its own
 * keystore.properties during store builds.
 */
const GUARD = `
// Sideload release guard — specs/2026-11-06-sideload-signing-brand-followup
// Refuse release builds that would silently sign with the public debug
// keystore. EAS supplies its own keystore.properties during store builds,
// so this only fires on machines missing credentials/.
if (!System.getenv("EAS_BUILD") && !rootProject.file("../credentials/keystore.properties").exists()) {
    tasks.whenTaskAdded { task ->
        if (task.name.contains("Release")) {
            task.doFirst {
                throw new GradleException(
                    "Release build refused: ../credentials/keystore.properties is missing, so this build would be signed with the PUBLIC debug keystore. Restore credentials/ (see docs/VERSIONING.md) or build on EAS."
                )
            }
        }
    }
}
`;

const withSideloadReleaseGuard = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes("Sideload release guard")) {
      return mod; // idempotent across repeated prebuilds
    }
    mod.modResults.contents += GUARD;
    return mod;
  });

module.exports = withSideloadReleaseGuard;
