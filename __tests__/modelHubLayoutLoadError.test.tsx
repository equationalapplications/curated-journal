import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
const mockLoad = jest.fn();
jest.mock('@/services/modelDownloadController', () => ({
  ...jest.requireActual('@/services/modelDownloadController'),
  getModelDownloadController: () => ({
    load: () => mockLoad(),
    abandon: jest.fn(async () => ({ rowSaved: true })),
    subscribe: () => () => undefined,
    readRow: async () => null,
  }),
}));
jest.mock('@/lib/entityStorage', () => ({
  getModelId: async () => null,
  getModelPath: async () => null,
  setModelPath: jest.fn(),
  setModelId: jest.fn(),
  clearModelPath: jest.fn(),
}));
jest.mock('@/lib/networkGate', () => ({ checkNetworkGate: jest.fn(async () => 'wifi') }));
jest.mock('@/services/modelDownloadService', () => ({
  verifyDownload: jest.fn(),
  deletePartialFile: jest.fn(),
}));
jest.mock('@/services/modelFiles', () => ({ deleteOrphanedCuratedModelFiles: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ exists: false, size: 0, delete: jest.fn() })),
  Paths: { document: 'file:///doc' },
}));
jest.mock('@/lib/modelSmokeTest', () => ({ runModelSmokeTest: jest.fn() }));
jest.mock('@/lib/modelLoadParams', () => ({
  isBelowComfortableRam: () => false,
  currentDeviceMemory: () => ({ totalMemoryBytes: 0 }),
}));
jest.mock('@/machines/modelHubMachine', () => ({
  ...jest.requireActual('@/machines/modelHubMachine'),
  smokeTestSettled: async () => undefined,
}));

import Layout from '@/app/model-hub/_layout';

const emptySnapshot = {
  modelId: null,
  phase: 'none',
  pauseState: null,
  progress: { bytesWritten: 0, totalBytes: -1 },
  row: null,
  rowSaved: true,
  error: null,
  stoppedForStrict: false,
};

describe('T-S3 the layout when the download state cannot be loaded', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('shows an error and Retry (no endless spinner), never retries on its own, and Retry recovers', async () => {
    mockLoad.mockRejectedValueOnce(new Error('store down')).mockResolvedValue(emptySnapshot);
    const screen = await render(<Layout />);
    await waitFor(() => expect(screen.getByTestId('model-hub-load-error')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('model-hub-load-retry'));
    await waitFor(() => expect(screen.getByTestId('stack')).toBeTruthy());
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('model-hub-load-error')).toBeNull();
  });
});
