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
    {
      viewDistance,
      genBudget,
      meshBudget,
    },
  );
}

describe('ChunkManager.lastFrameStats', () => {
  it('records generation and mesh work for the frame, with a non-negative update time', () => {
    const mgr = makeManager(1, 64, 64);
    mgr.update(0, 0);
    const stats = mgr.lastFrameStats;
    expect(stats.genCount).toBeGreaterThan(0);
    expect(stats.meshCount).toBeGreaterThan(0);
    expect(stats.updateMs).toBeGreaterThanOrEqual(0);
  });

  it('respects the per-frame generation budget', () => {
    const mgr = makeManager(2, 2, 64); // gen budget 2
    mgr.update(0, 0);
    expect(mgr.lastFrameStats.genCount).toBeLessThanOrEqual(2);
  });

  it('counts mesh work per frame, bounded by the unified mesh budget (P5)', () => {
    const meshBudget = 1;
    const mgr = makeManager(1, 64, meshBudget); // 3x3 region, generate all up front, mesh 1/frame
    const meshCounts: number[] = [];
    for (let i = 0; i < 40; i++) {
      mgr.update(0, 0);
      meshCounts.push(mgr.lastFrameStats.meshCount);
    }
    // The counter records mesh work (including neighbor/deferred remeshes) ...
    expect(Math.max(...meshCounts)).toBeGreaterThan(0);
    // ... but P5's unified budget keeps any single frame within the cap.
    expect(Math.max(...meshCounts)).toBeLessThanOrEqual(meshBudget);
  });

  it('resets to zero on a frame with no streaming work', () => {
    const mgr = makeManager(1, 64, 64);
    for (let i = 0; i < 50; i++) mgr.update(0, 0); // settle
    mgr.update(0, 0);
    expect(mgr.lastFrameStats.genCount).toBe(0);
    expect(mgr.lastFrameStats.meshCount).toBe(0);
  });

  it('returns an independent snapshot each frame', () => {
    const mgr = makeManager(1, 64, 1);
    mgr.update(0, 0);
    const first = mgr.lastFrameStats;
    mgr.update(0, 0);
    const second = mgr.lastFrameStats;
    expect(first).not.toBe(second); // distinct objects, not a shared mutable reference
  });
});
