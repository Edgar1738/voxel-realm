import { sharedChunkBuffersEnabled } from './chunkBuffers';
import type { GenJob, GenJobResult, GenWorkerInit } from './genJob';
import type { WorldSeed } from '../core/types';

/** The seam ChunkManager dispatches generation through; tests substitute a stub. */
export interface GenScheduler {
  submit(job: GenJob): Promise<GenJobResult>;
  dispose(): void;
}

interface PendingJob {
  job: GenJob;
  resolve: (result: GenJobResult) => void;
  reject: (err: Error) => void;
}

/**
 * Fixed-size pool of generation workers. One in-flight job per worker; overflow queues
 * FIFO. Unlike the mesh pool this needs no shared memory — results come back as posted
 * SharedArrayBuffers when the page is isolated, or transferred ArrayBuffers otherwise —
 * so `supported()` only requires Worker (generation stays off-thread on GitHub Pages).
 */
export class GenWorkerPool implements GenScheduler {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly inFlight = new Map<Worker, PendingJob>();
  private readonly queue: PendingJob[] = [];
  private disposed = false;

  static supported(): boolean {
    return typeof Worker !== 'undefined';
  }

  constructor(preset: string, seed: WorldSeed, size?: number) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
    const count = Math.max(1, Math.min(size ?? hw - 1, 4));
    const init: GenWorkerInit = {
      kind: 'init',
      preset,
      seed,
      sharedBuffers: sharedChunkBuffersEnabled(),
    };
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<GenJobResult>) => this.onResult(worker, event.data);
      worker.onerror = (event) =>
        this.onError(worker, new Error(event.message || 'gen worker error'));
      worker.postMessage(init);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Number of workers in the pool (dev HUD / tests). */
  get size(): number {
    return this.workers.length;
  }

  submit(job: GenJob): Promise<GenJobResult> {
    if (this.disposed) return Promise.reject(new Error('GenWorkerPool disposed'));
    return new Promise<GenJobResult>((resolve, reject) => {
      const pending: PendingJob = { job, resolve, reject };
      const worker = this.idle.pop();
      if (worker) this.dispatch(worker, pending);
      else this.queue.push(pending);
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const worker of this.workers) worker.terminate();
    const err = new Error('GenWorkerPool disposed');
    for (const pending of this.inFlight.values()) pending.reject(err);
    for (const pending of this.queue) pending.reject(err);
    this.inFlight.clear();
    this.queue.length = 0;
    this.workers.length = 0;
    this.idle.length = 0;
  }

  private dispatch(worker: Worker, pending: PendingJob): void {
    this.inFlight.set(worker, pending);
    worker.postMessage({ kind: 'job', ...pending.job });
  }

  private onResult(worker: Worker, result: GenJobResult): void {
    const pending = this.inFlight.get(worker);
    this.inFlight.delete(worker);
    this.next(worker);
    pending?.resolve(result);
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
