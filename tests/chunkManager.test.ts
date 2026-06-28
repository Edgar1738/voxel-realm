import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { WORLD_HEIGHT } from '../src/core/constants';
import { voxelIndex } from '../src/core/coords';
import { WATER, AIR, STONE, LANTERN } from '../src/blocks/blocks';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

const SEED = 1337;

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

describe('ChunkManager.isSolid', () => {
  it('reports solid terrain, open sky, missing chunks, and the world floor', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64);
    settle(mgr, 0, 0);

    // y=0 is stone in the generated terrain.
    expect(mgr.isSolid(0, 0, 0)).toBe(true);
    // High above terrain is air.
    expect(mgr.isSolid(0, WORLD_HEIGHT - 1, 0)).toBe(false);
    // Below the world is solid (floor) so the player can't fall out.
    expect(mgr.isSolid(0, -1, 0)).toBe(true);
    // Above the world ceiling is air.
    expect(mgr.isSolid(0, WORLD_HEIGHT, 0)).toBe(false);
    // A far, unloaded chunk counts as solid.
    expect(mgr.isSolid(10000, 50, 10000)).toBe(true);
  });
});

/** Locate a water voxel deterministically from the same generator the manager uses. */
function findWater(): { cx: number; cz: number; wx: number; wy: number; wz: number } {
  const gen = createWorldGenerator();
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const c = gen.generateBaseChunk(SEED, cx, cz);
      for (let y = 0; y < WORLD_HEIGHT; y++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++)
            if (c.get(x, y, z) === WATER)
              return { cx, cz, wx: cx * 16 + x, wy: y, wz: cz * 16 + z };
    }
  }
  throw new Error('expected the generated world to contain water');
}

describe('ChunkManager.isWater', () => {
  it('reports loaded water voxels as water', () => {
    const { cx, cz, wx, wy, wz } = findWater();
    const sink = new FakeSink();
    const mgr = makeManager(sink, 0, 64, 64); // load just the target chunk
    settle(mgr, cx, cz, 3);
    expect(mgr.isWater(wx, wy, wz)).toBe(true);
  });

  it('reports sky, floor, out-of-range, and unloaded chunks as non-water', () => {
    const mgr = makeManager(new FakeSink(), 1, 64, 64);
    settle(mgr, 0, 0);
    expect(mgr.isWater(0, WORLD_HEIGHT - 1, 0)).toBe(false); // open sky
    expect(mgr.isWater(0, 0, 0)).toBe(false); // stone floor
    expect(mgr.isWater(0, -1, 0)).toBe(false); // below world
    expect(mgr.isWater(0, WORLD_HEIGHT, 0)).toBe(false); // above world
    expect(mgr.isWater(100000, 50, 0)).toBe(false); // unloaded chunk
  });
});

