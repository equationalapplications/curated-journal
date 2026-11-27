import { Directory, File, Paths } from 'expo-file-system';

export type StagingKind = 'export' | 'import';

/**
 * Best-effort sweep of OKF staging copies left in the cache: `export-*` and
 * `import-*` files and directories. Never throws; failures are logged.
 *
 * Share-sheet zips cannot be deleted when `shareAsync` resolves (Android
 * resolves before async targets such as Drive finish reading the content://
 * URI), so they are swept at the start of the next export and at app launch.
 * Import staging is deleted when the import ends; this catches crash leftovers.
 *
 * Callers pass only the kinds that cannot be in progress: at launch nothing
 * is running (both kinds); at export start an import may be open, so only
 * `export`.
 */
export function sweepStaging(kinds: StagingKind[] = ['export', 'import']): void {
  let entries: (Directory | File)[];
  try {
    entries = new Directory(Paths.cache).list();
  } catch (e) {
    console.warn('[staging] could not list the cache for sweeping.', e);
    return;
  }
  const prefixes = kinds.map((k) => `${k}-`);
  for (const entry of entries) {
    try {
      if (prefixes.some((p) => entry.name.startsWith(p))) entry.delete();
    } catch (e) {
      console.warn('[staging] could not delete a staging entry.', e);
    }
  }
}
