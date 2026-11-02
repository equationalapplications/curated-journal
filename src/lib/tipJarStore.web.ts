/**
 * Tip jar store bridge — web build. In-app purchases are native-only, so
 * the web bundle carries no expo-iap code; the web tip jar is the optional
 * "Support" link instead (see supportConfig.ts).
 */
import { TipJarUnavailableError, type TipEvent, type TipJarSession } from '@/lib/tipJarTypes';

export * from '@/lib/tipJarTypes';

export function isTipJarSupported(): boolean {
  return false;
}

export async function openTipJar(_onEvent: (event: TipEvent) => void): Promise<TipJarSession> {
  throw new TipJarUnavailableError('In-app purchases are available in the iOS and Android apps.');
}
