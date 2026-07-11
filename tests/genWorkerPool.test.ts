import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { runGenJob } from '../src/world/genJob';
import { GenWorkerPool, type GenScheduler } from '../src/world/GenWorkerPool';
import { STONE } from '../src/blocks/blocks';
import { voxelIndex } from '../src/core/coords';
import type { GenJob, GenJobResult } from '../src/world/genJob';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';
import type { WorldDeltas } from '../src/persistence/SaveTypes';

const SEED = 1337;

class RecordingSink implements ChunkSink {
  readonly uploads = new Map<string, ChunkMeshes>();
  upload(key: string, meshes: ChunkMeshes): void {
    this.uploads.set(key, meshes);
  }
  dispose(key: string): void {
    this.uploads.delete(key);
  }
}

/** A pool whose jobs run the real worker code path (runGenJob) but resolve on demand. */
class StubGenPool implements GenScheduler {
  private readonly generator = createWorldGenerator();
  readonly pending: Array<{
    job: GenJob;
    resolve: (r: GenJobResult) => void;
    reject: (e: Error) => void;
  }> = [];
  submitted = 0;

  submit(job: GenJob): Promise<GenJobResult> {
    this.submitted++;
    return new Promise((resolve, reject) => this.pending.push({ job, resolve, reject }));
  }

  /** Resolves all pending jobs oldest-first with real generated chunks. */
  async flush(): Promise<void> {
    while (this.pending.length > 0) {
      const { job, resolve } = this.pending.shift()!;
      const chunk = runGenJob(this.generator, [], SEED, job.cx, job.cz);
      resolve({ cx: job.cx, cz: job.cz, buffer: chunk.buffer });
    }
    await Promise.resolve(); // let .then callbacks run
  }

  dispose(): void {}
}

function makeManager(
  sink: ChunkSink,
  pool?: GenScheduler,
  savedDeltas?: WorldDeltas,
): ChunkManager {
  const registry = new BlockRegistry();
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    { viewDistance: 1, genBudget: 64, meshBudget: 64, ...(pool ? { genPool: pool } : {}) },
    savedDeltas,
  );
}

async function drainAsync(mgr: ChunkManager, pool: StubGenPool, frames = 200): Promise<void> {
  for (let i = 0; i < frames; i++) {
    mgr.update(0, 0);
    await pool.flush();
    if (!mgr.streaming) break;
  }
}

describe('ChunkManager async generation (P7)', () => {
  it('produces byte-identical chunks to the synchronous path', async () => {
    const syncMgr = makeManager(new RecordingSink());
    for (let i = 0; i < 200 && (i === 0 || syncMgr.streaming); i++) syncMgr.update(0, 0);

    const pool = new StubGenPool();
    const asyncMgr = makeManager(new RecordingSink(), pool);
    await drainAsync(asyncMgr, pool);

    expect(asyncMgr.loadedChunkCount()).toBe(9);
    for (let cz = -1; cz <= 1; cz++) {
      for (let cx = -1; cx <= 1; cx++) {
        for (let y = 0; y < 120; y += 7) {
          const wx = cx * 16 + 3;
          const wz = cz * 16 + 11;
          expect(asyncMgr.getBlock(wx, y, wz)).toBe(syncMgr.getBlock(wx, y, wz));
          expect(asyncMgr.getBlockLight(wx, y, wz)).toBe(syncMgr.getBlockLight(wx, y, wz));
        }
      }
    }
  });

  it('applies saved deltas when finalizing a worker chunk (and reverts drop the delta)', async () => {
    const deltas: WorldDeltas = new Map([['0,0', new Map([[voxelIndex(1, 200, 1), STONE]])]]);
    const pool = new StubGenPool();
    const mgr = makeManager(new RecordingSink(), pool, deltas);
    await drainAsync(mgr, pool);
    expect(mgr.getBlock(1, 200, 1)).toBe(STONE);
    // Revert to the generated value (air at y=200): the delta entry must disappear.
    mgr.setBlock(1, 200, 1, 0);
    expect(mgr.getChunkDelta('0,0')).toEqual([]);
  });

  it('does not store chunks until results resolve, and player stands on unloaded = solid', async () => {
    const pool = new StubGenPool();
    const mgr = makeManager(new RecordingSink(), pool);
    mgr.update(0, 0);
    expect(mgr.loadedChunkCount()).toBe(0);
    expect(mgr.isSolid(0, 50, 0)).toBe(true); // unloaded reads solid
    expect(mgr.streaming).toBe(true);
    await drainAsync(mgr, pool);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('drops results for chunks that left range while in flight', async () => {
    const pool = new StubGenPool();
    const mgr = makeManager(new RecordingSink(), pool);
    mgr.update(0, 0); // dispatch jobs around origin
    const stale = [...pool.pending];
    pool.pending.length = 0;
    mgr.update(100, 100); // move far away
    for (const { job, resolve } of stale) {
      const chunk = runGenJob(createWorldGenerator(), [], SEED, job.cx, job.cz);
      resolve({ cx: job.cx, cz: job.cz, buffer: chunk.buffer });
    }
    await Promise.resolve();
    for (let i = 0; i < 200; i++) {
      mgr.update(100, 100);
      await pool.flush();
      if (!mgr.streaming) break;
    }
    // Only the chunks around (100,100) exist; nothing near the origin was adopted.
    expect(mgr.isLoaded(0, 0)).toBe(false);
    expect(mgr.isLoaded(100 * 16, 100 * 16)).toBe(true);
  });

  it('falls back to synchronous generation when a worker job fails', async () => {
    const pool = new StubGenPool();
    const mgr = makeManager(new RecordingSink(), pool);
    mgr.update(0, 0);
    // Fail every dispatched job.
    for (const { reject } of pool.pending.splice(0)) reject(new Error('worker crashed'));
    await Promise.resolve();
    // Subsequent updates generate those chunks synchronously (genFallback path).
    for (let i = 0; i < 200 && mgr.streaming; i++) {
      mgr.update(0, 0);
      await pool.flush();
    }
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('does not double-dispatch a chunk already in flight', async () => {
    const pool = new StubGenPool();
    const mgr = makeManager(new RecordingSink(), pool);
    mgr.update(0, 0);
    const afterFirst = pool.submitted;
    mgr.update(0, 0); // same center, jobs still pending
    expect(pool.submitted).toBe(afterFirst);
  });
});

describe('GenWorkerPool environment gating (P7)', () => {
  it('requires only Worker (no cross-origin isolation)', () => {
    // Node test env has no Worker global; in any browser (including plain GitHub Pages)
    // this returns true — unlike the mesh pool, which needs SharedArrayBuffer.
    expect(GenWorkerPool.supported()).toBe(typeof Worker !== 'undefined');
  });
});
