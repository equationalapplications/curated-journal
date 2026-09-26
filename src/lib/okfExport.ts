import { Directory, File, Paths } from 'expo-file-system';
// SAF lives in the legacy entry point in SDK 57 (the main index does not
// re-export it despite the docs comment saying otherwise).
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { formatOkfBundle, type MemoryDump } from '@equationalapplications/expo-llm-wiki';
import { zip } from 'react-native-zip-archive';

function ensureDirectory(root: Directory, relativePath: string): Directory {
  const parts = relativePath.split('/').filter(Boolean);
  return parts.reduce((parent, part) => {
    const next = new Directory(parent, part);
    next.create({ idempotent: true });
    return next;
  }, root);
}

export async function exportOkfFromDump(
  dump: MemoryDump,
  options: { share?: boolean } = {},
): Promise<string> {
  const id = Crypto.randomUUID();
  const exportDir = new Directory(Paths.cache, `export-${id}`);
  exportDir.create({ idempotent: true });
  try {
    // Deliberate profile pin (spec §5.3): the library default is already
    // llm-wiki/2, but pinning it here means a future default flip cannot
    // silently change our export format.
    const { files } = formatOkfBundle(dump, { profile: 'llm-wiki/2' });

    for (const file of files) {
      const parts = file.path.split('/');
      const fileName = parts.pop()!;
      const parent = parts.length ? ensureDirectory(exportDir, parts.join('/')) : exportDir;
      const out = new File(parent, fileName);
      out.create({ overwrite: true });
      out.write(file.content);
    }

    const zipFile = new File(Paths.cache, `export-${id}.zip`);
    await zip(exportDir.uri, zipFile.uri);
    if (options.share !== false && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(zipFile.uri, { mimeType: 'application/zip' });
    }
    return zipFile.uri;
  } finally {
    // The temp dir is cleaned up even when zip/share throws (CodeRabbit
    // resource-leak finding on PR #27).
    exportDir.delete();
  }
}

/**
 * Save a finished zip into a folder THE USER PICKS on-device. Primary export
 * path per Kurt: "the first option should be to export it to the device file
 * system."
 *
 * SDK 57 grounded choices (docs + package source, Sep 2026):
 * - `File.pickDirectoryAsync` is NOT public in 57.0.7 (internal types only).
 * - The legacy SAF namespace (`expo-file-system/legacy`) is the supported
 *   write-to-picked-folder API; `requestDirectoryPermissionsAsync` takes an
 *   optional seed URI and `getUriForDirectoryInRoot('Download')` builds the
 *   correct TREE-form URI. Seeding matters: without it the SAF dialog
 *   reopens at the last-used provider (usually Drive), whose account-scoped
 *   trees reject `createFileAsync` ("isn't writable" — device repro).
 * Falls back to the OS share sheet when the user cancels the picker.
 */
export async function saveOkfToDevice(zipUri: string, fileName: string): Promise<void> {
  const downloadsRoot = StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsRoot);
  if (perms.granted) {
    const destUri = await StorageAccessFramework.createFileAsync(
      perms.directoryUri,
      fileName,
      'application/zip',
    );
    const file = new File(zipUri);
    await StorageAccessFramework.writeAsStringAsync(destUri, await file.base64());
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(zipUri, { mimeType: 'application/zip' });
  }
}
