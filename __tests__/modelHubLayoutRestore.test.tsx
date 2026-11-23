/** M3: how the layout builds its restore from the controller's snapshot (H9, H9b, unrestorable rows). */
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { View: V } = require('react-native');
  const Stack: any = () => <V testID="stack" />;
  Stack.Screen = () => null;
  const router = { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), dismissTo: jest.fn() };
  return { Stack, useRouter: () => router };
});
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({})) }));
const mockHub: { api: { downloads: unknown } | null } = { api: null };
jest.mock('@/services/modelDownloadController', () => ({
  ...jest.requireActual('@/services/modelDownloadController'),
  getModelDownloadController: () => mockHub.api?.downloads,
}));
jest.mock('@/lib/entityStorage', () => ({
  getModelId: async () => null,
  getModelPath: async () => null,
  setModelPath: jest.fn(),
  setModelId: jest.fn(),
  clearModelPath: jest.fn(),
}));
const mockCheck = jest.fn(async () => 'wifi');
jest.mock('@/lib/networkGate', () => ({ checkNetworkGate: () => mockCheck() }));
jest.mock('@/services/modelDownloadService', () => ({
  verifyDownload: jest.fn(() => true),
  deletePartialFile: jest.fn(),
}));
jest.mock('@/services/modelFiles', () => ({ deleteOrphanedCuratedModelFiles: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ exists: true, size: 1, uri: 'file:///doc/f', delete: jest.fn() })),
  Paths: { document: 'file:///doc' },
}));
jest.mock('@/lib/modelSmokeTest', () => ({ runModelSmokeTest: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/modelLoadParams', () => ({
  isBelowComfortableRam: () => false,
  currentDeviceMemory: () => ({ totalMemoryBytes: 0 }),
}));
jest.mock('@/machines/modelHubMachine', () => ({
  ...jest.requireActual('@/machines/modelHubMachine'),
  smokeTestSettled: async () => undefined,
}));

import Layout from '@/app/model-hub/_layout';
import { makeHubApi } from './helpers/hubApi';

const mockStart = jest.fn();

function hub(initialRow: Parameters<typeof makeHubApi>[0]['initialRow'], start: () => Promise<boolean>) {
  mockStart.mockImplementation(start);
  mockHub.api = makeHubApi({ startDownload: mockStart, initialRow });
  return mockHub.api as ReturnType<typeof makeHubApi>;
}

describe('layout restore from the controller snapshot', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockReplace.mockClear();
    mockCheck.mockClear();
  });

  it('an active transfer restores as downloading via attach: no network check, exactly one task, no abandon', async () => {
    const api = hub({ modelId: 'fast-light', status: 'downloading', pauseState: null }, () => new Promise(() => undefined));
    await api.downloads.start('fast-light');
    expect(api.downloads.snapshot().phase).toBe('active');
    const abandon = jest.spyOn(api.downloads, 'abandon');
    const screen = await render(<Layout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/model-hub/download'));
    await waitFor(() => expect(screen.getByTestId('stack')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(abandon).not.toHaveBeenCalled();
  });

  it('a completed phase restores as finished: no network check and no new task', async () => {
    const api = hub({ modelId: 'fast-light', status: 'downloading', pauseState: null }, async () => true);
    await api.downloads.start('fast-light');
    await new Promise((r) => setTimeout(r, 20));
    expect(api.downloads.snapshot().phase).toBe('completed');
    await render(<Layout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/model-hub/download'));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('phase none with an unrestorable row abandons it', async () => {
    const api = hub({ modelId: 'removed-model', status: 'paused', pauseState: null }, async () => true);
    const abandon = jest.spyOn(api.downloads, 'abandon');
    await render(<Layout />);
    await waitFor(() => expect(abandon).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
