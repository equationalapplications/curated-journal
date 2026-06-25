import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { createActor } from 'xstate';
import { useSelector } from '@xstate/react';
import {
  modelHubMachine,
  type ModelHubApi,
  type ModelHubMachineEvents,
} from '@/machines/modelHubMachine';
import { checkNetworkGate } from '@/lib/networkGate';
import {
  startDownload,
  resumeDownload,
  pauseDownload,
  verifyDownload,
  deletePartialFile,
} from '@/services/modelDownloadService';
import { runModelSmokeTest } from '@/lib/modelSmokeTest';
import type {
  createModelDownloadStateStore,
  DownloadPauseStateRecord,
  ModelDownloadStatus,
} from '@/services/modelDownloadState';
import { setModelPath, setModelId } from '@/lib/entityStorage';
import type { CuratedModelId } from '@/catalog/modelManifest';

type Store = ReturnType<typeof createModelDownloadStateStore>;

export type ModelHubRestoreState = {
  modelId: CuratedModelId;
  status: Extract<ModelDownloadStatus, 'downloading' | 'paused'>;
  pauseState: DownloadPauseStateRecord | null;
};

export function createModelHubApi(store: Store): ModelHubApi {
  return {
    checkNetwork: () => checkNetworkGate(),
    startDownload: async (model, onProgress) => {
      const file = await startDownload(model, { onProgress });
      return file !== null;
    },
    resumeDownload: async (pauseState, onProgress) => {
      const file = await resumeDownload(pauseState, { onProgress });
      return file !== null;
    },
    pauseDownload: () => pauseDownload(),
    verifyDownload: (model) => {
      const file = new File(Paths.document, model.filename);
      return verifyDownload(file, model);
    },
    deletePartialFile: (filename) => deletePartialFile(filename),
    runSmokeTest: (model) => {
      const file = new File(Paths.document, model.filename);
      return runModelSmokeTest({ modelPath: file.uri, llamaConfig: model.llamaConfig });
    },
    persistDownloadState: (record) => store.set(record),
    clearDownloadState: () => store.clear(),
    setModelPath: async (model) => {
      const file = new File(Paths.document, model.filename);
      await setModelPath(file.uri);
      await setModelId(model.id);
    },
  };
}

type ModelHubContextValue = {
  send: (event: ModelHubMachineEvents) => void;
  stateValue: string;
  modelId: CuratedModelId | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: string; message: string } | null;
  pausedReason: 'user' | 'background' | null;
  displayName: string | null;
};

const ModelHubContext = createContext<ModelHubContextValue | null>(null);

export function ModelHubProvider({
  api,
  restore,
  children,
}: {
  api: ModelHubApi;
  restore?: ModelHubRestoreState;
  children: ReactNode;
}) {
  const actor = useMemo(() => createActor(modelHubMachine, { input: { api } }).start(), [api]);

  useEffect(() => {
    return () => {
      actor.stop();
    };
  }, [actor]);

  useEffect(() => {
    if (!restore) return;
    actor.send({
      type: 'RESTORE_DOWNLOAD',
      modelId: restore.modelId,
      status: restore.status,
      pauseState: restore.pauseState,
    });
  }, [actor, restore]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        actor.send({ type: 'APP_BACKGROUND' });
      } else if (nextState === 'active') {
        actor.send({ type: 'APP_FOREGROUND' });
      }
    });
    return () => subscription.remove();
  }, [actor]);

  const send = (event: ModelHubMachineEvents) => actor.send(event);
  const stateValue = useSelector(actor, (s) => s.value as string);
  const modelId = useSelector(actor, (s) => s.context.modelId);
  const progress = useSelector(actor, (s) => s.context.progress);
  const error = useSelector(actor, (s) => s.context.error);
  const pausedReason = useSelector(actor, (s) => s.context.pausedReason);
  const displayName = useSelector(actor, (s) => s.context.displayName);

  const value: ModelHubContextValue = {
    send,
    stateValue,
    modelId,
    progress,
    error,
    pausedReason,
    displayName,
  };

  return <ModelHubContext.Provider value={value}>{children}</ModelHubContext.Provider>;
}

export function useModelHub(): ModelHubContextValue {
  const ctx = useContext(ModelHubContext);
  if (!ctx) throw new Error('useModelHub requires ModelHubProvider');
  return ctx;
}
