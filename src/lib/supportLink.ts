/**
 * The "Support" web link is web-only: the iOS and Android apps take tips
 * through their store's in-app purchase (store rules forbid steering to an
 * outside payment link there). See supportLink.web.ts.
 */
export function getSupportLinkUrl(_url?: string): string | null {
  return null;
}
