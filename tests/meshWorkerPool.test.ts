import { describe, it, expect, afterEach } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';
import { runMeshJob, buildMeshJob, meshTransferables } from '../src/world/meshJob';
import {
  setSharedChunkBuffers,
  sharedChunkBuffersEnabled,
  CHUNK_BUFFER_BYTES,
} from '../src/world/chunkBuffers';
import { ChunkData } from '../src/world/ChunkData';
import { MeshWorkerPool, type MeshScheduler } from '../src/world/MeshWorkerPool';
import { STONE } from '../src/blocks/blocks';
import type { ChunkMeshes, MeshData } from '../src/mesh/MeshTypes';
import type { MeshJob } from '../src/world/meshJob';

const SEED = 1337;

afterEach(() => setSharedChunkBuffers(false));

class RecordingSink implements ChunkSink {
  readonly uploads = new Map<string, ChunkMeshes>();
  uploadCount = 0;
  upload(key: string, meshes: ChunkMeshes): void {
    this.uploads.set(key, meshes);
    this.uploadCount++;
  }
  dispose(key: string): void {
    this.uploads.delete(key);
  }
}

function makeManager(sink: ChunkSink, pool?: MeshScheduler): ChunkManager {
  const registry = new BlockRegistry();
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    { viewDistance: 1, genBudget: 64, meshBudget: 64, ...(pool ? { meshPool: pool } : {}) },
  );
}

function drain(mgr: ChunkManager, frames = 200): void {
  // streaming is false before the first update(), so always update at least once.
  for (let i = 0; i < frames; i++) {
    mgr.update(0, 0);
    if (!mgr.streaming) break;
  }
}

function expectMeshDataEqual(a: MeshData, b: MeshData): void {
  expect([...a.positions]).toEqual([...b.positions]);
  expect([...a.normals]).toEqual([...b.normals]);
  expect([...a.uvs]).toEqual([...b.uvs]);
  expect([...a.layers]).toEqual([...b.layers]);
  expect([...a.ao]).toEqual([...b.ao]);
  expect([...a.light]).toEqual([...b.light]);
  expect([...a.tint]).toEqual([...b.tint]);
  expect([...a.indices]).toEqual([...b.indices]);
}

/** A pool whose jobs run through the real worker code path (runMeshJob) but resolve on demand. */
class StubPool implements MeshScheduler {
  private readonly registry = new BlockRegistry();
  private readonly mesher = new GreedyMesher(this.registry);
  private readonly opaque = opaquePass(this.registry);
  private readonly transparent = transparentPass(this.registry);
  readonly pending: Array<{ job: MeshJob; resolve: (m: ChunkMeshes) => void }> = [];

  submit(job: MeshJob): Promise<ChunkMeshes> {
    return new Promise((resolve) => this.pending.push({ job, resolve }));
  }

  /** Resolves all pending jobs oldest-first, computing real meshes via runMeshJob. */
  async flush(): Promise<void> {
    while (this.pending.length > 0) {
      const { job, resolve } = this.pending.shift()!;
      resolve(runMeshJob(job, this.mesher, this.registry, this.opaque, this.transparent));
    }
    await Promise.resolve(); // let .then callbacks run
  }

  dispose(): void {}
}

describe('shared chunk buffers (P6)', () => {
  it('defaults to plain ArrayBuffer backing', () => {
    expect(sharedChunkBuffersEnabled()).toBe(false);
    const chunk = new ChunkData(0, 0);
    expect(chunk.buffer).toBeInstanceOf(ArrayBuffer);
    expect(chunk.buffer.byteLength).toBe(CHUNK_BUFFER_BYTES);
  });

  it('allocates SharedArrayBuffers when enabled', () => {
    setSharedChunkBuffers(true);
    const chunk = new ChunkData(0, 0);
    expect(chunk.buffer).toBeInstanceOf(SharedArrayBuffer);
  });

  it('round-trips voxel/state/light/biome writes through the single buffer', () => {
    const chunk = new ChunkData(0, 0);
    chunk.set(3, 40, 5, 7);
    chunk.setState(3, 40, 5, 2);
    chunk.setBiome(3, 5, 1);
    chunk.skyLight[0] = 15;
    const clone = ChunkData.overBuffer(0, 0, chunk.buffer, { hasShaped: true, maxSolidY: 40 });
    expect(clone.get(3, 40, 5)).toBe(7);
    expect(clone.getState(3, 40, 5)).toBe(2);
    expect(clone.getBiome(3, 5)).toBe(1);
    expect(clone.skyLight[0]).toBe(15);
    expect(clone.hasShaped).toBe(true);
    expect(clone.maxSolidY).toBe(40);
  });

  it('ChunkData copy-constructor param still seeds voxel data', () => {
    const src = new ChunkData(0, 0);
    src.set(1, 1, 1, 9);
    const copy = new ChunkData(0, 0, new Uint8Array(src.data));
    expect(copy.get(1, 1, 1)).toBe(9);
  });
});

