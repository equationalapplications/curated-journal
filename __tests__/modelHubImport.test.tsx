import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// Screens and ListRows call useTheme.
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

const mockSend = jest.fn();
jest.mock('@/hooks/useModelHub', () => ({
  useModelHub: () => ({ send: mockSend, stateValue: 'customImport' }),
}));

jest.mock('@/contexts/ModelHubCompletionContext', () => ({
  useModelHubCompletion: () => jest.fn(async () => undefined),
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockPick(...args),
}));

// Just enough File to observe which path the copy lands on.
const mockCopy = jest.fn();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(target: { uri: string } | string, name?: string) {
      this.uri = name === undefined ? String(target) : `${(target as { uri: string }).uri}/${name}`;
    }
    copy(dest: File) {
      mockCopy(this.uri, dest.uri);
    }
  }
  return { File, Paths: { document: { uri: 'file:///documents' } } };
});

const mockSmokeTest = jest.fn();
jest.mock('@/lib/modelSmokeTest', () => ({
  runModelSmokeTest: (...args: unknown[]) => mockSmokeTest(...args),
}));

const mockGetModelPath = jest.fn();
const mockSetModelPath = jest.fn();
jest.mock('@/lib/entityStorage', () => ({
  getModelPath: () => mockGetModelPath(),
  setModelPath: (path: string) => mockSetModelPath(path),
  setModelId: jest.fn(async () => undefined),
}));

import ModelHubImportScreen from '@/app/model-hub/import';

/** Stands in for SecureStore: setModelPath really does overwrite what getModelPath reads. */
function seedInstalledModel(path: string) {
  let stored: string | null = path;
  mockGetModelPath.mockImplementation(async () => stored);
  mockSetModelPath.mockImplementation(async (next: string) => {
    stored = next;
  });
}

function pickFile(name: string) {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ name, uri: 'file:///cache/picked' }] });
}

const pressImport = async () => {
  const screen = await render(<ModelHubImportScreen />);
  // The whole import runs behind the press, including the state updates that
  // track the smoke test — act it so those land inside the renderer's batch.
  await act(async () => {
    fireEvent.press(screen.getByRole('button'));
  });
};

describe('model-hub custom import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSmokeTest.mockResolvedValue({ ok: true });
  });

  it('never writes the import over the file it is about to retire', async () => {
    // The ordinary case, not an edge case: the user re-imports a file whose name
    // matches the installed model. A copy that reused the name would land on the
    // retire path, and IMPORT_SMOKE_OK would delete the model just installed.
    seedInstalledModel('file:///documents/model.gguf');
    pickFile('model.gguf');

    await pressImport();

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    const [source, dest] = mockCopy.mock.calls[0] as [string, string];
    expect(source).toBe('file:///cache/picked');
    expect(dest).not.toBe('file:///documents/model.gguf');
    expect(dest.endsWith('.gguf')).toBe(true);
  });

  it('reads the outgoing path before setModelPath overwrites it', async () => {
    seedInstalledModel('file:///documents/old.gguf');
    pickFile('fresh.gguf');

    await pressImport();

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    // The stored path now points at the new model; the retire target must be the
    // one captured on the way in.
    expect(mockSetModelPath).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({
      type: 'IMPORT_SMOKE_OK',
      retirePath: 'file:///documents/old.gguf',
    });
  });

  it('retires nothing on a first run, where no model is installed', async () => {
    seedInstalledModel(null as unknown as string);
    pickFile('fresh.gguf');

    await pressImport();

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend).toHaveBeenCalledWith({ type: 'IMPORT_SMOKE_OK', retirePath: null });
  });

  it('does not retire or install when the model fails its smoke test', async () => {
    seedInstalledModel('file:///documents/old.gguf');
    pickFile('fresh.gguf');
    mockSmokeTest.mockResolvedValue({ ok: false });

    await pressImport();

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'IMPORT_FAILED' })));
    expect(mockSetModelPath).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});
