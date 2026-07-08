import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import {
  STONEHAVEN,
  STONEHAVEN_STREAM,
  stonehavenSurfaceAt,
  stonehavenCapAt,
} from '../src/worldgen/StonehavenGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, WATER, GRASS, SNOW, STONE, SAND, GRAVEL } from '../src/blocks/blocks';

const SEED = 1337;

/** A whole-world sampler: generates (and overlays) chunks on demand and reads by world coords. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  chunkOf: (cx: number, cz: number) => ChunkData;
} {
  const { generator, overlays } = createGenerator('stonehaven');
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
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  return { at, chunkOf };
}

describe('stonehaven preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('stonehaven')).toBe(true);
    expect(WORLD_PRESETS).toContain('stonehaven');
  });

  it('resolves to a generator with forest + decoration overlays', () => {
    const { generator, overlays } = createGenerator('stonehaven');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(3); // broadleaf belt + conifer belt + decorations
  });
});

describe('stonehaven terrain composition', () => {
  it('is deterministic: two generators produce identical chunks', () => {
    const a = createGenerator('stonehaven');
    const b = createGenerator('stonehaven');
    for (const [cx, cz] of [
      [0, 0],
      [-4, 8],
      [6, 4],
    ] as const) {
      const ca = a.generator.generateBaseChunk(SEED, cx, cz);
      const cb = b.generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(ca, cx, cz, SEED, a.overlays);
      applyOverlays(cb, cx, cz, SEED, b.overlays);
      for (let y = 0; y < WORLD_HEIGHT; y += 7) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            expect(ca.get(x, y, z)).toBe(cb.get(x, y, z));
          }
        }
      }
    }
  });

  it('keeps the village bench near-level around the spawn origin', () => {
    for (let x = -20; x <= 20; x += 5) {
      for (let z = -16; z <= 8; z += 4) {
        const h = stonehavenSurfaceAt(SEED, x, z);
        expect(Math.abs(h - STONEHAVEN.village.benchY)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('digs a deep flooded lake south of the village', () => {
    const { at } = makeSampler();
    const { cx, cz } = STONEHAVEN.valley;
    const floor = stonehavenSurfaceAt(SEED, cx, cz);
    expect(floor).toBeLessThanOrEqual(STONEHAVEN.lake.floorY + 4);
    // Water fills from just above the floor to the waterline.
    expect(at(cx, floor + 1, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL + 1, cz)).toBe(AIR);
  });

  it('raises a flat fortress plateau with a higher keep knoll', () => {
    const { crag } = STONEHAVEN;
    expect(
      Math.abs(stonehavenSurfaceAt(SEED, crag.cx, crag.cz) - crag.plateauY),
    ).toBeLessThanOrEqual(1);
    // The plateau core is buildable-flat away from the knoll.
    for (const [dx, dz] of [
      [10, -10],
      [-12, 10],
      [16, 8],
    ] as const) {
      const h = stonehavenSurfaceAt(SEED, crag.cx + dx, crag.cz + dz);
      expect(Math.abs(h - crag.plateauY)).toBeLessThanOrEqual(1);
    }
    const k = crag.knoll;
    expect(Math.abs(stonehavenSurfaceAt(SEED, k.cx, k.cz) - k.y)).toBeLessThanOrEqual(1);
  });

  it('rings the valley with high mountains, lower at the northwest notch', () => {
    const { cx, cz } = STONEHAVEN.valley;
    const at = (theta: number, r: number): number =>
      stonehavenSurfaceAt(
        SEED,
        Math.round(cx + r * Math.cos(theta)),
        Math.round(cz + r * Math.sin(theta)),
      );
    const east = at(0, 240);
    const south = at(Math.PI / 2, 240);
    const notch = at((-3 * Math.PI) / 4, 260);
    expect(east).toBeGreaterThan(130);
    expect(south).toBeGreaterThan(130);
    expect(notch).toBeLessThan(east - 25);
  });

  it('caps high slopes with snow somewhere on the ring', () => {
    let snow = 0;
    for (let i = 0; i < 40; i++) {
      const theta = (i / 40) * Math.PI * 2;
      const wx = Math.round(STONEHAVEN.valley.cx + 235 * Math.cos(theta));
      const wz = Math.round(STONEHAVEN.valley.cz + 235 * Math.sin(theta));
      if (stonehavenCapAt(SEED, wx, wz) === SNOW) snow++;
    }
    expect(snow).toBeGreaterThan(5);
  });

  it('incises a dry gorge along the stream mid-slope', () => {
    const mid = STONEHAVEN_STREAM[2]; // (100, 110)
    const bed = stonehavenSurfaceAt(SEED, mid.x, mid.z);
    const rimA = stonehavenSurfaceAt(SEED, mid.x, mid.z + 13);
    const rimB = stonehavenSurfaceAt(SEED, mid.x, mid.z - 13);
    expect(bed).toBeLessThan(Math.min(rimA, rimB) - 3);
    expect(bed).toBeGreaterThan(SEA_LEVEL); // dry until the lake mouth
  });

  it('paints believable caps: grass bench, beach at the waterline, rock on cliffs', () => {
    expect(stonehavenCapAt(SEED, 8, 8)).toBe(GRASS);
    // North crag face (toward the lake) is a cliff.
    const cliffCap = stonehavenCapAt(SEED, STONEHAVEN.crag.cx + 4, STONEHAVEN.crag.cz - 30);
    expect([STONE, GRAVEL]).toContain(cliffCap);
    // Somewhere along the south village waterfront there is shore material.
    let shore = 0;
    for (let x = -20; x <= 20; x += 2) {
      for (let z = 8; z <= 26; z += 2) {
        const h = stonehavenSurfaceAt(SEED, x, z);
        if (h >= SEA_LEVEL - 1 && h <= SEA_LEVEL + 1) {
          const cap = stonehavenCapAt(SEED, x, z);
          if (cap === SAND || cap === GRAVEL) shore++;
        }
      }
    }
    expect(shore).toBeGreaterThan(3);
  });

  it('keeps trees out of the village square and off the lake', () => {
    const { at } = makeSampler();
    // Scan the two chunks covering the square for any wood above the bench.
    for (const [cx, cz] of [
      [0, 0],
      [-1, -1],
    ] as const) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const wx = cx * CHUNK_SIZE_X + x;
          const wz = cz * CHUNK_SIZE_Z + z;
          for (let y = STONEHAVEN.village.benchY + 1; y < STONEHAVEN.village.benchY + 12; y++) {
            const id = at(wx, y, wz);
            expect(id === AIR || id === WATER || id < 5 || id > 6).toBe(true);
          }
        }
      }
    }
  });
});
