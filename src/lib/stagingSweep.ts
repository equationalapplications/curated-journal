import { useEffect } from 'react';
import { Directory, File, Paths } from 'expo-file-system';

/** expo-document-picker copies the picked file here (Android and iOS). */
const PICKER_DIR = 'DocumentPicker';

export type StagingKind = 'export' | 'import';

/**
 * Active export ids. `exportOkfFromDump` registers its id while it runs so an
 * overlapping export's sweep never deletes its dir or zip.
 */
const activeExportIds = new Set<string>();
export function markExportActive(id: string): void {
  activeExportIds.add(id);
}
export function markExportDone(id: string): void {
  activeExportIds.delete(id);
}

function isActiveExport(name: string): boolean {
  for (const id of activeExportIds) {
    if (name === `export-${id}` || name === `export-${id}.zip`) return true;
  }
  return false;
}

/**
 * Delete the document picker's cache copy of a picked file, best-effort.
 * Only acts on URIs inside `Paths.cache/DocumentPicker/`; a user's original
 * (or an iOS security-scoped URL that was not copied) is never touched.
 */
export function deletePickerCopy(uri: string): void {
  try {
    const root = `${Paths.cache.uri.replace(/\/+$/, '')}/${PICKER_DIR}/`;
    if (!uri.startsWith(root)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('[staging] could not delete the picker copy; it is swept at launch.', e);
  }
}

/** Launch sweep, deferred so it never blocks startup. */
export function useLaunchStagingSweep(): void {
  useEffect(() => {
    // Nothing can be running at launch; the timeout runs it before any
    // user-started import or export without delaying first render.
    const t = setTimeout(() => sweepStaging(), 0);
    return () => clearTimeout(t);
  }, []);
}

/**
 * Best-effort sweep of OKF staging copies left in the cache: `export-*` and
 * `import-*` files and directories. Never throws; failures are logged.
 *
 * Share-sheet zips cannot be deleted when `shareAsync` resolves (Android
 * resolves before async targets such as Drive finish reading the content://
 * URI), so they are swept at the start of the next export and at app launch.
 * Import staging is deleted when the import ends; this catches crash leftovers.
 *
 * The 'import' kind also empties the document picker's cache directory
 * (copies of the picked journal zip). Active exports are skipped.
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
      if (isActiveExport(entry.name)) continue;
      if (prefixes.some((p) => entry.name.startsWith(p))) entry.delete();
      else if (kinds.includes('import') && entry.name === PICKER_DIR) sweepPickerDir(entry);
    } catch (e) {
      console.warn('[staging] could not delete a staging entry.', e);
    }
  }
}

function sweepPickerDir(entry: Directory | File): void {
  if (!(entry instanceof Directory)) return;
  for (const child of entry.list()) {
    try {
      child.delete();
    } catch (e) {
      console.warn('[staging] could not delete a picker copy.', e);
    }
  }
}
