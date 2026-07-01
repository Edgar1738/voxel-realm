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

function drain(mgr: ChunkManager, cx = 0, cz = 0, frames = 400): void {
  for (let i = 0; i < frames && mgr.streaming !== false; i++) mgr.update(cx, cz);
  mgr.update(cx, cz);
}

describe('ChunkManager unified mesh budget (P5)', () => {
  it('never exceeds the mesh budget in a single frame, including neighbor remeshes', () => {
    const meshBudget = 2;
    const mgr = makeManager(1, 64, meshBudget); // 3x3 region, generate fast, mesh few/frame
    const counts: number[] = [];
    for (let i = 0; i < 60; i++) {
      mgr.update(0, 0);
      counts.push(mgr.lastFrameStats.meshCount);
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(meshBudget);
  });

  it('still meshes every chunk eventually as deferred remeshes drain', () => {
    const mgr = makeManager(1, 64, 1); // tightest budget
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('honors the per-frame time ceiling (frameWorkMs=0 defers all work for the frame)', () => {
    const registry = new BlockRegistry();
    const mgr = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      new FakeSink(),
      SEED,
      [],
      { viewDistance: 1, genBudget: 64, meshBudget: 64, frameWorkMs: 0 },
    );
    mgr.update(0, 0);
    expect(mgr.lastFrameStats.genCount).toBe(0);
    expect(mgr.lastFrameStats.meshCount).toBe(0);
    expect(mgr.streaming).toBe(true); // work remains, just deferred past the ceiling
  });
});

describe('ChunkManager runtime controls', () => {
  it('setViewDistance grows the loaded set and reports via the getter', () => {
    const mgr = makeManager(1, 64, 64); // 3x3
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(9);
    mgr.setViewDistance(2);
    expect(mgr.viewDistance).toBe(2);
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(25); // 5x5
  });

  it('setViewDistance shrinking disposes out-of-range chunks', () => {
    const mgr = makeManager(2, 64, 64); // 5x5
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(25);
    mgr.setViewDistance(1);
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('setStreamingBudgets raises how much streams per frame', () => {
    const mgr = makeManager(2, 2, 2); // small budgets
    mgr.setStreamingBudgets(64, 64, Infinity);
    mgr.update(0, 0); // one frame
    expect(mgr.lastFrameStats.genCount).toBeGreaterThan(2);
  });
});
