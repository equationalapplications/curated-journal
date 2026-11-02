/**
 * Tip jar configuration (spec: docs/superpowers/specs/2026-11-02-tip-jar.md).
 *
 * Product IDs are identical in App Store Connect and Google Play Console.
 * Names are ours; prices are never written here — they come from the store,
 * localized, when the user opens the tip jar.
 */
export const TIP_PRODUCTS = [
  { id: 'tip_coffee_299', name: 'Coffee' },
  { id: 'tip_coffee_499', name: 'Big coffee' },
  { id: 'tip_coffee_999', name: 'Coffee for the team' },
] as const;

export type TipProductId = (typeof TIP_PRODUCTS)[number]['id'];

export const TIP_PRODUCT_IDS: readonly TipProductId[] = TIP_PRODUCTS.map((p) => p.id);

export function isTipProductId(id: string): id is TipProductId {
  return (TIP_PRODUCT_IDS as readonly string[]).includes(id);
}

/**
 * The web build's "Support" link (PayPal). Empty until the owner creates
 * it; the link renders only when this is non-empty, and only on web — the
 * iOS and Android apps take tips through their store's in-app purchase.
 */
export const SUPPORT_PAYPAL_URL = '';
