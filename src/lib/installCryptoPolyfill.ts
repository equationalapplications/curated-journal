import * as ExpoCrypto from 'expo-crypto';

/**
 * `@equationalapplications/core-llm-wiki` generateId() reads global `crypto`.
 * React Native does not ship Web Crypto; wire expo-crypto before wiki code runs.
 */
export function installCryptoPolyfill(): void {
  const existing = globalThis.crypto;
  if (
    existing &&
    typeof existing.randomUUID === 'function' &&
    typeof existing.getRandomValues === 'function'
  ) {
    return;
  }

  const patched: Crypto = {
    ...(existing ?? ({} as Crypto)),
    getRandomValues: <T extends ArrayBufferView>(array: T): T =>
      ExpoCrypto.getRandomValues(array),
    randomUUID: (): `${string}-${string}-${string}-${string}-${string}` =>
      ExpoCrypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
  };

  Object.defineProperty(globalThis, 'crypto', {
    value: patched,
    configurable: true,
    writable: true,
  });
}

installCryptoPolyfill();
