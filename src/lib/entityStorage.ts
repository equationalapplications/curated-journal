import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ENTITY_ID_KEY, MODEL_PATH_KEY } from '@/lib/constants';

export async function getOrCreateEntityId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENTITY_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(ENTITY_ID_KEY, id);
  return id;
}

export async function getModelPath(): Promise<string | null> {
  return SecureStore.getItemAsync(MODEL_PATH_KEY);
}

export async function setModelPath(path: string): Promise<void> {
  await SecureStore.setItemAsync(MODEL_PATH_KEY, path);
}
