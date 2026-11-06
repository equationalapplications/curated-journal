import { SUPPORT_PAYPAL_URL } from '@/lib/supportConfig';

/** The web "Support" link, or null while the owner has not set one. */
export function getSupportLinkUrl(url: string = SUPPORT_PAYPAL_URL): string | null {
  const trimmed = url.trim();
  return trimmed.startsWith('https://') ? trimmed : null;
}
