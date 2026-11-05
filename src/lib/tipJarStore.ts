/**
 * Tip jar store bridge — native (iOS / Android) build.
 * Spec: docs/superpowers/specs/2026-11-02-tip-jar.md. INTENT.md rules 9, 11.
 *
 * Nothing here runs at import or app launch. `expo-iap` is required lazily
 * inside `openTipJar`, which the tip jar UI calls only after the user taps
 * to open it and `canUseStorePurchases()` has said yes — and the bridge
 * checks the gate itself, so the strict-privacy invariant does not depend
 * on call sites asking first. That is the first
 * moment the app talks to the store: connect, then fetch the localized
 * prices. Tips are consumables, so every completed purchase is finished
 * with `isConsumable: true` (otherwise Google refunds it after 3 days and
 * the same tip cannot be bought again).
 *
 * The lazy, guarded require also keeps a binary without the ExpoIap native
 * module (an older build on the same runtime) from crashing: the tip jar
 * just reports itself unavailable. Web uses `tipJarStore.web.ts`, so the
 * web bundle never includes expo-iap at all.
 */
import { Platform } from 'react-native';
import type { Product, Purchase } from 'expo-iap';

import { canUseStorePurchases } from '@/lib/privacyMode';
import { TIP_PRODUCTS, TIP_PRODUCT_IDS, isTipProductId } from '@/lib/supportConfig';
import {
  TipJarUnavailableError,
  type TipEvent,
  type TipJarSession,
  type TipOffer,
} from '@/lib/tipJarTypes';

export * from '@/lib/tipJarTypes';

type ExpoIap = typeof import('expo-iap');

let cachedModule: ExpoIap | null | undefined;

function loadExpoIap(): ExpoIap | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    cachedModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded lazy load
    const mod = require('expo-iap') as ExpoIap;
    cachedModule = mod;
  } catch (error) {
    // Missing native module (older binary). Not fatal: no tip jar.
    console.warn(
      '[tipJar] expo-iap unavailable:',
      error instanceof Error ? error.message : String(error),
    );
    cachedModule = null;
  }
  return cachedModule;
}

/** Test seam: forget the cached module so a suite can re-mock it. */
export function resetTipJarModuleForTests(): void {
  cachedModule = undefined;
}

/**
 * Whether this build can offer in-app tips at all. Platform check only —
 * this does not touch the store or the network.
 */
export function isTipJarSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * expo-iap's listener already normalizes codes to its kebab-case ErrorCode
 * values; errors thrown from requestPurchase may carry a native spelling
 * (`E_USER_CANCELLED`). Fold both into the kebab-case form.
 */
