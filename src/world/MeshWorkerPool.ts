import type { ChunkMeshes } from '../mesh/MeshTypes';
import type { MeshJob, MeshJobResult } from './meshJob';

/** The seam ChunkManager dispatches through; tests substitute a stub. */
export interface MeshScheduler {
  submit(job: MeshJob): Promise<ChunkMeshes>;
  dispose(): void;
}

interface PendingJob {
  job: MeshJob;
  resolve: (meshes: ChunkMeshes) => void;
  reject: (err: Error) => void;
}

/**
 * Fixed-size pool of mesh workers (P6). One in-flight job per worker; overflow queues
 * FIFO. Workers read chunk memory through SharedArrayBuffers, so `supported()` requires
 * cross-origin isolation (COOP/COEP headers) — callers fall back to synchronous meshing
 * when it returns false.
 */
export class MeshWorkerPool implements MeshScheduler {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly inFlight = new Map<Worker, PendingJob>();
  private readonly queue: PendingJob[] = [];
  private disposed = false;

  /** Whether this environment can run the shared-memory worker path. */
  static supported(): boolean {
    return (
      typeof Worker !== 'undefined' &&
      typeof SharedArrayBuffer !== 'undefined' &&
      globalThis.crossOriginIsolated === true
    );
  }

  constructor(size?: number) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
    const count = Math.max(1, Math.min(size ?? hw - 1, 4));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<MeshJobResult>) => this.onResult(worker, event.data);
      worker.onerror = (event) =>
        this.onError(worker, new Error(event.message || 'mesh worker error'));
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Number of workers in the pool (dev HUD / tests). */
  get size(): number {
    return this.workers.length;
  }

  submit(job: MeshJob): Promise<ChunkMeshes> {
    if (this.disposed) return Promise.reject(new Error('MeshWorkerPool disposed'));
    return new Promise<ChunkMeshes>((resolve, reject) => {
      const pending: PendingJob = { job, resolve, reject };
      const worker = this.idle.pop();
      if (worker) this.dispatch(worker, pending);
      else this.queue.push(pending);
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const worker of this.workers) worker.terminate();
    const err = new Error('MeshWorkerPool disposed');
    for (const pending of this.inFlight.values()) pending.reject(err);
    for (const pending of this.queue) pending.reject(err);
    this.inFlight.clear();
    this.queue.length = 0;
    this.workers.length = 0;
    this.idle.length = 0;
  }

  private dispatch(worker: Worker, pending: PendingJob): void {
    this.inFlight.set(worker, pending);
    // Chunk buffers are SharedArrayBuffers: passed by reference, nothing to transfer.
    worker.postMessage(pending.job);
  }

  private onResult(worker: Worker, result: MeshJobResult): void {
    const pending = this.inFlight.get(worker);
    this.inFlight.delete(worker);
    this.next(worker);
    pending?.resolve(result.meshes);
  }

  private onError(worker: Worker, err: Error): void {
    const pending = this.inFlight.get(worker);
    this.inFlight.delete(worker);
    this.next(worker);
    pending?.reject(err);
  }

  private next(worker: Worker): void {
    if (this.disposed) return;
    const queued = this.queue.shift();
    if (queued) this.dispatch(worker, queued);
    else this.idle.push(worker);
  }
}
