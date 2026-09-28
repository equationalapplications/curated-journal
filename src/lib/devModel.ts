import { File, Paths } from 'expo-file-system';

import { MODEL_CATALOG, type CuratedModel } from '@/catalog/modelManifest';
import { setModelId, setModelPath } from '@/lib/entityStorage';
import { verifyDownload } from '@/services/modelDownloadService';

/**
 * How a development build picks its LLM (`EXPO_PUBLIC_DEV_LLM`):
 *
 * - `auto` (default in dev): if no model is configured yet but a catalog model
 *   is already on the device (e.g. copied there by `npm run dev:model`), adopt
 *   it and skip the model hub, so clearing app data or reinstalling the dev
 *   client doesn't mean re-downloading 2-3 GB through the app.
 * - `mock`: boot on the mock provider, for emulators and simulators where
 *   llama.rn can't load a model (e.g. x86_64 Android emulators).
 * - `off`: the normal first-run flow, as in release builds.
 *
 * Release builds always behave as `off`.
 */
export type DevLlmMode = 'off' | 'auto' | 'mock';

export function devLlmMode(
  value: string | undefined = process.env.EXPO_PUBLIC_DEV_LLM,
  dev: boolean = __DEV__,
): DevLlmMode {
  if (!dev) return 'off';
  if (value === 'mock' || value === 'off') return value;
  return 'auto';
}

/** The first catalog model whose file is on disk at its exact, complete size. */
export function findCachedCatalogModel(
  isComplete: (model: CuratedModel) => boolean,
): CuratedModel | null {
  return MODEL_CATALOG.find(isComplete) ?? null;
}

/**
 * `auto` mode: adopt a catalog model already in the app's documents folder
 * (where the model hub downloads to) as if the hub had just finished.
 * Returns the model path, or null when there is nothing to adopt.
 */
export async function adoptCachedModel(): Promise<string | null> {
  const model = findCachedCatalogModel((m) => verifyDownload(new File(Paths.document, m.filename), m));
  if (!model) return null;
  const file = new File(Paths.document, model.filename);
  await setModelPath(file.uri);
  await setModelId(model.id);
  console.info(`[dev] Using cached model ${model.id} (${model.filename}); skipped the model hub.`);
  return file.uri;
}