describe('ChunkManager editing', () => {
  it('getBlock returns terrain and AIR for unloaded/out-of-range', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3);
    expect(mgr.getBlock(0, 0, 0)).toBe(STONE); // world floor
    expect(mgr.getBlock(0, -1, 0)).toBe(AIR); // out of range
    expect(mgr.getBlock(100000, 50, 0)).toBe(AIR); // unloaded
  });

  it('applyEdits mutates the voxel, re-meshes the chunk, and records a delta from terrain', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 0, 64, 64);
    settle(mgr, 0, 0, 3);
    const beforeUploads = sink.uploads.get('0,0') ?? 0;

    const terrain = mgr.getBlock(1, 70, 1);
    const next = terrain === STONE ? AIR : STONE;
    const changes = mgr.applyEdits([{ x: 1, y: 70, z: 1, id: next }]);

    expect(changes).toEqual([{ x: 1, y: 70, z: 1, before: terrain, after: next }]);
    expect(mgr.getBlock(1, 70, 1)).toBe(next);
    expect(sink.uploads.get('0,0') ?? 0).toBeGreaterThan(beforeUploads); // re-meshed
    expect(mgr.getChunkDelta('0,0')).toEqual([[voxelIndex(1, 70, 1), next]]);
  });

  it('re-meshes a touched chunk exactly once per batch (no per-voxel storm)', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 0, 64, 64);
    settle(mgr, 0, 0, 3);
    const beforeUploads = sink.uploads.get('0,0') ?? 0;

    // Several interior voxels in chunk (0,0); none on a border.
    mgr.applyEdits([
      { x: 5, y: 70, z: 5, id: STONE },
      { x: 6, y: 70, z: 5, id: STONE },
      { x: 7, y: 71, z: 6, id: STONE },
      { x: 8, y: 72, z: 7, id: STONE },
    ]);

    expect((sink.uploads.get('0,0') ?? 0) - beforeUploads).toBe(1); // one remesh for the batch
  });

  it('clears a delta when a voxel is reverted to its terrain value', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3);
    const terrain = mgr.getBlock(1, 70, 1);
    const next = terrain === STONE ? AIR : STONE;

    mgr.applyEdits([{ x: 1, y: 70, z: 1, id: next }]);
    expect(mgr.getChunkDelta('0,0')).toHaveLength(1);

    mgr.applyEdits([{ x: 1, y: 70, z: 1, id: terrain }]); // back to terrain
    expect(mgr.getChunkDelta('0,0')).toHaveLength(0);
  });

  it('re-meshes the touched border neighbor exactly once', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64); // 3x3 so neighbors exist
    settle(mgr, 0, 0);
    const beforeWest = sink.uploads.get('-1,0') ?? 0;
    mgr.applyEdits([{ x: 0, y: 70, z: 1, id: STONE }]); // local x=0 -> west border
    expect((sink.uploads.get('-1,0') ?? 0) - beforeWest).toBe(1);
  });

  it('re-applies in-memory deltas after a chunk unloads and reloads', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3);
    const terrain = mgr.getBlock(1, 70, 1);
    const next = terrain === STONE ? AIR : STONE;
    mgr.applyEdits([{ x: 1, y: 70, z: 1, id: next }]);

    settle(mgr, 1000, 1000, 3); // unload chunk (0,0)
    expect(mgr.getBlock(1, 70, 1)).toBe(AIR); // unloaded reads as air

    settle(mgr, 0, 0, 3); // reload chunk (0,0)
    expect(mgr.getBlock(1, 70, 1)).toBe(next); // delta re-applied on regeneration
  });

  it('applies saved deltas when a chunk is generated', () => {
    const sink = new FakeSink();
    const registry = new BlockRegistry();
    const mgr = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      [],
      { viewDistance: 0, genBudget: 64, meshBudget: 64 },
      new Map([['0,0', new Map([[voxelIndex(1, 70, 1), STONE]])]]),
    );
    settle(mgr, 0, 0, 3);
    expect(mgr.getBlock(1, 70, 1)).toBe(STONE);
    expect(mgr.getChunkDelta('0,0')).toEqual([[voxelIndex(1, 70, 1), STONE]]);
  });

  it('refuses edits into unloaded chunks', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3);
    expect(mgr.applyEdits([{ x: 100000, y: 70, z: 100000, id: STONE }])).toEqual([]);
  });

  it('canApply is true for loaded in-range voxels and false otherwise', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3);
    expect(mgr.canApply([{ x: 1, y: 70, z: 1 }])).toBe(true);
    expect(mgr.canApply([{ x: 100000, y: 70, z: 100000 }])).toBe(false); // unloaded chunk
    expect(mgr.canApply([{ x: 1, y: -1, z: 1 }])).toBe(false); // out of world
    expect(
      mgr.canApply([
        { x: 1, y: 70, z: 1 },
        { x: 100000, y: 70, z: 100000 },
      ]),
    ).toBe(false); // any unloaded voxel blocks the batch
  });
});

describe('ChunkManager.preload / isLoaded', () => {
  it('loadedChunkCount includes generated chunks even before they are meshed', () => {
    const mgr = makeManager(new FakeSink(), 1, 64, 0); // generate all 3x3 chunks, mesh none
    mgr.update(0, 0);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('isLoaded reflects whether the covering chunk is streamed in', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    settle(mgr, 0, 0, 3); // viewDistance 0: loads the center chunk only
    expect(mgr.isLoaded(8, 8)).toBe(true);
    expect(mgr.isLoaded(100000, 0)).toBe(false);
  });

  it('preload generates + meshes a region on demand, bypassing view distance and budget', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 0, 64, 64); // viewDistance 0: update alone never loads neighbors
    const result = mgr.preload(0, 0, 1); // 3x3 chunks around (0,0)
    expect(result.generated).toBe(9);
    expect(result.meshed).toBe(9);
    expect(sink.uploads.has('1,0')).toBe(true);
    // A chunk update() (with viewDistance 0) would never reach is now loaded + editable.
    expect(mgr.isLoaded(20, 5)).toBe(true); // world (20,5) -> chunk (1,0)
    expect(mgr.getBlock(20, 0, 5)).toBe(STONE); // world floor
    const cur = mgr.getBlock(20, 70, 5);
    const next = cur === STONE ? AIR : STONE;
    expect(mgr.applyEdits([{ x: 20, y: 70, z: 5, id: next }])).toHaveLength(1);
  });

  it('preload skips already-loaded chunks', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    expect(mgr.preload(0, 0, 0).generated).toBe(1); // chunk (0,0)
    expect(mgr.preload(0, 0, 0).generated).toBe(0); // already present
  });
});

