import * as SecureStore from 'expo-secure-store';
import {
  getOrCreateEntityId,
  getModelPath,
  setModelPath,
  getModelId,
  setModelId,
  getDisplayName,
  setDisplayName,
  clearModelPath,
} from '@/lib/entityStorage';
import { ENTITY_ID_KEY, MODEL_PATH_KEY, MODEL_ID_KEY, DISPLAY_NAME_KEY } from '@/lib/constants';

jest.mock('expo-secure-store');
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
}));

describe('entityStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns persisted entity id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('uuid-existing');
    await expect(getOrCreateEntityId()).resolves.toBe('uuid-existing');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('creates and persists new entity id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    const id = await getOrCreateEntityId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ENTITY_ID_KEY, id);
  });

  it('round-trips model path', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('/docs/model.gguf');
    await expect(getModelPath()).resolves.toBe('/docs/model.gguf');
    await setModelPath('/docs/model.gguf');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(MODEL_PATH_KEY, '/docs/model.gguf');
  });

  it('round-trips model id', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('deep-thinker');
    await expect(getModelId()).resolves.toBe('deep-thinker');
    await setModelId('deep-thinker');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(MODEL_ID_KEY, 'deep-thinker');
  });

  it('round-trips display name', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('My Journal');
    await expect(getDisplayName()).resolves.toBe('My Journal');
    await setDisplayName('My Journal');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DISPLAY_NAME_KEY, 'My Journal');
  });

  it('clearModelPath deletes the stored path and model id', async () => {
    await clearModelPath();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(MODEL_PATH_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(MODEL_ID_KEY);
  });
});
