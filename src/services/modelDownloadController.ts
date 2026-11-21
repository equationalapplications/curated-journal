/**
 * The model download controller: the one owner of every model transfer and of
 * the saved download row (spec `specs/2026-11-21-model-download-controller`).
 * Plain TypeScript, a process-wide singleton, no XState: nothing that stops the
 * hub actor stops it. Every public operation except `snapshot()`, `subscribe()`
 * and the two latch changes runs on one FIFO queue.
 */
import { AppState, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { getCuratedModel, type CuratedModelId } from '@/catalog/modelManifest';
import { classifyDownloadError, type DownloadErrorCode } from '@/lib/downloadErrorTaxonomy';
import {
  createModelDownloadStateStore,
  normalizePauseState,
  type DownloadPauseStateRecord,
  type ModelDownloadStatus,
} from '@/services/modelDownloadState';
import { startDownload, resumeDownload } from '@/services/modelDownloadService';

// ---------------------------------------------------------------- types

export type Phase = 'none' | 'active' | 'paused' | 'completed' | 'failed';
export type Progress = { bytesWritten: number; totalBytes: number };
export type RowRecord = { modelId: string | null; status: ModelDownloadStatus };

export type ControllerSnapshot = {
  modelId: CuratedModelId | null;
  phase: Phase;
  pauseState: DownloadPauseStateRecord | null;
  progress: Progress;
  row: RowRecord | null;
  rowSaved: boolean;
  error: { code: string; message: string } | null;
  stoppedForStrict: boolean;
};

/** The slice of `DownloadTask` the controller uses. */
export type TransferTask = {
  readonly state: string;
  pause(): void;
  pauseAsync(): Promise<void>;
  cancel(): void;
  release(): void;
  savable(): DownloadPauseStateRecord;
  addListener(eventName: 'progress', listener: (data: unknown) => void): { remove(): void };
};

export type TransferHandle = {
  task: TransferTask;
  promise: Promise<unknown | null>;
  kind: 'started' | 'resumed';
};

export type TransferDriver = {
  platform: 'ios' | 'android';
  start(modelId: CuratedModelId, opts: { onProgress: (p: Progress) => void }): TransferHandle;
  resume(
    modelId: CuratedModelId,
    pauseState: DownloadPauseStateRecord,
    opts: { onProgress: (p: Progress) => void },
  ): TransferHandle;
  /** Delivers the current state on subscribe, and every change. Returns an unsubscribe. */
  onAppState(listener: (state: string) => void): () => void;
};

export type StoreLike = {
  get(): Promise<{ modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null } | null>;
  set(record: {
    modelId: string | null;
    status: ModelDownloadStatus;
    pauseState: DownloadPauseStateRecord | null;
  }): Promise<void>;
  clear(): Promise<void>;
};

export type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type GateResult = { allowed: true } | { allowed: false; reason: string };

export type ControllerEvent =
  | ({ type: 'progress'; modelId: CuratedModelId } & Progress)
  | { type: 'completed'; modelId: CuratedModelId }
  | { type: 'failed'; modelId: CuratedModelId; code: DownloadErrorCode; message: string }
  | {
      type: 'stopped';
      modelId: CuratedModelId;
      pauseState: DownloadPauseStateRecord | null;
      reason: 'strict' | 'unrequested';
    };

export type StartResult =
  | { kind: 'started' | 'resumed' | 'attached'; snapshot: ControllerSnapshot; rowSaved: boolean }
  | { kind: 'completed'; snapshot: ControllerSnapshot }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; code: DownloadErrorCode; message: string; rowSaved: boolean };

export type AttachResult =
  | { kind: 'attached' | 'completed' | 'not-live'; snapshot: ControllerSnapshot }
  | { kind: 'failed'; code: string; message: string; snapshot: ControllerSnapshot };

export type PauseResult =
  | { kind: 'paused'; pauseState: DownloadPauseStateRecord | null; strict: boolean; rowSaved: boolean }
  | { kind: 'completed' }
  | { kind: 'failed'; code: string; message: string }
  | { kind: 'pause-failed'; pauseState: DownloadPauseStateRecord | null; strict: boolean; rowSaved: boolean };

