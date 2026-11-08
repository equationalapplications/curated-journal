/**
 * Shared download-failure taxonomy and Int64 boundary normalization for the
 * model download pipeline (service + state machine).
 *
 * Kept free of native imports on purpose: expo-file-system must stay out of
 * the machine's module graph, and this module is the single source of truth
 * both layers classify through.
 */

export type DownloadErrorCode = 'disk-full' | 'network' | 'unknown';

/**
 * SDK 58's expo-file-system delivers native Int64 values (progress payload
 * fields, `File.size`) as BigInt at runtime even though its TypeScript
 * contract says `number`. BigInt leaks are not benign: `bigint === number` is
 * always false (which would fail every size verification and delete completed
 * downloads), and mixing BigInt with number arithmetic throws `TypeError:
 * Cannot convert N to BigInt` (issue #91's hidden failure, first seen as a
 * render crash on the first progress event). Coerce at every crossing.
 */
export function coerceInt64(value: unknown): number {
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : Number.POSITIVE_INFINITY;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return Number.POSITIVE_INFINITY;
}

const NETWORK_ERROR_PATTERN =
  /NSURLErrorDomain|kCFErrorDomainCFNetwork|network connection|appears to be offline|offline|unable to resolve host|internet connection|ECONN(RESET|REFUSED|ABORTED|ETIMEDOUT)?|ENOTCONN|ENETDOWN|timed?\s*out|socket/i;

/**
 * Classify a download failure for user-facing messaging.
 *
 * `disk-full` and `network` are reserved for failures we can NAME — the copy
 * for each makes a specific promise (free up space / check your connection).
 * Everything else is `unknown`, and the UI surfaces the raw error text rather
 * than guessing a network problem that misdirects the user (and hid the SDK 58
 * BigInt crash behind "check your connection" for a whole debug round).
 */
export function classifyDownloadError(error: unknown): DownloadErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC|NSFileWriteOutOfSpaceError/.test(message)) return 'disk-full';
  if (NETWORK_ERROR_PATTERN.test(message)) return 'network';
  return 'unknown';
}
