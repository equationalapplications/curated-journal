import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { View: V } = require('react-native');
  const Stack: any = () => <V testID="stack" />;
  Stack.Screen = () => null;
  // STABLE object: the layout effect depends on [router]; a fresh object per
  // render would re-run it forever until out-of-memory.
  const router = { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), dismissTo: jest.fn() };
  return { Stack, useRouter: () => router };
});
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => ({})) }));
const mockStatus = { value: 'downloading' as string };
jest.mock('@/services/modelDownloadState', () => ({
  createModelDownloadStateStore: () => ({
    get: async () => ({ modelId: 'fast-light', status: mockStatus.value, pauseState: null }),
    set: async () => undefined,
    clear: async () => undefined,
  }),
}));
jest.mock('@/lib/entityStorage', () => ({
  getModelId: async () => null,
  getModelPath: async () => null,
  setModelPath: jest.fn(), setModelId: jest.fn(), clearModelPath: jest.fn(),
}));
jest.mock('@/lib/networkGate', () => ({ checkNetworkGate: jest.fn(async () => 'cellular') }));
const mockStart = jest.fn(async () => true);
jest.mock('@/services/modelDownloadService', () => ({
  startDownload: (...a: unknown[]) => mockStart(...a),
  resumeDownload: jest.fn(async () => true),
  pauseDownload: jest.fn(async () => null),
  verifyDownload: jest.fn(async () => false),
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

describe('real hub layout: restore over cellular', () => {
beforeEach(() => { mockStart.mockClear(); mockReplace.mockClear(); });

it('shows the sheet once, replaces to the download screen, and downloads only after confirm', async () => {
  const screen = await render(<Layout />);
  await waitFor(() => expect(screen.getAllByText('Download over cellular').length).toBeGreaterThan(0));
  expect(screen.getAllByText(/large file/)).toHaveLength(1);
  expect(mockReplace).toHaveBeenCalledWith('/model-hub/download');
  expect(mockStart).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Download over cellular' }));
  await waitFor(() => expect(mockStart).toHaveBeenCalled());
  expect(screen.queryByText(/large file/)).toBeNull();
});

it('Cancel closes the sheet and starts nothing', async () => {
  const screen = await render(<Layout />);
  await waitFor(() => expect(screen.getAllByText(/large file/)).toHaveLength(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/large file/)).toBeNull();
  expect(mockStart).not.toHaveBeenCalled();
});
});
