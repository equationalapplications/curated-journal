import { Directory, File, Paths } from 'expo-file-system';
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

export async function exportOkfFromDump(dump: MemoryDump): Promise<void> {
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
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(zipFile.uri, { mimeType: 'application/zip' });
    }
  } finally {
    // The temp dir is cleaned up even when zip/share throws (CodeRabbit
    // resource-leak finding on PR #27).
    exportDir.delete();
  }
}
