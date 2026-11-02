import type { TipProductId } from '@/lib/supportConfig';

/** One tip as the store offers it: our name, the store's localized price. */
export type TipOffer = { id: TipProductId; name: string; displayPrice: string };

export type TipFailure = 'unavailable' | 'network' | 'failed' | 'not-finished';

export type TipEvent =
  | { kind: 'thanks'; productId: TipProductId }
  | { kind: 'pending'; productId?: TipProductId }
  | { kind: 'cancelled' }
  | { kind: 'error'; reason: TipFailure };

export type TipJarSession = {
  /** Store-localized offers, in our display order. Empty if the store has none. */
  offers: TipOffer[];
  requestTip: (id: TipProductId) => Promise<void>;
  close: () => Promise<void>;
};

/** The store could not be reached or is not present on this device/build. */
export class TipJarUnavailableError extends Error {}
