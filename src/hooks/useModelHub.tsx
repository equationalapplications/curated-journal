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
import {
  setModelPath,
  setModelId,
  getModelPath,
  clearModelPath,
} from '@/lib/entityStorage';
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
    // Deliberately not wrapped in try/catch around the unlink: a rejection here
    // means the model file could not be removed, and the machine's
    // retiringCurrent state owns that failure branch — it can report "nothing
    // has changed" truthfully, because nothing has. Idempotence comes from the
    // `exists` guard below, and the clearModelPath() call must still run when
    // the file was already gone.
    //
    // The storage clear is the one failure that must NOT reject. By this point
    // the file is already deleted, so rejecting would tell the user nothing
    // changed when in fact their model is gone. Resolve with identityCleared:
    // false instead, and let the machine say what actually happened.
    retireCurrentModel: async () => {
      const path = await getModelPath();
      if (path) {
        const file = new File(path);
        if (file.exists) file.delete();
      }
      try {
        await clearModelPath();
        return { identityCleared: true };
      } catch (cause) {
        console.warn('[model-hub] retired the model file but could not clear its identity', cause);
        return { identityCleared: false };
      }
    },
    // Best-effort by contract (spec §4.2 B6, §6): this unlinks the outgoing file
    // after an import that has already succeeded and passed its smoke test. An
    // orphaned .gguf wastes disk but is recoverable; failing that import is not.
    // So swallow and warn rather than reject.
    deleteModelFile: async (path) => {
      try {
        const file = new File(path);
        if (file.exists) file.delete();
      } catch (cause) {
        console.warn('[model-hub] failed to delete model file', path, cause);
      }
    },
  };
}

type ModelHubContextValue = {
  send: (event: ModelHubMachineEvents) => void;
  stateValue: string;
  modelId: CuratedModelId | null;
  currentModelId: CuratedModelId | 'custom' | null;
  progress: { bytesWritten: number; totalBytes: number };
  error: { code: string; message: string } | null;
  pausedReason: 'user' | 'background' | null;
  displayName: string | null;
};

const ModelHubContext = createContext<ModelHubContextValue | null>(null);

export function ModelHubProvider({
  api,
  restore,
  currentModelId,
  children,
}: {
  api: ModelHubApi;
  restore?: ModelHubRestoreState;
  currentModelId: CuratedModelId | 'custom' | null;
  children: ReactNode;
}) {
  const actor = useMemo(
    () => createActor(modelHubMachine, { input: { api, currentModelId } }).start(),
    [api, currentModelId],
  );

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
  const currentModelIdFromActor = useSelector(actor, (s) => s.context.currentModelId);
  const progress = useSelector(actor, (s) => s.context.progress);
  const error = useSelector(actor, (s) => s.context.error);
  const pausedReason = useSelector(actor, (s) => s.context.pausedReason);
  const displayName = useSelector(actor, (s) => s.context.displayName);

  const value: ModelHubContextValue = {
    send,
    stateValue,
    modelId,
    currentModelId: currentModelIdFromActor,
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
