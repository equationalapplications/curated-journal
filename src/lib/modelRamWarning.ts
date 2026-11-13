import type { CuratedModel } from '@/catalog/modelManifest';
import { isBelowComfortableRam, isPositiveFinite } from '@/lib/modelLoadParams';

/**
 * Warning shown before downloading a model. Known RAM decides; unknown RAM
 * (null, 0, NaN) keeps the catalog's own static warning, as before.
 */
export function modelRamWarning(model: CuratedModel, totalMemoryBytes: number | null): string | null {
  if (!isPositiveFinite(totalMemoryBytes)) return model.deviceWarning ?? null;
  if (isBelowComfortableRam(model.minComfortableRamBytes, totalMemoryBytes)) {
    return `${model.displayName} is larger than this device comfortably runs. It may be slow, and it may fail to load.`;
  }
  return null;
}