export function normalizeTipErrorCode(error: unknown): string {
  const raw = (error as { code?: unknown } | null)?.code;
  if (typeof raw !== 'string') return '';
  const code = raw
    .trim()
    .replace(/^E_/i, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  return code === 'user-canceled' ? 'user-cancelled' : code;
}

const UNAVAILABLE_CODES = new Set([
  'iap-not-available',
  'billing-unavailable',
  'feature-not-supported',
  'service-disconnected',
  'not-prepared',
  'init-connection',
  'connection-closed',
  'item-unavailable',
  'sku-not-found',
]);
const NETWORK_CODES = new Set(['network-error', 'service-timeout', 'remote-error']);

export function toOffers(products: readonly Pick<Product, 'id' | 'displayPrice'>[]): TipOffer[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const offers: TipOffer[] = [];
  for (const tip of TIP_PRODUCTS) {
    const product = byId.get(tip.id);
    if (product?.displayPrice) {
      offers.push({ id: tip.id, name: tip.name, displayPrice: product.displayPrice });
    }
  }
  return offers;
}

export async function openTipJar(onEvent: (event: TipEvent) => void): Promise<TipJarSession> {
  // Enforced here, not just in the UI: the bridge owns store traffic, so the
  // strict-privacy invariant must not depend on call sites asking first.
  if (!canUseStorePurchases()) {
    throw new TipJarUnavailableError('Store purchases are unavailable in strict privacy.');
  }
  const mod = loadExpoIap();
  if (!mod) throw new TipJarUnavailableError('In-app purchases are not available in this build.');

  // Transaction ids already finished this session: StoreKit may deliver
  // the same transaction through the listener and getAvailablePurchases.
  const finished = new Set<string>();

  const handlePurchase = async (purchase: Purchase) => {
    if (!isTipProductId(purchase.productId)) return;
    const productId = purchase.productId;
    if (purchase.purchaseState === 'pending') {
      onEvent({ kind: 'pending', productId });
      return;
    }
    if (purchase.purchaseState !== 'purchased') return;
    if (finished.has(purchase.id)) return;
    finished.add(purchase.id);
    try {
      await mod.finishTransaction({ purchase, isConsumable: true });
      onEvent({ kind: 'thanks', productId });
    } catch (error) {
      finished.delete(purchase.id);
      console.warn(
        '[tipJar] finishTransaction failed:',
        error instanceof Error ? error.message : String(error),
      );
      // The store replays an unfinished purchase on the next connection.
      onEvent({ kind: 'error', reason: 'not-finished' });
    }
  };

  // Completed-but-unfinished tips (app closed mid-purchase, or a pending
  // payment that cleared later) are finished the next time the user opens
  // the tip jar — never in the background. Returns whether any tip purchase
  // was found, so callers can fall back to an explicit event when the store
  // refused a request but there was nothing to recover.
  const recoverUnfinished = async (): Promise<boolean> => {
    try {
      const purchases = await mod.getAvailablePurchases();
      const tipPurchases = purchases.filter((p) => isTipProductId(p.productId));
      if (tipPurchases.length === 0) return false;
      for (const purchase of tipPurchases) await handlePurchase(purchase);
      return true;
    } catch (error) {
      console.warn(
        '[tipJar] getAvailablePurchases failed:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  };

  const handleError = async (error: unknown) => {
    const code = normalizeTipErrorCode(error);
    if (code === 'user-cancelled') return onEvent({ kind: 'cancelled' });
    if (code === 'pending' || code === 'deferred-payment') return onEvent({ kind: 'pending' });
    if (code === 'duplicate-purchase' || code === 'already-owned') {
      // An earlier tip of this size was never consumed; finish it now. If
      // recovery finds nothing, the store refused this request outright —
      // say so rather than leaving the tap without an outcome.
      const recovered = await recoverUnfinished();
      if (!recovered) onEvent({ kind: 'error', reason: 'failed' });
      return;
    }
    if (UNAVAILABLE_CODES.has(code)) return onEvent({ kind: 'error', reason: 'unavailable' });
    if (NETWORK_CODES.has(code)) return onEvent({ kind: 'error', reason: 'network' });
    onEvent({ kind: 'error', reason: 'failed' });
  };

  // Listen before connecting so a replayed transaction is not missed.
  const updated = mod.purchaseUpdatedListener((purchase) => void handlePurchase(purchase));
  const failed = mod.purchaseErrorListener(handleError);

  let connected = false;
  const close = async () => {
    updated.remove();
    failed.remove();
    if (!connected) return;
    connected = false;
    try {
      await mod.endConnection();
    } catch {
      // Closing is best effort; the OS reclaims the connection anyway.
    }
  };

  try {
    await mod.initConnection();
    connected = true;
    const products = await mod.fetchProducts({ skus: [...TIP_PRODUCT_IDS], type: 'in-app' });
    const offers = toOffers((products ?? []) as Product[]);
    // Leftover recovery runs alongside the open, not before it: the jar can
    // show prices as soon as fetchProducts returns, and any recovered tip
    // still reaches the same listeners (deduped by `finished`).
    void recoverUnfinished();
    return {
      offers,
      close,
      requestTip: async (id) => {
        // The mode may have flipped while the jar sat open.
        if (!canUseStorePurchases()) {
          onEvent({ kind: 'error', reason: 'unavailable' });
          return;
        }
        try {
          await mod.requestPurchase({
            request: { apple: { sku: id }, google: { skus: [id] } },
            type: 'in-app',
          });
        } catch (error) {
          await handleError(error);
        }
      },
    };
  } catch (error) {
    await close();
    throw new TipJarUnavailableError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}
