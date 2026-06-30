import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

const SEED = 1337;

class FakeSink implements ChunkSink {
  upload(_key: string, _meshes: ChunkMeshes): void {}
  dispose(_key: string): void {}
}

function makeManager(viewDistance: number, genBudget: number, meshBudget: number): ChunkManager {
  const registry = new BlockRegistry();
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    new FakeSink(),
    SEED,
    [],
    { viewDistance, genBudget, meshBudget },
  );
}

describe('ChunkManager streaming state (P1)', () => {
  it('is streaming while work is pending and idle once settled', () => {
    const mgr = makeManager(1, 1, 1); // tiny budget -> needs many frames
    mgr.update(0, 0);
    expect(mgr.streaming).toBe(true);
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('keeps draining the backlog across same-center frames (idle early-out never starves work)', () => {
    const mgr = makeManager(1, 1, 1);
    for (let i = 0; i < 200; i++) mgr.update(0, 0); // only ever the same center
    expect(mgr.streaming).toBe(false);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('re-enters streaming after the center moves to new chunks', () => {
    const mgr = makeManager(1, 1, 1);
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);
    mgr.update(50, 0); // far move -> a fresh desired set, nothing loaded there yet
    expect(mgr.streaming).toBe(true);
  });
});