// ---------------------------------------------------------------------------
// Cross-chunk block light propagation
// ---------------------------------------------------------------------------

describe('ChunkManager cross-chunk block light', () => {
  /**
   * Helper that creates a manager with two adjacent chunks loaded, clears a path at the
   * given y so there are no opaque blocks along the route, places a LANTERN at the
   * east border of chunk (0,0), and returns the manager.
   *
   * Chunk (0,0) covers world X in [0,15]; chunk (1,0) covers world X in [16,31].
   * The LANTERN is placed at world (15, testY, 8) — local (15,70,8) in chunk (0,0),
   * which is the east border face. The east neighbor (1,0) should pick up the crossing
   * light on its west border face at world (16, testY, 8).
   */
  const testY = 150; // well above the terrain surface to avoid opaque blocks

  it('block light from an emitter at a chunk border appears in the neighbor chunk', () => {
    const sink = new FakeSink();
    // Load chunk (0,0) and its east neighbor (1,0) via preload.
    const mgr = makeManager(sink, 0, 64, 64);
    mgr.preload(0, 0, 1); // 3×3 = 9 chunks; this loads both (0,0) and (1,0)

    // Verify the neighbor border cell at testY is currently AIR (no block, no block light).
    expect(mgr.getBlock(16, testY, 8)).toBe(AIR);
    // Before placing the lantern, block light at the neighbor border should be 0
    // (no emitters near the border at this height in generated terrain).
    expect(mgr.getBlockLight(16, testY, 8)).toBe(0);

    // Place the LANTERN at the east border of chunk (0,0).
    mgr.applyEdits([{ x: 15, y: testY, z: 8, id: LANTERN }]);

    // The lantern (emission 14) is at world x=15 (east border of chunk 0,0).
    // After the border-seed pass:
    //   - chunk (0,0) east face at (15, testY, 8) has block light 14 (the lantern itself)
    //   - chunk (1,0) west border seed: arriving = 14 - 1 = 13 at world (16, testY, 8)
    // The neighbor chunk must now have block light > 0 at the border.
    expect(mgr.getBlockLight(16, testY, 8)).toBeGreaterThan(0);
    // More precisely it should be 13 (one step from the lantern across the border).
    expect(mgr.getBlockLight(16, testY, 8)).toBe(13);
    // One step further in should be 12.
    expect(mgr.getBlockLight(17, testY, 8)).toBe(12);
  });

  it('removing the lantern removes the cross-chunk light', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 0, 64, 64);
    mgr.preload(0, 0, 1);

    // Place lantern, verify light crosses.
    mgr.applyEdits([{ x: 15, y: testY, z: 8, id: LANTERN }]);
    expect(mgr.getBlockLight(16, testY, 8)).toBeGreaterThan(0);

    // Remove lantern — light should disappear from the neighbor chunk.
    mgr.applyEdits([{ x: 15, y: testY, z: 8, id: AIR }]);
    expect(mgr.getBlockLight(16, testY, 8)).toBe(0);
  });

  it('a chunk with no emitters near the border has zero cross-chunk block light contribution', () => {
    // The interior of the generated terrain at testY is AIR.
    // No emitters anywhere, so neighbor block light at the border should be 0.
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    mgr.preload(0, 0, 1);
    // Verify there is no lantern or emissive block influencing the border at testY.
    // (Generated terrain never places LANTERNs at testY=150.)
    expect(mgr.getBlockLight(16, testY, 8)).toBe(0);
  });

  it('block light does not cross a sealed opaque wall at the chunk border', () => {
    const mgr = makeManager(new FakeSink(), 0, 64, 64);
    mgr.preload(0, 0, 1);

    // Fill the entire east border column of chunk (0,0) — all y, all z — with
    // opaque STONE, creating a floor-to-ceiling wall. Then place the lantern
    // just inside. With a complete vertical wall, light cannot wrap around the
    // wall through above/below, and the neighbor should receive 0 block light.
    const edits: { x: number; y: number; z: number; id: number }[] = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < 16; z++) {
        edits.push({ x: 15, y, z, id: STONE }); // full-height opaque wall on the border
      }
    }
    edits.push({ x: 14, y: testY, z: 8, id: LANTERN }); // lantern just behind the wall
    mgr.applyEdits(edits);

    // The floor-to-ceiling opaque wall at x=15 blocks all border light.
    expect(mgr.getBlockLight(16, testY, 8)).toBe(0);
  });
});
