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
    if (!check.isAvailable) {
      return 'up-to-date';
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      return 'up-to-date';
    }
    return 'update-downloaded';
  } catch (error) {
    throw new UpdateCheckError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function describeUpdateCheckResult(result: UpdateCheckResult): string {
  switch (result) {
    case 'up-to-date':
      return 'You’re up to date.';
    case 'update-downloaded':
      return 'Update downloaded. Restart the app to install it.';
    case 'unavailable':
      return 'Updates aren’t available in this build.';
    default:
      return assertNever(result);
  }
}
