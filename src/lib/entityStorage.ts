import * as SecureStore from 'expo-secure-store';
import { ENTITY_ID_KEY, MODEL_PATH_KEY } from '@/lib/constants';

function generateUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getOrCreateEntityId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENTITY_ID_KEY);
  if (existing) return existing;
  const id = generateUuidV4();
  await SecureStore.setItemAsync(ENTITY_ID_KEY, id);
  return id;
}

export async function getModelPath(): Promise<string | null> {
  return SecureStore.getItemAsync(MODEL_PATH_KEY);
}

export async function setModelPath(path: string): Promise<void> {
  await SecureStore.setItemAsync(MODEL_PATH_KEY, path);
}