export type StrictResult =
  | { kind: 'nothing-running'; rowSaved: boolean }
  | { kind: 'kept'; pauseState: DownloadPauseStateRecord | null; rowSaved: boolean }
  | { kind: 'not-keepable'; why: 'no-resume-data' | 'pause-failed' | 'failed'; rowSaved: boolean }
  | { kind: 'completed'; rowSaved: boolean };

export type RowOpResult = { rowSaved: boolean };

export type ModelDownloadController = {
  load(): Promise<ControllerSnapshot>;
  snapshot(): ControllerSnapshot;
  subscribe(listener: (event: ControllerEvent) => void): () => void;
  readRow(): Promise<RowRecord | null>;
  start(modelId: CuratedModelId): Promise<StartResult>;
  resume(modelId: CuratedModelId): Promise<StartResult>;
  attach(modelId: CuratedModelId): Promise<AttachResult>;
  pause(modelId: CuratedModelId): Promise<PauseResult>;
  park(modelId: CuratedModelId): Promise<RowOpResult>;
  abandon(): Promise<RowOpResult>;
  record(modelId: CuratedModelId, status: 'failed' | 'smoke-testing' | 'smoke-failed'): Promise<RowOpResult>;
  stopForStrict(): Promise<StrictResult>;
  releaseStrictStop(): Promise<{ kind: 'released'; wasSet: boolean }>;
};

export type ControllerOptions = {
  driver: TransferDriver;
  timers: Timers;
  gate?: (modelId: CuratedModelId, op: 'start' | 'resume') => GateResult | Promise<GateResult>;
} & ({ store: StoreLike; openStore?: undefined } | { openStore: () => Promise<StoreLike>; store?: undefined });

export class TransferInFlightError extends Error {
  constructor(message = 'A download transfer is in flight') {
    super(message);
    this.name = 'TransferInFlightError';
  }
}

export class WrongModelError extends Error {
  constructor(message = 'The download record is for another model') {
    super(message);
    this.name = 'WrongModelError';
  }
}

/** Android and every non-iOS target (web included) use the Android lost-cancel guard. */
export function transferPlatform(os: typeof Platform.OS): 'ios' | 'android' {
  return os === 'ios' ? 'ios' : 'android';
}

const STORE_BOUND_MS = 10_000;
const REISSUE_GRACE_MS = 500;
const REISSUE_MS = 1_000;
const WATCHDOG_MS = 30_000;
const PAUSE_FAILED_MESSAGE = 'Could not pause the download. Try again.';
const EMPTY_PROGRESS: Progress = { bytesWritten: 0, totalBytes: -1 };

type PendingRow =
  | { kind: 'set'; modelId: string | null; status: ModelDownloadStatus; pauseState: DownloadPauseStateRecord | null }
  | { kind: 'clear' };

type Live = {
  gen: number;
  modelId: CuratedModelId;
  task: TransferTask;
  progressSinceAsk: boolean;
  rejection: { has: boolean; error: unknown };
};

/** What a pause procedure or a held-record report found. */
type Outcome = { res: PauseResult; ran: boolean; noResume: boolean };

type Join = { modelId: CuratedModelId; promise: Promise<PauseResult>; strictJoined: boolean; strictResult?: StrictResult };

// ------------------------------------------------------------- factory

