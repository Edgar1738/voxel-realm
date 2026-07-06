import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import type { MeshScheduler } from '../src/world/MeshWorkerPool';
import type { MeshJob } from '../src/world/meshJob';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { STONE, AIR } from '../src/blocks/blocks';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

const SEED = 1337;
const EMPTY_MESHES = { opaque: {}, transparent: {}, cutout: {} } as unknown as ChunkMeshes;

class FakeSink implements ChunkSink {
  uploads = new Map<string, number>();
  disposed: string[] = [];
  upload(key: string, _meshes: ChunkMeshes): void {
    this.uploads.set(key, (this.uploads.get(key) ?? 0) + 1);
  }
  dispose(key: string): void {
    this.disposed.push(key);
  }
}

/** Records every submitted job and resolves on the microtask queue (like the real worker pool). */
class MockPool implements MeshScheduler {
  submitted: MeshJob[] = [];
  submit(job: MeshJob): Promise<ChunkMeshes> {
    this.submitted.push(job);
    return Promise.resolve(EMPTY_MESHES);
  }
  dispose(): void {}
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeManager(sink: ChunkSink, pool: MeshScheduler) {
  const registry = new BlockRegistry();
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    {
      viewDistance: 1,
      genBudget: 64,
      meshBudget: 64,
      meshPool: pool,
    },
  );
}

describe('ChunkManager edit remeshing', () => {
  it('dispatches edit remeshes through the mesh pool instead of blocking on the main thread', async () => {
    const sink = new FakeSink();
    const pool = new MockPool();
    const mgr = makeManager(sink, pool);

    // Load + mesh the neighborhood through the pool.
    for (let i = 0; i < 5; i++) mgr.update(0, 0);
    await flush();
    expect(sink.uploads.has('0,0')).toBe(true);

    // Fresh counters for the edit under test.
    pool.submitted = [];
    sink.uploads.clear();

    // Edit a voxel in chunk (0,0): flip it to guarantee a real change → remesh.
    const cur = mgr.getBlock(1, 40, 1);
    expect(mgr.setBlock(1, 40, 1, cur === STONE ? AIR : STONE)).toBe(true);

    // The remesh must go to the pool (async), not synchronously upload on the edit call.
    expect(pool.submitted.some((j) => j.key === '0,0')).toBe(true);
    expect(sink.uploads.has('0,0')).toBe(false);

    // Once the worker resolves, the fresh mesh uploads.
    await flush();
    expect(sink.uploads.has('0,0')).toBe(true);
  });

  it('falls back to synchronous meshing (immediate upload) when no pool is configured', () => {
    const registry = new BlockRegistry();
    const sink = new FakeSink();
    const mgr = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      [],
      {
        viewDistance: 1,
        genBudget: 64,
        meshBudget: 64,
      },
    );
    for (let i = 0; i < 5; i++) mgr.update(0, 0);
    sink.uploads.clear();
    const cur = mgr.getBlock(1, 40, 1);
    mgr.setBlock(1, 40, 1, cur === STONE ? AIR : STONE);
    // No pool → the edit meshes synchronously and uploads before returning.
    expect(sink.uploads.has('0,0')).toBe(true);
  });
});
