import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import { LANTERN } from '../src/blocks/blocks';
import { BURST_MESH_BUDGET } from '../src/core/constants';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';
import type { Generator } from '../src/worldgen/Generator';

const SEED = 1337;

/** All-air terrain except a single LANTERN stamped at one chunk (so light travels freely). */
class LanternWorld implements Generator {
  constructor(
    private readonly cx: number,
    private readonly cz: number,
    private readonly lx: number,
    private readonly ly: number,
    private readonly lz: number,
  ) {}
  generateBaseChunk(_seed: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === this.cx && cz === this.cz) d.set(this.lx, this.ly, this.lz, LANTERN);
    return d;
  }
}

class NullSink implements ChunkSink {
  upload(_key: string, _meshes: ChunkMeshes): void {}
  dispose(_key: string): void {}
}

function makeManager(generator: Generator, meshBudget: number): ChunkManager {
  const registry = new BlockRegistry();
  return new ChunkManager(
    generator,
    new GreedyMesher(registry),
    registry,
    new NullSink(),
    SEED,
    [],
    { viewDistance: 1, genBudget: 64, meshBudget },
  );
}

function makeManagerWithGenBudget(
  generator: Generator,
  genBudget: number,
  meshBudget: number,
): ChunkManager {
  const registry = new BlockRegistry();
  return new ChunkManager(
    generator,
    new GreedyMesher(registry),
    registry,
    new NullSink(),
    SEED,
    [],
    { viewDistance: 1, genBudget, meshBudget },
  );
}

// ---------------------------------------------------------------------------
// Regression: cross-chunk block light lost when the emitter's chunk meshes
// in the same frame as (after) a neighbor that already meshed this frame.
// The P2a `meshedThisFrame` dedup guard is correct for geometry/AO but must
// not suppress a relight when the newly-meshed chunk exports block light.
// ---------------------------------------------------------------------------

describe('ChunkManager cross-chunk block light (same-frame emitter ordering)', () => {
  it('propagates emitter light into a same-frame-meshed neighbor (update, production burst budget)', () => {
    // Lantern at chunk (1,0) local (1,40,8) -> world (17,40,8).
    const mgr = makeManager(new LanternWorld(1, 0, 1, 40, 8), BURST_MESH_BUDGET);
    // Drive update(0,0) repeatedly to full convergence with the production burst budget.
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);

    // World (15,40,8) is chunk (0,0) local (15,40,8) -- the east border, one step
    // across the seam from the lantern's chunk. Expected: 13 (emitter border export)
    // minus 1 across the seam = 12.
    expect(mgr.getBlockLight(15, 40, 8)).toBe(12);
  });

  it('matches the correct value when chunks mesh on separate frames (meshBudget=1 control)', () => {
    // Same world, but meshBudget=1 forces each chunk to mesh on its own frame, which
    // sidesteps the same-frame dedup path entirely -- this is the known-good baseline.
    const mgr = makeManager(new LanternWorld(1, 0, 1, 40, 8), 1);
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);
    expect(mgr.getBlockLight(15, 40, 8)).toBe(12);
  });

  it('propagates emitter light into a neighbor that meshed in an earlier frame (cross-frame ordering)', () => {
    // genBudget=1 forces chunk (0,0) [nearest, no emitter] to generate + mesh in an
    // earlier frame than chunk (1,0) [the emitter's chunk]. This is the case the
    // pre-mesh generate-batch light-settling pass CANNOT cover (the chunks were never
    // in the same settled batch) -- only the neighbor-remesh-on-emit path (P2b) fixes it.
    const mgr = makeManagerWithGenBudget(new LanternWorld(1, 0, 1, 40, 8), 1, BURST_MESH_BUDGET);
    for (let i = 0; i < 200; i++) mgr.update(0, 0);
    expect(mgr.streaming).toBe(false);
    expect(mgr.getBlockLight(15, 40, 8)).toBe(12);
  });
});

describe('ChunkManager.preloadBox cross-chunk block light', () => {
  it('propagates emitter light to a neighbor generated earlier in the box scan', () => {
    // preloadBox's generate loop runs cz outer, cx inner (ascending). Chunk (0,0) is
    // generated before chunk (1,0), so if light were computed inline per-chunk during
    // generation, the receiver (0,0) would be lit before the emitter in (1,0) exists.
    const mgr = makeManager(new LanternWorld(1, 0, 1, 40, 8), 64);
    const res = mgr.preloadBox(0, 0, 31, 15); // covers chunk (0,0) and (1,0)
    expect(res.generated).toBeGreaterThan(0);
    expect(mgr.getBlockLight(15, 40, 8)).toBe(12);
  });
});
