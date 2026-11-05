/**
 * The one place the app asks which privacy mode it is in (INTENT.md
 * rules 9 and 11).
 *
 * Privacy modes are not built yet: today the app always runs in the
 * default mode, so this always reports `'default'`. Anything that can
 * reach beyond the device on the user's behalf — today, the tip jar —
 * must ask here first, so that when strict privacy arrives it is honored
 * by changing this module alone, never by hunting down call sites.
 */
export type PrivacyMode = 'default' | 'strict';

export function getPrivacyMode(): PrivacyMode {
  return 'default';
}

/**
 * Whether the user may start an app-store purchase (a tip). Strict privacy
 * allows no off-device communication at all, so the store is off limits
 * there; the caller explains why instead of calling out silently.
 */
export function canUseStorePurchases(): boolean {
  return getPrivacyMode() !== 'strict';
}

/**
 * Whether the app may open an outside web link the user tapped (the web
 * build's "Support" link). Same rule as store purchases.
 */
export function canOpenSupportLink(): boolean {
  return getPrivacyMode() !== 'strict';
}
