/**
 * A fake native `FileSystemDownloadTask`, supplied through
 * `jest.mock('expo-file-system/build/ExpoFileSystem')`, so the REAL
 * `NetworkTasks.js` `DownloadTask` runs unchanged on top of it (the spec's
 * acceptance-test seam). It can model: a pause dropped before the first
 * progress event (F8), a slow but effective pause, a cancel that never settles
 * (F4), a cancel erased before the start took effect (F11), late results, and
 * a transfer that ends in `completed` or `error`.
 *
 * NOT modelled: the iOS main-queue ordering of `release()` after the queued `start`
 * (spec F11). It is assumed from reading the installed package; `release()` here stops a
 * transfer whose cancel was lost, immediately.
 */
type Listener = (data: { bytesWritten: number; totalBytes: number }) => void;

export const world = {
  instances: [] as FakeNativeTask[],
  config: {
    /** A pause issued before the first progress event is lost (F8). */
    dropPauseBeforeProgress: false,
    /** The first pause is effective but delivered by `deliverPause()`; a second returns no resume data. */
    slowFirstPause: false,
    /** The next `cancel()` is erased, whatever its timing (F11). */
    dropNextCancel: false,
    /** `cancel()` never settles the transfer promise (F4). */
    neverSettleOnCancel: false,
    /** A cancel issued before the start took effect is erased; only `release()` stops it (F11). */
    dropCancelUntilRelease: false,
    /** `start()` resolves null at once, like the web stub (D8). */
    startResolvesNull: false,
    /** `pause()` rejects (the pause failed while the task stays active). */
    rejectPause: false,
    resumeData: 'rd' as string | undefined,
  },
  reset() {
    this.instances.length = 0;
    this.config.dropPauseBeforeProgress = false;
    this.config.slowFirstPause = false;
    this.config.dropNextCancel = false;
    this.config.neverSettleOnCancel = false;
    this.config.dropCancelUntilRelease = false;
    this.config.startResolvesNull = false;
    this.config.rejectPause = false;
    this.config.resumeData = 'rd';
  },
};

export class FakeNativeTask {
  listeners = new Set<Listener>();
  progressed = false;
  running = false;
  cancelCalls = 0;
  releaseCalls = 0;
  pauseCalls = 0;
  released = false;
  cancelLost = false;
  startArgs: unknown[] = [];
  resumeArgs: unknown[] = [];
  private resolveTransfer: ((v: string | null) => void) | null = null;
  private rejectTransfer: ((e: unknown) => void) | null = null;
  private droppedPauses: Array<(v: { resumeData?: string }) => void> = [];
  private slowPause: ((v: { resumeData?: string }) => void) | null = null;

  constructor() {
    world.instances.push(this);
  }

  private run(): Promise<string | null> {
    this.running = true;
    return new Promise<string | null>((resolve, reject) => {
      this.resolveTransfer = resolve;
      this.rejectTransfer = reject;
    });
  }

  start(...args: unknown[]): Promise<string | null> {
    this.startArgs = args;
    const p = this.run();
    if (world.config.startResolvesNull) queueMicrotask(() => this.endTransfer(null));
    return p;
  }

  resume(...args: unknown[]): Promise<string | null> {
    this.resumeArgs = args;
    return this.run();
  }

  pause(): Promise<{ resumeData?: string }> {
    this.pauseCalls += 1;
    const cfg = world.config;
    if (cfg.rejectPause) return Promise.reject(new Error('pause failed'));
    if (cfg.slowFirstPause) {
      if (this.pauseCalls === 1) {
        return new Promise((resolve) => {
          this.slowPause = resolve;
        });
      }
      return Promise.resolve({ resumeData: undefined });
    }
    if (cfg.dropPauseBeforeProgress && !this.progressed) {
      return new Promise((resolve) => this.droppedPauses.push(resolve));
    }
    const data = { resumeData: cfg.resumeData };
    for (const r of this.droppedPauses.splice(0)) r(data);
    this.endTransfer(null);
    return Promise.resolve(data);
  }

  /** Delivers a slow pause: the transfer ends `null` and the pause resolves. */
  deliverPause(): void {
    const data = { resumeData: world.config.resumeData };
    this.endTransfer(null);
    this.slowPause?.(data);
  }

  /** The transfer finished first; the slow pause then resolves (F2). */
  completeDuringPause(): void {
    this.endTransfer('file:///doc/f.gguf');
    this.slowPause?.({ resumeData: undefined });
  }

  /** The transfer failed while the pause was pending. */
  failDuringPause(error: unknown): void {
    this.failTransfer(error);
    this.slowPause?.({ resumeData: undefined });
  }

  cancel(): void {
    this.cancelCalls += 1;
    if (world.config.dropNextCancel) {
      world.config.dropNextCancel = false;
      this.cancelLost = true;
      return;
    }
    if (world.config.dropCancelUntilRelease) {
      this.cancelLost = true;
      return;
    }
    if (world.config.neverSettleOnCancel) {
      this.running = false;
      return;
    }
    this.failTransfer(new Error('cancelled'));
  }

  release(): void {
    this.releaseCalls += 1;
    this.released = true;
    this.listeners.clear();
    if (this.cancelLost) {
      this.cancelLost = false;
      this.failTransfer(new Error('released'));
    }
  }

  addListener(_name: string, listener: Listener): { remove(): void } {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }

  emitProgress(bytesWritten: number, totalBytes = 1000): void {
    if (this.released || !this.running) return;
    this.progressed = true;
    for (const l of [...this.listeners]) l({ bytesWritten, totalBytes });
  }

  /** Ends the transfer: completed (a uri) or paused (null). */
  endTransfer(value: string | null): void {
    this.running = false;
    this.resolveTransfer?.(value);
    this.resolveTransfer = null;
  }

  finish(): void {
    this.endTransfer('file:///doc/f.gguf');
  }

  failTransfer(error: unknown): void {
    this.running = false;
    this.rejectTransfer?.(error);
    this.rejectTransfer = null;
  }
}

/** Lets queued microtasks and promise chains run. */
export async function flush(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