export function createModelDownloadController(options: ControllerOptions): ModelDownloadController {
  const { driver, timers, gate } = options;

  // ---- record
  const rec = {
    modelId: null as CuratedModelId | null,
    phase: 'none' as Phase,
    pauseState: null as DownloadPauseStateRecord | null,
    progress: { ...EMPTY_PROGRESS },
    row: null as RowRecord | null,
    rowSaved: true,
    error: null as { code: string; message: string } | null,
    /** The held `failed` phase came from a failed pause (the pause state is kept, M6). */
    pauseFailed: false,
  };
  function setPhase(p: Phase): void {
    rec.phase = p;
    rec.pauseFailed = false;
  }
  let latch = false;
  let live: Live | null = null;
  let genCounter = 0;
  let loadedOnce = false;
  let store: StoreLike | null = null;
  let pending: PendingRow | null = null;
  let join: Join | null = null;
  const listeners = new Set<(event: ControllerEvent) => void>();
  const guards = new Map<number, () => void>();

  // ---- queue
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // ---- foreground clock (F9)
  let foreground = true;
  const fgListeners = new Set<() => void>();
  driver.onAppState((state) => {
    const nowForeground = state !== 'background';
    if (nowForeground === foreground) return;
    foreground = nowForeground;
    for (const l of [...fgListeners]) l();
  });

  function foregroundTimer(ms: number, fire: () => void, oneShot = false): { cancel(): void } {
    let handle: unknown = null;
    let fired = false;
    const arm = () => {
      if (handle !== null || fired) return;
      handle = timers.setTimeout(() => {
        handle = null;
        if (oneShot) fired = true;
        fire();
      }, ms);
    };
    const disarm = () => {
      if (handle === null) return;
      timers.clearTimeout(handle);
      handle = null;
    };
    const onChange = () => {
      disarm();
      if (foreground) arm();
    };
    if (foreground) arm();
    fgListeners.add(onChange);
    return {
      cancel() {
        disarm();
        fgListeners.delete(onChange);
      },
    };
  }

  // ---- helpers
  function emit(event: ControllerEvent): void {
    for (const l of [...listeners]) {
      try {
        l(event);
      } catch (cause) {
        console.warn('[download-controller] listener threw', cause);
      }
    }
  }

  function bounded<T>(work: Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = timers.setTimeout(() => reject(new Error(`${label} timed out`)), STORE_BOUND_MS);
      work.then(
        (v) => {
          timers.clearTimeout(handle);
          resolve(v);
        },
        (e) => {
          timers.clearTimeout(handle);
          reject(e);
        },
      );
    });
  }

  function snapshot(): ControllerSnapshot {
    return {
      modelId: rec.modelId,
      phase: rec.phase,
      pauseState: rec.pauseState,
      progress: { ...rec.progress },
      row: rec.row ? { ...rec.row } : null,
      rowSaved: rec.rowSaved,
      error: rec.error ? { ...rec.error } : null,
      stoppedForStrict: latch,
    };
  }

  async function flush(): Promise<boolean> {
    const p = pending;
    if (!p || !store) return true;
    const s = store;
    try {
      await bounded(
        Promise.resolve().then(() =>
          p.kind === 'clear'
            ? s.clear()
            : s.set({ modelId: p.modelId, status: p.status, pauseState: p.pauseState }),
        ),
        'row write',
      );
    } catch (cause) {
      console.warn('[download-controller] row write failed; will retry', cause);
      return false;
    }
    if (pending === p) {
      pending = null;
      rec.rowSaved = true;
    }
    return true;
  }

  async function save(
    status: ModelDownloadStatus,
    modelId: CuratedModelId | null,
    pauseState: DownloadPauseStateRecord | null,
  ): Promise<boolean> {
    rec.row = { modelId, status };
    pending = { kind: 'set', modelId, status, pauseState: normalizePauseState(pauseState) };
    rec.rowSaved = false;
    return flush();
  }

  async function saveClear(): Promise<boolean> {
    rec.row = null;
    pending = { kind: 'clear' };
    rec.rowSaved = false;
    return flush();
  }

  // ---- load
  async function firstLoad(): Promise<void> {
    const work = (async () => {
      const s = options.store ?? (await options.openStore());
      const row = await s.get();
      return { s, row };
    })();
    work.catch(() => undefined); // a late reject of a dropped attempt is never unhandled
    const { s, row } = await bounded(work, 'download state load');
    store = s;
    loadedOnce = true;
    if (row) {
      rec.modelId = (row.modelId as CuratedModelId | null) ?? null;
      rec.pauseState = row.pauseState;
      setPhase(row.status === 'paused' ? 'paused' : 'none');
      rec.row = { modelId: row.modelId, status: row.status };
    }
  }

  async function loadInternal(): Promise<ControllerSnapshot> {
    if (!loadedOnce) await firstLoad();
    else await flush();
    return snapshot();
  }

  // ---- transfer bookkeeping
  function releaseGuard(gen: number): void {
    const g = guards.get(gen);
    if (g) {
      guards.delete(gen);
      g();
    }
  }

  function retire(): void {
    live = null;
  }

  /** The one place a transfer is cancelled (F4, F11). Never awaits the promise. */
  function cancelTransfer(task: TransferTask, gen: number): void {
    const wasActive = task.state === 'active';
    try {
      task.cancel();
    } catch (cause) {
      console.warn('[download-controller] cancel threw', cause);
    }
    if (!wasActive) return;
    if (driver.platform === 'ios') {
      try {
        task.release();
      } catch {
        // a released object throws on later native calls
      }
      return;
    }
    try {
      let released = false;
      const sub = task.addListener('progress', () => {
        console.warn('[download-controller] a cancelled transfer is still running; releasing it');
        if (!released) {
          released = true;
          try {
            task.release();
          } catch {
            // already released
          }
        }
        releaseGuard(gen);
      });
      guards.set(gen, () => {
        try {
          sub.remove();
        } catch {
          // already removed
        }
      });
    } catch (cause) {
      console.warn('[download-controller] could not guard a cancelled transfer', cause);
    }
  }

  function failureOf(error: unknown): { code: DownloadErrorCode; message: string } {
    return {
      code: classifyDownloadError(error),
      message: error instanceof Error ? error.message : String(error),
    };
  }

  function createTransfer(modelId: CuratedModelId, gen: number, handle: TransferHandle): void {
    const L: Live = {
      gen,
      modelId,
      task: handle.task,
      progressSinceAsk: false,
      rejection: { has: false, error: undefined },
    };
    live = L;
    setPhase('active');
    rec.error = null;
    rec.progress = { ...EMPTY_PROGRESS };
    const onSettle = (kind: 'file' | 'error', value: unknown) => {
      if (kind === 'error') {
        L.rejection = { has: true, error: value };
      }
      if (live?.gen !== gen) {
        releaseGuard(gen);
        return;
      }
      void enqueue(() => settleStep(L, kind, value));
    };
    handle.promise.then(
      (file) => onSettle('file', file),
      (error) => onSettle('error', error),
    );
  }

  async function settleStep(L: Live, kind: 'file' | 'error', value: unknown): Promise<void> {
    if (live?.gen !== L.gen) {
      releaseGuard(L.gen);
      return;
    }
    const modelId = L.modelId;
    if (kind === 'error') {
      const f = failureOf(value);
      retire();
      setPhase('failed');
      rec.pauseState = null;
      rec.error = f;
      emit({ type: 'failed', modelId, code: f.code, message: f.message });
      return;
    }
    if (value) {
      retire();
      setPhase('completed');
      rec.pauseState = null;
      rec.error = null;
      emit({ type: 'completed', modelId });
      return;
    }
    // A null the controller did not ask for: the paused branch of the procedure. Every
    // branch ends with an event, so a hub in `downloading` is never left waiting (I2).
    let o: Outcome;
    try {
      o = await runProcedureBranch(L, false);
    } catch (cause) {
      console.warn('[download-controller] unrequested stop hit an error; cancelling', cause);
      o = failPause(L);
    }
    if (o.res.kind === 'completed') emit({ type: 'completed', modelId });
    else if (o.res.kind === 'failed') {
      emit({ type: 'failed', modelId, code: o.res.code as DownloadErrorCode, message: o.res.message });
    } else if (o.res.kind === 'pause-failed') {
      // The transfer was cancelled and the pause state the controller kept is the truth: report
      // it as an unrequested stop so the hub's copy matches (a `failed` would drop it, P12).
      // Row, phase and event agree: paused, with the kept pause state.
      setPhase('paused');
      rec.error = null;
      await save('paused', modelId, rec.pauseState);
      emit({ type: 'stopped', modelId, pauseState: o.res.pauseState, reason: 'unrequested' });
    }
  }

  /** Step 2 of the pause procedure: branch on `task.state`, never on a throw (F2). */
  async function runProcedureBranch(L: Live, asked: boolean): Promise<Outcome> {
    const task = L.task;
    const modelId = L.modelId;
    const state = task.state;
    if (state === 'paused') {
      const ps = normalizePauseState(task.savable());
      retire();
      rec.pauseState = ps;
      setPhase('paused');
      const saved = await save('paused', modelId, ps);
      if (!asked) emit({ type: 'stopped', modelId, pauseState: ps, reason: 'unrequested' });
      return {
        res: { kind: 'paused', pauseState: ps, strict: latch, rowSaved: saved },
        ran: true,
        noResume: ps === null,
      };
    }
    if (state === 'completed') {
      retire();
      setPhase('completed');
      rec.pauseState = null;
      return { res: { kind: 'completed' }, ran: true, noResume: false };
    }
    if (state === 'error') {
      const f = L.rejection.has
        ? failureOf(L.rejection.error)
        : { code: 'unknown' as DownloadErrorCode, message: 'The download failed.' };
      retire();
      setPhase('failed');
      rec.pauseState = null;
      rec.error = f;
      return { res: { kind: 'failed', code: f.code, message: f.message }, ran: true, noResume: false };
    }
    return failPause(L);
  }

  /** Cancel (guarded), end the generation, keep the pause state the transfer started from. */
  function failPause(L: Live): Outcome {
    cancelTransfer(L.task, L.gen);
    retire();
    setPhase('failed');
    rec.pauseFailed = true;
    rec.error = { code: 'unknown', message: PAUSE_FAILED_MESSAGE };
    return {
      res: { kind: 'pause-failed', pauseState: rec.pauseState, strict: latch, rowSaved: rec.rowSaved },
      ran: true,
      noResume: false,
    };
  }

  /** The shared pause procedure for an `active` transfer. */
  async function pauseProcedure(): Promise<Outcome> {
    const L = live;
    if (!L) throw new Error('no live transfer');
    try {
      if (L.task.state === 'active') {
        L.progressSinceAsk = false;
        let asked: Promise<'settled'>;
        try {
          asked = L.task.pauseAsync().then(
            () => 'settled' as const,
            () => 'settled' as const,
          );
        } catch {
          asked = Promise.resolve('settled' as const);
        }
        let settled = false;
        void asked.then(() => {
          settled = true;
        });
        // Progress delivered inside the grace is stale (emitted before the ask): only
        // progress between the grace's end and the re-issue counts. Both timers count
        // foreground time and re-arm together.
        // The grace is not one-shot: it re-runs after every foreground return, so progress
        // delivered before a return never counts toward the re-issue that follows it.
        const grace = foregroundTimer(REISSUE_GRACE_MS, () => {
          L.progressSinceAsk = false;
        });
        const reissue = foregroundTimer(
          REISSUE_MS,
          () => {
            if (settled || !L.progressSinceAsk || L.task.state !== 'active') return;
            try {
              L.task.pause();
            } catch {
              // no longer active (F1)
            }
          },
          true,
        );
        let watchdog!: { cancel(): void };
        const timeout = new Promise<'timeout'>((resolve) => {
          watchdog = foregroundTimer(WATCHDOG_MS, () => resolve('timeout'));
        });
        try {
          await Promise.race([asked, timeout]);
        } finally {
          grace.cancel();
          reissue.cancel();
          watchdog.cancel();
        }
      }
      return await runProcedureBranch(L, true);
    } catch (cause) {
      console.warn('[download-controller] pause procedure threw; cancelling', cause);
      return failPause(L);
    }
  }

  // ---- strict reporting
  function mapStrict(o: Outcome): StrictResult {
    const r = o.res;
    if (r.kind === 'paused') {
      if (o.ran && o.noResume) return { kind: 'not-keepable', why: 'no-resume-data', rowSaved: r.rowSaved };
      return { kind: 'kept', pauseState: r.pauseState, rowSaved: r.rowSaved };
    }
    if (r.kind === 'completed') return { kind: 'completed', rowSaved: rec.rowSaved };
    if (r.kind === 'failed') return { kind: 'not-keepable', why: 'failed', rowSaved: rec.rowSaved };
    return { kind: 'not-keepable', why: 'pause-failed', rowSaved: r.rowSaved };
  }

  function emitStrict(o: Outcome, modelId: CuratedModelId): void {
    const r = o.res;
    if (r.kind === 'paused' || (r.kind === 'pause-failed' && o.ran)) {
      emit({ type: 'stopped', modelId, pauseState: r.pauseState, reason: 'strict' });
    } else if (r.kind === 'completed' && o.ran) {
      emit({ type: 'completed', modelId });
    } else if (r.kind === 'failed' && o.ran) {
      emit({ type: 'failed', modelId, code: r.code as DownloadErrorCode, message: r.message });
    }
  }

  function heldOutcome(): Outcome | null {
    if (rec.phase === 'paused') {
      return {
        res: { kind: 'paused', pauseState: rec.pauseState, strict: latch, rowSaved: rec.rowSaved },
        ran: false,
        noResume: false,
      };
    }
    if (rec.phase === 'completed') return { res: { kind: 'completed' }, ran: false, noResume: false };
    if (rec.phase === 'failed' && rec.pauseFailed) {
      return {
        res: { kind: 'pause-failed', pauseState: rec.pauseState, strict: latch, rowSaved: rec.rowSaved },
        ran: false,
        noResume: false,
      };
    }
    if (rec.phase === 'failed') {
      return {
        res: { kind: 'failed', code: rec.error?.code ?? 'unknown', message: rec.error?.message ?? '' },
        ran: false,
        noResume: false,
      };
    }
    return null;
  }

  // ---- operations
  function checkModel(modelId: CuratedModelId): void {
    if (rec.modelId && rec.modelId !== modelId) {
      if (live) throw new TransferInFlightError();
      throw new WrongModelError();
    }
  }

  async function pauseOp(modelId: CuratedModelId, j: Join): Promise<PauseResult> {
    try {
      return await pauseOpInner(modelId, j);
    } finally {
      // Cleared on every exit, including a throw, so a stopForStrict() never joins a dead pause.
      if (join === j) join = null;
    }
  }

  async function pauseOpInner(modelId: CuratedModelId, j: Join): Promise<PauseResult> {
    await loadInternal();
    checkModel(modelId);
    let outcome: Outcome;
    let kwSaved = true;
    let heldReport = false;
    let wroteNone = false;
    if (rec.phase === 'active' && live) {
      // Whether the kill window applies is decided here, at the moment step 1 would begin.
      if (j.strictJoined) kwSaved = await save('paused', modelId, null); // kill window, before step 1
      outcome = await pauseProcedure();
    } else {
      const held = heldOutcome();
      if (held) {
        heldReport = true;
        outcome = held;
      } else {
        wroteNone = true;
        rec.modelId = modelId;
        setPhase('paused');
        const saved = await save('paused', modelId, rec.pauseState);
        outcome = {
          res: { kind: 'paused', pauseState: rec.pauseState, strict: latch, rowSaved: saved },
          ran: false,
          noResume: false,
        };
      }
    }
    if (outcome.res.kind === 'paused' || outcome.res.kind === 'pause-failed') {
      outcome.res = { ...outcome.res, strict: latch, rowSaved: outcome.res.rowSaved };
    }
    if (j.strictJoined) {
      const mapped = mapStrict(outcome);
      // A held record means this call asked for no write: rowSaved is true, as for an unjoined stop.
      // Phase `none` is what an unjoined stop calls nothing-running; its write's outcome is the one asked for.
      j.strictResult = heldReport
        ? ({ ...mapped, rowSaved: true } as StrictResult)
        : wroteNone
          ? { kind: 'nothing-running', rowSaved: outcome.res.kind === 'paused' ? outcome.res.rowSaved : true }
          : outcome.res.kind === 'paused'
            ? mapped
            : ({ ...mapped, rowSaved: kwSaved } as StrictResult);
      emitStrict(outcome, modelId);
    }
    // No stopForStrict() can join from here on: the decision above was the last read of strictJoined.
    if (join === j) join = null;
    return outcome.res;
  }

  function pause(modelId: CuratedModelId): Promise<PauseResult> {
    if (join && join.modelId === modelId) return join.promise;
    const j: Join = { modelId, strictJoined: false, promise: undefined as unknown as Promise<PauseResult> };
    j.promise = enqueue(() => pauseOp(modelId, j));
    // A join for another model is never overwritten (that pause is about to reject or be a no-op).
    if (!join) join = j;
    return j.promise;
  }

  async function strictOp(): Promise<StrictResult> {
    try {
      await loadInternal();
      let outcome: Outcome | null = null;
      if (rec.phase === 'active' && live) {
        const modelId = live.modelId;
        const kw = await save('paused', modelId, null);
        outcome = await pauseProcedure();
        const rowSaved = outcome.res.kind === 'paused' ? outcome.res.rowSaved : kw;
        const result: StrictResult = { ...mapStrict(outcome), rowSaved };
        emitStrict(outcome, modelId);
        return result;
      }
      // A held completed or failed record is reported as it is and emits nothing: its settlement
      // already emitted (spec: "A strict stop that finds a held record").
      outcome = heldOutcome();
      if (outcome && rec.modelId) {
        // No write was asked for: rowSaved is true (spec).
        const result: StrictResult = { ...mapStrict(outcome), rowSaved: true };
        emitStrict(outcome, rec.modelId);
        return result;
      }
      if (rec.modelId) {
        emit({ type: 'stopped', modelId: rec.modelId, pauseState: rec.pauseState, reason: 'strict' });
      }
      return { kind: 'nothing-running', rowSaved: true };
    } catch (cause) {
      console.warn('[download-controller] strict stop hit an error', cause);
      return { kind: 'not-keepable', why: 'pause-failed', rowSaved: false };
    }
  }

  function stopForStrict(): Promise<StrictResult> {
    latch = true;
    if (!loadedOnce) return Promise.resolve({ kind: 'nothing-running', rowSaved: true });
    // Joins a queued or running pause of the model the record is for, even when its transfer does not
    // exist yet (a start still on its write): the pause op decides whether the kill window applies.
    if (join && !join.strictJoined && rec.modelId !== null && join.modelId === rec.modelId) {
      const j = join;
      j.strictJoined = true;
      // If the joined pause rejects, the strict stop still runs. A fulfilled join always carries a
      // strictResult (set before the join is cleared): the `?? enqueue(strictOp)` is unreachable and defensive.
      return j.promise.then(
        () => j.strictResult ?? enqueue(strictOp),
        () => enqueue(strictOp),
      );
    }
    return enqueue(strictOp);
  }

  function releaseStrictStop(): Promise<{ kind: 'released'; wasSet: boolean }> {
    const wasSet = latch;
    latch = false;
    return enqueue(async () => ({ kind: 'released' as const, wasSet }));
  }

  async function startOrResume(modelId: CuratedModelId, op: 'start' | 'resume'): Promise<StartResult> {
    await loadInternal();
    if (latch) return { kind: 'refused', reason: 'stopped-for-strict' };
    if (gate) {
      const g = await gate(modelId, op);
      if (!g.allowed) return { kind: 'refused', reason: g.reason };
    }
    if (live) {
      if (live.modelId === modelId) return { kind: 'attached', snapshot: snapshot(), rowSaved: rec.rowSaved };
      throw new TransferInFlightError();
    }
    if (rec.phase === 'completed' && rec.modelId === modelId) return { kind: 'completed', snapshot: snapshot() };
    if (rec.modelId !== modelId) {
      rec.modelId = modelId;
      rec.pauseState = null;
    }
    const resumeFrom = op === 'resume' ? rec.pauseState : null;
    if (op === 'start') rec.pauseState = null;
    rec.error = null;
    const gen = ++genCounter;
    const onProgress = (p: Progress) => {
      if (live?.gen !== gen || rec.phase !== 'active') return;
      live.progressSinceAsk = true;
      rec.progress = { bytesWritten: p.bytesWritten, totalBytes: p.totalBytes };
      emit({ type: 'progress', modelId, bytesWritten: p.bytesWritten, totalBytes: p.totalBytes });
    };
    const saved = await save('downloading', modelId, null);
    let handle: TransferHandle;
    try {
      handle =
        resumeFrom?.resumeData !== undefined
          ? driver.resume(modelId, resumeFrom, { onProgress })
          : driver.start(modelId, { onProgress });
    } catch (error) {
      const f = failureOf(error);
      setPhase('failed');
      rec.pauseState = null;
      rec.error = f;
      return { kind: 'failed', code: f.code, message: f.message, rowSaved: saved };
    }
    createTransfer(modelId, gen, handle);
    return { kind: handle.kind, snapshot: snapshot(), rowSaved: saved };
  }

  return {
    load: () => enqueue(loadInternal),
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    readRow: () =>
      enqueue(async () => {
        await loadInternal();
        return rec.row ? { ...rec.row } : null;
      }),
    start: (modelId) => enqueue(() => startOrResume(modelId, 'start')),
    resume: (modelId) => enqueue(() => startOrResume(modelId, 'resume')),
    attach: (modelId) =>
      enqueue(async (): Promise<AttachResult> => {
        await loadInternal();
        if (rec.modelId === modelId) {
          if (rec.phase === 'active' && live) return { kind: 'attached', snapshot: snapshot() };
          if (rec.phase === 'completed') return { kind: 'completed', snapshot: snapshot() };
          if (rec.phase === 'failed') {
            return {
              kind: 'failed',
              code: rec.error?.code ?? 'unknown',
              message: rec.error?.message ?? '',
              snapshot: snapshot(),
            };
          }
        }
        return { kind: 'not-live', snapshot: snapshot() };
      }),
    pause,
    park: (modelId) =>
      enqueue(async () => {
        await loadInternal();
        if (live) throw new TransferInFlightError();
        if (rec.modelId !== modelId) rec.modelId = modelId;
        rec.pauseState = null;
        setPhase('none');
        rec.error = null;
        return { rowSaved: await save('downloading', modelId, null) };
      }),
    abandon: () =>
      enqueue(async () => {
        await loadInternal();
        if (live) {
          cancelTransfer(live.task, live.gen);
          retire();
        }
        rec.modelId = null;
        setPhase('none');
        rec.pauseState = null;
        rec.error = null;
        rec.progress = { ...EMPTY_PROGRESS };
        return { rowSaved: await saveClear() };
      }),
    record: (modelId, status) =>
      enqueue(async () => {
        await loadInternal();
        if (live) throw new TransferInFlightError();
        const keep = status === 'failed' && rec.modelId === modelId ? rec.pauseState : null;
        rec.modelId = modelId;
        rec.pauseState = keep;
        setPhase('none');
        if (status !== 'failed') rec.error = null;
        return { rowSaved: await save(status, modelId, keep) };
      }),
    stopForStrict,
    releaseStrictStop,
  };
}

// ------------------------------------------------------------ singleton

function createRealDriver(): TransferDriver {
  return {
    platform: transferPlatform(Platform.OS),
    start: (modelId, { onProgress }) => startDownload(getCuratedModel(modelId), { onProgress }),
    resume: (_modelId, pauseState, { onProgress }) => resumeDownload(pauseState, { onProgress }),
    onAppState(listener) {
      listener(AppState.currentState ?? 'active');
      const sub = AppState.addEventListener('change', listener);
      return () => sub.remove();
    },
  };
}

let singleton: ModelDownloadController | null = null;

export function getModelDownloadController(): ModelDownloadController {
  if (!singleton) {
    singleton = createModelDownloadController({
      driver: createRealDriver(),
      timers: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      openStore: async () => createModelDownloadStateStore(await SQLite.openDatabaseAsync('curated_journal.db')),
    });
  }
  return singleton;
}
