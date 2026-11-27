import { useEffect } from 'react';
import { Platform } from 'react-native';
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

/**
 * Zip basenames protected after their export returned: a direct SAF save
 * still reads the zip (picker, createFileAsync, base64) after
 * `exportOkfFromDump` has released its id.
 */
const protectedZipNames = new Set<string>();
export function protectStagedZip(name: string): void {
  protectedZipNames.add(name);
}
export function releaseStagedZip(name: string): void {
  protectedZipNames.delete(name);
}

function isActiveExport(name: string): boolean {
  if (protectedZipNames.has(name)) return true;
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

/**
 * iOS: the document picker opens files `asCopy: true`, so iOS first places a
 * copy in `<container>/tmp/<bundle-id>-Inbox/<name>` and the module then
 * copies that into Caches/DocumentPicker/. The tmp dir is a sibling of the
 * caches dir (expo-file-system permits paths outside caches/documents; the OS
 * enforces access, and the app owns its own container tmp).
 */
function iosTmpDir(): Directory {
  return new Directory(Paths.cache, '..', '..', 'tmp');
}

/** Delete the iOS picker's `-Inbox` copy of the picked file. Best-effort. */
export function deleteIosInboxCopy(name: string | undefined): void {
  if (Platform.OS !== 'ios' || !name) return;
  try {
    for (const entry of iosTmpDir().list()) {
      if (!(entry instanceof Directory) || !entry.name.endsWith('-Inbox')) continue;
      const f = new File(entry, name);
      if (f.exists) f.delete();
    }
  } catch (e) {
    console.warn('[staging] could not delete the iOS Inbox copy; it is swept at launch.', e);
  }
}

function sweepIosInbox(): void {
  if (Platform.OS !== 'ios') return;
  try {
    for (const entry of iosTmpDir().list()) {
      if (!(entry instanceof Directory) || !entry.name.endsWith('-Inbox')) continue;
      for (const child of entry.list()) {
        try {
          child.delete();
        } catch (e) {
          console.warn('[staging] could not delete an Inbox copy.', e);
        }
      }
    }
  } catch (e) {
    console.warn('[staging] could not sweep the iOS Inbox.', e);
  }
}

let launchSweepDone = false;

/** Launch sweep, deferred so it never blocks startup. Once per process. */
export function useLaunchStagingSweep(): void {
  useEffect(() => {
    // Once per process: a RootLayout remount (Activity recreation, Fast
    // Refresh) is not a launch. At launch nothing can be running; the
    // timeout runs it before any user-started import or export without
    // delaying first render.
    if (launchSweepDone) return;
    const t = setTimeout(() => {
      launchSweepDone = true;
      sweepStaging();
    }, 0);
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
 * (copies of the picked journal zip) and, on iOS, the children of the
 * `*-Inbox` dirs in the app's tmp dir. Active exports are skipped.
 *
 * Callers pass only the kinds that cannot be in progress: at launch nothing
 * is running (both kinds); at export start an import may be open, so only
 * `export`.
 */
export function sweepStaging(kinds: StagingKind[] = ['export', 'import']): void {
  if (Platform.OS === 'web') return;
  if (kinds.includes('import')) sweepIosInbox();
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
