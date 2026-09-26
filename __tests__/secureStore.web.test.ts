import * as webStore from '@/lib/secureStore.web';

describe('secureStore.web', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: jest.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, String(value));
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('round-trips a value through localStorage', async () => {
    await webStore.setItemAsync('k', 'v');
    await expect(webStore.getItemAsync('k')).resolves.toBe('v');
    await webStore.deleteItemAsync('k');
    await expect(webStore.getItemAsync('k')).resolves.toBeNull();
  });

  it('rejects when localStorage is unavailable instead of silently dropping writes', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    await expect(webStore.setItemAsync('k', 'v')).rejects.toThrow(/localStorage/);
    await expect(webStore.getItemAsync('k')).rejects.toThrow(/localStorage/);
    await expect(webStore.deleteItemAsync('k')).rejects.toThrow(/localStorage/);
  });

  it('propagates write failures (blocked storage, quota exceeded)', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => {
        throw new Error('QuotaExceededError');
      }),
      removeItem: jest.fn(),
    };
    await expect(webStore.setItemAsync('k', 'v')).rejects.toThrow('QuotaExceededError');
  });
});
