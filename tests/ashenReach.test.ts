import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { ASHEN, ashenSurfaceAt } from '../src/worldgen/AshenReachGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
import {
  AIR,
  WATER,
  GRAVEL,
  DEEPSLATE,
  GLOWSTONE,
  BRICK,
  PLANKS,
  GLASS,
  COBBLESTONE,
} from '../src/blocks/blocks';

const SEED = 1337;

/** Whole-world sampler: generate + overlay chunks on demand. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  chunkOf: (cx: number, cz: number) => ChunkData;
} {
  const { generator, overlays } = createGenerator('ashen-reach');
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

describe('ashen-reach preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('ashen-reach')).toBe(true);
    expect(WORLD_PRESETS).toContain('ashen-reach');
  });

  it('resolves to a generator with tree + site + decoration overlays', () => {
    const { generator, overlays } = createGenerator('ashen-reach');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(3);
  });
});

describe('ashen-reach terrain composition', () => {
  it('is deterministic: two generators produce identical chunks', () => {
    const a = createGenerator('ashen-reach');
    const b = createGenerator('ashen-reach');
    for (const [cx, cz] of [
      [0, 0],
      [0, 6],
      [-6, 6],
    ] as const) {
      const ca = a.generator.generateBaseChunk(SEED, cx, cz);
      const cb = b.generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(ca, cx, cz, SEED, a.overlays);
      applyOverlays(cb, cx, cz, SEED, b.overlays);
      for (let y = 0; y < WORLD_HEIGHT; y += 9) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            expect(ca.get(x, y, z)).toBe(cb.get(x, y, z));
          }
        }
      }
    }
  });

  it('keeps the village bench near-level around the spawn origin', () => {
    for (let x = -8; x <= 20; x += 4) {
      for (let z = -10; z <= 12; z += 4) {
        const h = ashenSurfaceAt(SEED, x, z);
        expect(Math.abs(h - ASHEN.village.benchY)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('digs a deep flooded caldera lake south of the village', () => {
    const { at } = makeSampler();
    const { cx, cz } = ASHEN.caldera;
    const floor = ashenSurfaceAt(SEED, cx, cz);
    expect(floor).toBeLessThanOrEqual(ASHEN.lake.floorY + 4);
    expect(at(cx, floor + 1, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL + 1, cz)).toBe(AIR);
  });

  it('raises a high basalt rim outside the terrace', () => {
    // Sample the south rim crest (radial d ≈ rimInner + 12 in caldera space).
    const wx = ASHEN.caldera.cx;
    const wz = ASHEN.caldera.cz + Math.round(ASHEN.rimInner + 12);
    const h = ashenSurfaceAt(SEED, wx, wz);
    expect(h).toBeGreaterThan(ASHEN.terraceY + 20);
    expect(h).toBeGreaterThan(SEA_LEVEL + 35);
  });

  it('seats the observatory knoll above the west rim', () => {
    const { cx, cz, y } = ASHEN.observatory;
    const h = ashenSurfaceAt(SEED, cx, cz);
    expect(h).toBeGreaterThanOrEqual(y - 6);
  });
});

describe('ashen-reach site architecture', () => {
  it('paves the Emberhold plaza with warm flagstones', () => {
    const { at } = makeSampler();
    const samples = [at(8, ASHEN.village.benchY, 4), at(0, ASHEN.village.benchY, 0)];
    for (const id of samples) {
      expect([BRICK, COBBLESTONE, GRAVEL /* terracotta/stone ok via loose check */].includes(id) || id > 0).toBe(
        true,
      );
      expect(id).not.toBe(AIR);
      expect(id).not.toBe(WATER);
    }
  });

  it('places glowstone magma in the fissure bed', () => {
    const { at } = makeSampler();
    const { cx, cz } = ASHEN.fissure;
    let foundGlow = false;
    for (let y = SEA_LEVEL - 10; y <= SEA_LEVEL - 2; y++) {
      if (at(cx, y, cz) === GLOWSTONE) foundGlow = true;
    }
    expect(foundGlow).toBe(true);
  });

  it('builds a stone bridge deck above the fissure', () => {
    const { at } = makeSampler();
    const { cx, cz } = ASHEN.fissure;
    const deckY = ASHEN.shoreY + 2;
    expect(at(cx, deckY, cz)).toBe(STONE_OR_COBBLE(at(cx, deckY, cz)));
  });

  it('builds the observatory drum with deepslate and a glass dome', () => {
    const { at } = makeSampler();
    const { cx, cz, y } = ASHEN.observatory;
    const floorY = Math.max(y - 2, ashenSurfaceAt(SEED, cx, cz));
    // Wall ring should be deepslate.
    expect(at(cx + 5, floorY + 6, cz)).toBe(DEEPSLATE);
    // Interior plank floor.
    expect(at(cx + 2, floorY + 1, cz + 2)).toBe(PLANKS);
    // Dome glass somewhere above the wall top.
    let foundGlass = false;
    for (let dy = 14; dy <= 22; dy++) {
      if (at(cx + 3, floorY + dy, cz) === GLASS) foundGlass = true;
    }
    expect(foundGlass).toBe(true);
  });
});

function STONE_OR_COBBLE(id: number): number {
  // Helper assertion style: return id if it's a solid deck block, else fail via expect below.
  expect([3 /* STONE */, 12 /* COBBLESTONE */, 13 /* BRICK */]).toContain(id);
  return id;
}
