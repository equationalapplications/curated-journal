/**
 * Explicit update-check trigger (INTENT.md rules 9/10/11; issue #68).
 *
 * Automatic launch-time update checks are disabled (`app.config.ts`
 * checkAutomatically: 'NEVER') so strict privacy holds from app start.
 * This module is the one sanctioned way to check: the user taps the
 * button in Settings, and the network call happens only then.
 *
 * No auto-reload: applying an update restarts the app, which would
 * interrupt a journal session. The result tells the user to restart.
 */
import * as Updates from 'expo-updates';

export type UpdateCheckResult =
  | 'up-to-date'
  | 'update-downloaded'
  | 'blocked-on-device'
  | 'unavailable';

export class UpdateCheckError extends Error {}

function assertNever(value: never): never {
  throw new Error(`Unhandled update-check state: ${String(value)}`);
}

export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  // Dev builds and disabled-OTA environments have no update channel.
  if (__DEV__ || !Updates.isEnabled) {
    return 'unavailable';
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    // A rollback directive (server says: revert to the embedded bundle) is
    // actionable even though isAvailable/isNew are false — with launch-time
    // checks off, this trigger is the only path that delivers it.
    const checkRollback =
      'isRollBackToEmbedded' in check && check.isRollBackToEmbedded;
    if (!check.isAvailable && !checkRollback) {
      // Only a previously-failed update is a real dead end the user should
      // hear about. UPDATE_REJECTED_BY_SELECTION_POLICY is the steady state
      // when the server's latest bundle isn't newer than the running one —
      // reporting that as "blocked" would be false on every current
      // install. ROLLBACK_* rejections default to up-to-date.
      if (
        'reason' in check &&
        check.reason ===
          Updates.UpdateCheckResultNotAvailableReason.UPDATE_PREVIOUSLY_FAILED
      ) {
        return 'blocked-on-device';
      }
      return 'up-to-date';
    }
    const fetched = await Updates.fetchUpdateAsync();
    const fetchRollback =
      'isRollBackToEmbedded' in fetched && fetched.isRollBackToEmbedded;
    if (!fetched.isNew && !fetchRollback) {
      return 'up-to-date';
    }
    return 'update-downloaded';
  } catch (error) {
    throw new UpdateCheckError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

export function describeUpdateCheckResult(result: UpdateCheckResult): string {
  switch (result) {
    case 'up-to-date':
      return 'You’re up to date.';
    case 'update-downloaded':
      return 'Update downloaded. Restart the app to install it.';
    case 'blocked-on-device':
      return 'An update is available, but this device can’t install it right now.';
    case 'unavailable':
      return 'Updates aren’t available in this build.';
    default:
      return assertNever(result);
  }
}
