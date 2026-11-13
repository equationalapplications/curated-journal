import { File, Paths } from 'expo-file-system';
import { MODEL_CATALOG, type CuratedModelId } from '@/catalog/modelManifest';

/**
 * Best-effort cleanup of curated model files that no longer belong to anything:
 * deletes each MODEL_CATALOG file in the documents directory that exists, is not
 * `keepModelId`'s, and whose uri is not `currentModelPath`. Swallows and warns;
 * never throws, because callers fire it and forget it.
 */
export function deleteOrphanedCuratedModelFiles(input: {
  keepModelId: CuratedModelId | null;
  currentModelPath: string | null;
}): void {
  for (const model of MODEL_CATALOG) {
    if (model.id === input.keepModelId) continue;
    try {
      const file = new File(Paths.document, model.filename);
      if (file.uri === input.currentModelPath) continue;
      if (file.exists) file.delete();
    } catch (cause) {
      console.warn('[model-hub] could not delete an orphaned model file', model.filename, cause);
    }
  }
}
