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
  const { files } = formatOkfBundle(dump);

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop()!;
    const parent = parts.length ? ensureDirectory(exportDir, parts.join('/')) : exportDir;
    const out = new File(parent, fileName);
    out.create({ overwrite: true });
    out.write(file.content);
  }

  const zipPath = `${Paths.cache}export-${id}.zip`;
  await zip(exportDir.uri, zipPath);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(zipPath, { mimeType: 'application/zip' });
  }
  exportDir.delete();
}