describe('runMeshJob golden equality (P6)', () => {
  it('produces byte-identical meshes to the synchronous path', () => {
    // Synchronous reference: mesh the 3x3 region on-thread.
    const syncSink = new RecordingSink();
    const syncMgr = makeManager(syncSink);
    drain(syncMgr);
    expect(syncSink.uploads.size).toBe(9);

    // Async path: same world, real worker code (runMeshJob) via the stub pool.
    const asyncSink = new RecordingSink();
    const pool = new StubPool();
    const asyncMgr = makeManager(asyncSink, pool);
    return (async () => {
      for (let i = 0; i < 200; i++) {
        asyncMgr.update(0, 0);
        await pool.flush();
        if (!asyncMgr.streaming) break;
      }
      expect(asyncSink.uploads.size).toBe(9);
      for (const [key, meshes] of syncSink.uploads) {
        const workerMeshes = asyncSink.uploads.get(key);
        expect(workerMeshes).toBeDefined();
        expectMeshDataEqual(meshes.opaque, workerMeshes!.opaque);
        expectMeshDataEqual(meshes.transparent, workerMeshes!.transparent);
        expectMeshDataEqual(meshes.cutout, workerMeshes!.cutout);
      }
    })();
  });
});

describe('ChunkManager async mesh integration (P6)', () => {
  it('does not upload until the job resolves, then marks the chunk meshed', async () => {
    const sink = new RecordingSink();
    const pool = new StubPool();
    const mgr = makeManager(sink, pool);
    mgr.update(0, 0);
    expect(pool.pending.length).toBeGreaterThan(0);
    expect(sink.uploadCount).toBe(0);
    await pool.flush();
    expect(sink.uploadCount).toBeGreaterThan(0);
  });

  it('drops a stale result superseded by a synchronous edit remesh', async () => {
    const sink = new RecordingSink();
    const pool = new StubPool();
    const mgr = makeManager(sink, pool);
    mgr.update(0, 0); // dispatches async jobs; chunk (0,0) now Meshing with gen G
    const zeroJob = pool.pending.find((p) => p.job.key === '0,0');
    expect(zeroJob).toBeDefined();

    // Interior sync edit on (0,0) (lx=5,lz=5 → no neighbor remesh): meshes it immediately
    // and bumps its generation to G+1, superseding the in-flight worker job.
    expect(mgr.setBlock(5, 80, 5, STONE)).toBe(true);
    const before = sink.uploadCount; // includes the (0,0) sync upload

    // Resolve ONLY the stale (0,0) job: the generation guard must drop it.
    const registry = new BlockRegistry();
    const mesher = new GreedyMesher(registry);
    zeroJob!.resolve(
      runMeshJob(zeroJob!.job, mesher, registry, opaquePass(registry), transparentPass(registry)),
    );
    await Promise.resolve();
    expect(sink.uploadCount).toBe(before); // stale result dropped, no extra upload
  });

  it('drops a result for a chunk that unloaded while the job was in flight', async () => {
    const sink = new RecordingSink();
    const pool = new StubPool();
    const mgr = makeManager(sink, pool);
    mgr.update(0, 0);
    const stale = [...pool.pending];
    pool.pending.length = 0;
    mgr.update(100, 100); // move far away: all previous chunks unload
    const before = sink.uploadCount;
    const registry = new BlockRegistry();
    const mesher = new GreedyMesher(registry);
    for (const { job, resolve } of stale) {
      resolve(runMeshJob(job, mesher, registry, opaquePass(registry), transparentPass(registry)));
    }
    await Promise.resolve();
    expect(sink.uploadCount).toBe(before);
  });

  it('reports streaming while async results are in flight', async () => {
    const sink = new RecordingSink();
    const pool = new StubPool();
    const mgr = makeManager(sink, pool);
    for (let i = 0; i < 50 && pool.pending.length === 0; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(true); // jobs dispatched but unresolved
    for (let i = 0; i < 200 && mgr.streaming; i++) {
      mgr.update(0, 0);
      await pool.flush();
    }
    expect(mgr.streaming).toBe(false);
    expect(sink.uploads.size).toBe(9);
  });
});

describe('MeshWorkerPool environment gating (P6)', () => {
  it('is unsupported outside a cross-origin-isolated browser context', () => {
    expect(MeshWorkerPool.supported()).toBe(false); // node: no crossOriginIsolated page
  });
});

describe('meshTransferables (P6)', () => {
  it('collects unique non-empty result buffers', () => {
    const registry = new BlockRegistry();
    const mesher = new GreedyMesher(registry);
    setSharedChunkBuffers(false);
    const chunk = new ChunkData(0, 0);
    chunk.set(0, 0, 0, 1);
    chunk.recomputeMaxSolidY();
    const job = buildMeshJob('0,0', 1, chunk, () => undefined);
    const meshes = runMeshJob(
      job,
      mesher,
      registry,
      opaquePass(registry),
      transparentPass(registry),
    );
    const buffers = meshTransferables(meshes);
    expect(buffers.length).toBeGreaterThan(0);
    expect(new Set(buffers).size).toBe(buffers.length);
  });
});
