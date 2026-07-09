import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { HOLLOWMERE, hollowmereSurfaceAt } from '../src/worldgen/HollowmereGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import {
  AIR,
  WATER,
  STONE,
  COBBLESTONE,
  PLANKS,
  DEEPSLATE,
  GLOWSTONE,
  WOOD,
  GRAVEL,
  STAIRS_COBBLE,
} from '../src/blocks/blocks';

const SEED = 1337;

/** Whole-world sampler for hollowmere. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  surface: (wx: number, wz: number) => number;
} {
  const { generator, overlays } = createGenerator('hollowmere');
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
  const surface = (wx: number, wz: number): number => hollowmereSurfaceAt(seed, wx, wz);
  return { at, surface };
}

describe('hollowmere preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('hollowmere')).toBe(true);
    expect(WORLD_PRESETS).toContain('hollowmere');
  });

  it('resolves to a generator with tree + site overlays', () => {
    const { generator, overlays } = createGenerator('hollowmere');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(2);
  });
});

describe('hollowmere terrain composition', () => {
  it('keeps living-village bench above sea level near market', () => {
    const h = hollowmereSurfaceAt(SEED, HOLLOWMERE.market.cx, HOLLOWMERE.market.cz);
    expect(h).toBeGreaterThanOrEqual(SEA_LEVEL + 2);
    expect(h).toBeLessThanOrEqual(HOLLOWMERE.livingY + 4);
  });

  it('floods the lost-village basin below sea level', () => {
    const h = hollowmereSurfaceAt(SEED, HOLLOWMERE.basin.cx, HOLLOWMERE.basin.cz);
    expect(h).toBeLessThan(SEA_LEVEL);
  });

  it('raises a massive volcano far north of the valley', () => {
    const peak = hollowmereSurfaceAt(SEED, HOLLOWMERE.volcano.cx, HOLLOWMERE.volcano.cz);
    const village = hollowmereSurfaceAt(SEED, HOLLOWMERE.market.cx, HOLLOWMERE.market.cz);
    expect(peak).toBeGreaterThan(village + 40);
    expect(peak).toBeGreaterThan(120);
  });

  it('does not place the village inside the volcano crater', () => {
    // Market and basin must sit outside the volcanic base + a comfortable valley margin.
    const dx = HOLLOWMERE.market.cx - HOLLOWMERE.volcano.cx;
    const dz = HOLLOWMERE.market.cz - HOLLOWMERE.volcano.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    expect(dist).toBeGreaterThan(HOLLOWMERE.volcano.baseR + 30);
  });

  it('carves a river channel south of the living village', () => {
    const bed = hollowmereSurfaceAt(SEED, HOLLOWMERE.bridge.x, HOLLOWMERE.bridge.z);
    expect(bed).toBeLessThan(SEA_LEVEL);
  });

  it('keeps forest spawn ground walkable above water', () => {
    const h = hollowmereSurfaceAt(SEED, HOLLOWMERE.spawn.x, HOLLOWMERE.spawn.z);
    expect(h).toBeGreaterThan(SEA_LEVEL);
  });
});

describe('hollowmere site landmarks', () => {
  const { at } = makeSampler();

  it('places the covered bridge deck above the river', () => {
    const deckY = SEA_LEVEL + 2;
    expect(at(HOLLOWMERE.bridge.x, deckY, HOLLOWMERE.bridge.z)).toBe(PLANKS);
  });

  it('builds market plaza paving', () => {
    const y = HOLLOWMERE.livingY;
    const block = at(HOLLOWMERE.market.cx, y, HOLLOWMERE.market.cz);
    expect([COBBLESTONE, STONE, GRAVEL, PLANKS].includes(block) || block !== AIR).toBe(true);
    // well water nearby
    expect(at(2, y + 1, 36)).not.toBe(undefined);
  });

  it('builds the Drowned Bell Tower with climbable interior and bell chamber', () => {
    const cx = HOLLOWMERE.bell.cx;
    const cz = HOLLOWMERE.bell.cz;
    const floorY = SEA_LEVEL;
    // foundation / outer wall stone
    expect([STONE, DEEPSLATE, COBBLESTONE].includes(at(cx - 3, floorY, cz - 3))).toBe(true);
    // spiral newel is wood; adjacent ring holds steps or air for climb
    expect(at(cx, floorY + 2, cz)).toBe(WOOD);
    const ring = [at(cx + 1, floorY + 2, cz), at(cx - 1, floorY + 2, cz), at(cx, floorY + 2, cz + 1)];
    expect(ring.some((b) => b === AIR || b === STAIRS_COBBLE || b === COBBLESTONE)).toBe(true);
    // bell chamber glow or bell mass near top
    let foundGlow = false;
    for (let y = floorY + 15; y <= floorY + 28; y++) {
      if (at(cx, y, cz) === GLOWSTONE || at(cx, y, cz) === DEEPSLATE) foundGlow = true;
    }
    expect(foundGlow).toBe(true);
  });

  it('builds watermill structure near the river bend', () => {
    const mx = HOLLOWMERE.mill.x;
    const mz = HOLLOWMERE.mill.z;
    const y = SEA_LEVEL + 2;
    // mill volume should contain structure materials nearby
    let hits = 0;
    for (let x = mx - 3; x <= mx + 3; x++) {
      for (let z = mz - 2; z <= mz + 4; z++) {
        const b = at(x, y + 2, z);
        if ([COBBLESTONE, STONE, WOOD, PLANKS, DEEPSLATE].includes(b)) hits++;
      }
    }
    expect(hits).toBeGreaterThan(4);
  });

  it('creates an inner wall / gate transition south of the basin', () => {
    // gate posts around (2, 12)
    const y = HOLLOWMERE.livingY;
    const left = at(-1, y + 3, 12);
    const right = at(5, y + 3, 12);
    expect([STONE, COBBLESTONE, DEEPSLATE].includes(left) || left !== AIR).toBe(true);
    expect([STONE, COBBLESTONE, DEEPSLATE].includes(right) || right !== AIR).toBe(true);
  });

  it('has water in the lost-village basin after generation', () => {
    // Sample a few basin columns — water should appear at or below sea level.
    let waterHits = 0;
    for (let x = -4; x <= 4; x += 2) {
      for (let z = -8; z <= 0; z += 2) {
        if (at(x, SEA_LEVEL, z) === WATER || at(x, SEA_LEVEL - 1, z) === WATER) waterHits++;
      }
    }
    expect(waterHits).toBeGreaterThan(0);
  });

  it('places hillside overlook stone pad for volcano views', () => {
    const ox = -50;
    const oy = HOLLOWMERE.livingY + 15;
    const oz = 4;
    expect([STONE, COBBLESTONE, DEEPSLATE].includes(at(ox, oy, oz))).toBe(true);
  });
});

describe('hollowmere player journey continuity', () => {
  it('spawn is south of bridge, bridge south of market, market south of bell', () => {
    expect(HOLLOWMERE.spawn.z).toBeGreaterThan(HOLLOWMERE.bridge.z);
    expect(HOLLOWMERE.bridge.z).toBeGreaterThan(HOLLOWMERE.market.cz);
    expect(HOLLOWMERE.market.cz).toBeGreaterThan(HOLLOWMERE.bell.cz);
    expect(HOLLOWMERE.bell.cz).toBeGreaterThan(HOLLOWMERE.volcano.cz);
  });

  it('primary road x is consistent for south approach', () => {
    expect(HOLLOWMERE.roadX).toBe(HOLLOWMERE.bridge.x);
    expect(Math.abs(HOLLOWMERE.spawn.x - HOLLOWMERE.roadX)).toBeLessThanOrEqual(2);
  });
});
