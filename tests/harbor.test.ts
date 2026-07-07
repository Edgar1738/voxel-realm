import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { HARBOR, harborSurfaceAt } from '../src/worldgen/HarborGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { packState, FACING } from '../src/world/VoxelState';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import {
  AIR,
  WATER,
  STONE,
  COBBLESTONE,
  GRAVEL,
  PLANKS,
  DEEPSLATE,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  STONEBRICK_WALL,
  STAIRS_BRICK,
  BLOCK_DEFS,
} from '../src/blocks/blocks';
import { WORLD_HEIGHT } from '../src/core/constants';

const SEED = 1337;
const QY = HARBOR.quayY;

/** A whole-world sampler: generates (and overlays) chunks on demand and reads by world coords. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  stateAt: (wx: number, wy: number, wz: number) => number;
  chunkOf: (cx: number, cz: number) => ChunkData;
} {
  const { generator, overlays } = createGenerator('harbor');
  const cache = new Map<string, ChunkData>();
  const chunkOf = (cx: number, cz: number): ChunkData => {
    const key = `${cx},${cz}`;
    let c = cache.get(key);
    if (!c) {
      c = generator.generateBaseChunk(seed, cx, cz);
      applyOverlays(c, cx, cz, seed, overlays);
      cache.set(key, c);
    }
    return c;
  };
  const local = (wx: number, wz: number): [number, number, number, number] => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return [cx, cz, wx - cx * CHUNK_SIZE_X, wz - cz * CHUNK_SIZE_Z];
  };
  const at = (wx: number, wy: number, wz: number): number => {
    const [cx, cz, lx, lz] = local(wx, wz);
    return chunkOf(cx, cz).get(lx, wy, lz);
  };
  const stateAt = (wx: number, wy: number, wz: number): number => {
    const [cx, cz, lx, lz] = local(wx, wz);
    return chunkOf(cx, cz).getState(lx, wy, lz);
  };
  return { at, stateAt, chunkOf };
}

describe('harbor preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('harbor')).toBe(true);
    expect(WORLD_PRESETS).toContain('harbor');
  });

  it('resolves to a generator with the tree + site overlays', () => {
    const { generator, overlays } = createGenerator('harbor');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(2);
  });
});

describe('harbor terrain (coast + hill)', () => {
  it('keeps a flat waterfront bench at quay level around the origin', () => {
    expect(harborSurfaceAt(SEED, 0, 0)).toBe(QY);
    expect(harborSurfaceAt(SEED, 10, -12)).toBe(QY);
  });

  it('opens to an ever-deeper sea east of the shore', () => {
    expect(harborSurfaceAt(SEED, 45, 0)).toBeLessThan(SEA_LEVEL);
    // deeper the farther offshore you go (within the shelf, before the depth clamp)
    expect(harborSurfaceAt(SEED, 40, 8)).toBeLessThan(harborSurfaceAt(SEED, 28, 8));
  });

  it('rises inland into a hillside for the terraced town', () => {
    expect(harborSurfaceAt(SEED, -60, 0)).toBeGreaterThan(harborSurfaceAt(SEED, -20, 0));
    expect(harborSurfaceAt(SEED, -20, 0)).toBeGreaterThan(QY);
  });

  it('is deterministic in (seed, x, z)', () => {
    expect(harborSurfaceAt(SEED, -33, 21)).toBe(harborSurfaceAt(SEED, -33, 21));
  });

  it('floods the offshore basin with water over a sand floor', () => {
    const { at } = makeSampler();
    expect(at(48, 60, 24)).toBe(WATER); // open sea well offshore
    expect(at(48, 63, 24)).toBe(AIR); // air just above the sea surface
  });
});

describe('harbor landmarks', () => {
  const { at, stateAt } = makeSampler();

  it('paves the plaza and leaves the spawn column clear to descend onto', () => {
    expect([COBBLESTONE, STONE, GRAVEL]).toContain(at(8, QY, 8)); // paved quay under spawn
    expect(at(8, QY + 2, 8)).toBe(AIR); // clear air above the plaza (spawn drops in here)
    expect(at(8, 99, 8)).toBe(AIR);
  });

  it('rings the basin with a solid stone quay wall and a battlemented parapet', () => {
    expect(at(32, 60, 10)).toBe(STONE); // east wall body, down at the waterline
    expect(at(32, QY + 1, 10)).toBe(STONEBRICK_WALL); // parapet along the walk
    expect(at(24, 62, 0)).toBe(WATER); // protected water inside the basin
  });

  it('runs a planked pier on the water with fenced rails', () => {
    expect(at(26, QY, 4)).toBe(PLANKS); // pier deck over the basin
    expect(at(25, QY + 1, 3)).toBe(OAK_FENCE); // rail along the deck edge
  });

  it('roofs a waterfront house with correctly-oriented stairs and hangs a lantern', () => {
    // House A east eave: brick stairs facing east (open riser toward +x, high back toward the ridge).
    expect(at(13, 67, -23)).toBe(STAIRS_BRICK);
    expect(stateAt(13, 67, -23)).toBe(packState(FACING.E, 0));
    expect(at(11, 66, -21)).toBe(LANTERN); // lantern under the eaves inside
  });

  it('raises the tiered landmark with a slate roof and a rooftop beacon', () => {
    expect(at(2, 72, 28)).toBe(DEEPSLATE); // a slate roof corner on the lowest tier
    let beacon = false;
    for (let y = QY; y < WORLD_HEIGHT; y++) if (at(8, y, 34) === GLOWSTONE) beacon = true;
    expect(beacon).toBe(true); // a glowstone beacon crowns the tower's central column
  });
});

describe('harbor determinism + validity', () => {
  it('produces byte-identical chunks (blocks + orientation state) for a fixed seed', () => {
    const { generator, overlays } = createGenerator('harbor');
    const build = (cx: number, cz: number): ChunkData => {
      const c = generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(c, cx, cz, SEED, overlays);
      return c;
    };
    for (const [cx, cz] of [
      [0, 0],
      [-2, 1],
      [1, -1],
    ]) {
      const a = build(cx, cz);
      const b = build(cx, cz);
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
      expect(Array.from(a.state)).toEqual(Array.from(b.state));
    }
  });

  it('never emits an invalid block id across the whole town footprint', () => {
    const { chunkOf } = makeSampler();
    const maxValidId = BLOCK_DEFS.length - 1;
    let worstId = 0;
    let scanned = 0;
    for (let cx = -4; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const data = chunkOf(cx, cz).data; // generation must not throw on any site chunk
        for (let i = 0; i < data.length; i++) {
          if (data[i] > worstId) worstId = data[i];
          scanned++;
        }
      }
    }
    expect(scanned).toBeGreaterThan(0);
    expect(worstId).toBeLessThanOrEqual(maxValidId);
  });
});
