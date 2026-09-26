// expo-secure-store has no web implementation. The values kept here (entity id,
// model path/id, display name) are not secrets, so localStorage is acceptable on web.
//
// Storage failures are surfaced, never swallowed: if localStorage is blocked or
// unavailable, silent success here would corrupt callers that rely on writes
// being durable (e.g. getOrCreateEntityId mints a fresh id when the stored one
// cannot be read back). Browser write failures (blocked storage, quota) throw.

function requireLocalStorage(): Storage {
  const store = globalThis.localStorage;
  if (!store) {
    throw new Error(
      'localStorage is unavailable in this browser context; secureStore.web cannot persist data.',
    );
  }
  return store;
}

export async function getItemAsync(key: string): Promise<string | null> {
  return requireLocalStorage().getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  requireLocalStorage().setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  requireLocalStorage().removeItem(key);
}
