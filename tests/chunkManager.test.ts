import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import type { MeshData } from '../src/mesh/MeshTypes';

const SEED = 1337;

class FakeSink implements ChunkSink {
  uploads = new Map<string, number>();
  disposed: string[] = [];
  upload(key: string, _mesh: MeshData): void {
    this.uploads.set(key, (this.uploads.get(key) ?? 0) + 1);
  }
  dispose(key: string): void {
    this.disposed.push(key);
  }
}

function makeManager(sink: ChunkSink, viewDistance: number, genBudget: number, meshBudget: number) {
  return new ChunkManager(
    new HeightmapGenerator(),
    new GreedyMesher(new BlockRegistry()),
    sink,
    SEED,
    [],
    { viewDistance, genBudget, meshBudget },
  );
}

/** Runs update repeatedly so all budgeted work converges. */
function settle(mgr: ChunkManager, cx: number, cz: number, frames = 100): void {
  for (let i = 0; i < frames; i++) mgr.update(cx, cz);
}

describe('ChunkManager', () => {
  it('loads exactly the chunks within view distance (Chebyshev)', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64); // 3x3 = 9 chunks
    settle(mgr, 0, 0);
    expect(sink.uploads.size).toBe(9);
    expect(sink.uploads.has('0,0')).toBe(true);
    expect(sink.uploads.has('1,1')).toBe(true);
    expect(sink.uploads.has('2,0')).toBe(false);
  });

  it('respects the per-frame generation budget', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 1, 64); // 1 generated per frame
    mgr.update(0, 0);
    expect(sink.uploads.size).toBeLessThanOrEqual(1);
    settle(mgr, 0, 0);
    expect(sink.uploads.size).toBe(9);
  });

  it('disposes chunks that leave view distance', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64);
    settle(mgr, 0, 0);
    settle(mgr, 100, 0); // move far away
    expect(sink.disposed).toContain('0,0');
    expect(sink.uploads.has('100,0')).toBe(true);
  });

  it('re-meshes an existing chunk when a new neighbor loads (seam resolves)', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 1, 1); // force sequential loading
    settle(mgr, 0, 0);
    // The center chunk is meshed first (with missing neighbors), then re-meshed as
    // each neighbor loads, so it is uploaded more than once.
    expect(sink.uploads.get('0,0') ?? 0).toBeGreaterThan(1);
  });
});
