import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

const SEED = 1337;

class CountingSink implements ChunkSink {
  uploads = 0;
  upload(_key: string, _meshes: ChunkMeshes): void {
    this.uploads++;
  }
  dispose(_key: string): void {}
}

function makeManager(sink: ChunkSink, viewDistance: number, genBudget: number, meshBudget: number) {
  const registry = new BlockRegistry();
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    { viewDistance, genBudget, meshBudget },
  );
}

describe('ChunkManager mesh dedup (P2)', () => {
  it('meshes each chunk at most once per frame (no redundant same-frame neighbor remeshes)', () => {
    const sink = new CountingSink();
    const mgr = makeManager(sink, 1, 64, 64); // 3x3 region, generate + mesh all in one frame
    mgr.update(0, 0);
    // Without dedup, each chunk also remeshes its already-meshed neighbors this frame (>9 uploads).
    // With dedup, all neighbor data is already present at first mesh, so each chunk meshes once.
    expect(sink.uploads).toBe(9);
  });
});
