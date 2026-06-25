import * as ExpoCrypto from 'expo-crypto';
import { installCryptoPolyfill } from '@/lib/installCryptoPolyfill';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn((array: Uint8Array) => {
    array.fill(7);
    return array;
  }),
  randomUUID: jest.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
}));

describe('installCryptoPolyfill', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  it('exposes randomUUID and getRandomValues on globalThis.crypto', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    installCryptoPolyfill();

    expect(globalThis.crypto?.randomUUID).toBeDefined();
    expect(globalThis.crypto?.getRandomValues).toBeDefined();
    expect(globalThis.crypto!.randomUUID()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

    const bytes = new Uint8Array(4);
    globalThis.crypto!.getRandomValues(bytes);
    expect(bytes).toEqual(new Uint8Array([7, 7, 7, 7]));
    expect(ExpoCrypto.randomUUID).toHaveBeenCalled();
    expect(ExpoCrypto.getRandomValues).toHaveBeenCalled();
  });
});
