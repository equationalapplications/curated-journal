// expo-secure-store has no web implementation. The values kept here (entity id,
// model path/id, display name) are not secrets, so localStorage is acceptable on web.
export async function getItemAsync(key: string): Promise<string | null> {
  return globalThis.localStorage?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  globalThis.localStorage?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  globalThis.localStorage?.removeItem(key);
}
