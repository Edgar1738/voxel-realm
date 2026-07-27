import { describe, it, expect } from 'vitest';
import { SurfacePainter, surfaceCap, patchedCap } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import {
  AIR,
  GRASS,
  DIRT,
  STONE,
  SAND,
  SNOW,
  MUD,
  PEAT,
  CLAY,
  DRY_GRASS,
  FOREST_FLOOR,
  MOSS,
  BLUE_ICE,
} from '../src/blocks/blocks';
import { Biome, type BiomeSource } from '../src/worldgen/BiomeMap';
import type { GenContext } from '../src/worldgen/TerrainStage';

function source(biome: Biome): BiomeSource {
  return { biomeAt: () => biome, blendedTerrain: () => ({ amplitude: 8, baseOffset: 0 }) };
}

/** Context with constant height and a forced biome. */
function ctx(height: number, biome: Biome): GenContext {
  return {
    seed: 1,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(height),
    seaLevel: SEA_LEVEL,
    biomes: source(biome),
  };
}

const stage = new SurfacePainter();

describe('SurfacePainter biome caps', () => {
  it('caps plains with grass on a dirt band over stone, air above', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Plains));
    expect(chunk.get(0, top, 0)).toBe(GRASS);
    expect(chunk.get(0, top - 1, 0)).toBe(DIRT);
    expect(chunk.get(0, top - 3, 0)).toBe(DIRT);
    expect(chunk.get(0, top - 4, 0)).toBe(STONE);
    expect(chunk.get(0, 0, 0)).toBe(STONE);
    expect(chunk.get(0, top + 1, 0)).toBe(AIR);
  });

  it('caps desert columns with sand', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Desert));
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, top - 1, 0)).toBe(SAND);
  });

  it('caps tundra columns with snow over a dirt band', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Tundra));
    expect(chunk.get(0, top, 0)).toBe(SNOW);
    expect(chunk.get(0, top - 1, 0)).toBe(DIRT);
  });

  it('caps any high-altitude column with snow regardless of biome', () => {
    const top = 120; // above the snow line
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Plains));
    expect(chunk.get(0, top, 0)).toBe(SNOW);
  });

  it('caps columns at/below sea level with sand (beaches win over biome)', () => {
    const top = SEA_LEVEL;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Plains));
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, 0, 0)).toBe(STONE);
  });

  it('freezes tundra shorelines into blue-ice rims (with sand gaps)', () => {
    const top = SEA_LEVEL;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Tundra));
    const caps = new Set<number>();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) caps.add(chunk.get(x, top, z));
    expect(caps.has(BLUE_ICE)).toBe(true);
    for (const id of caps) expect([SAND, BLUE_ICE]).toContain(id);
  });

  it('caps a non-beach swamp column with mud (or a deterministic peat patch)', () => {
    const top = SEA_LEVEL + 5; // well above beach threshold (seaLevel+1)
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Swamp));
    const cap = chunk.get(0, top, 0);
    expect([MUD, PEAT]).toContain(cap);
    // Whichever the patch rule picked, the band continues the same bog material below.
    expect(chunk.get(0, top - 1, 0)).toBe(cap);
  });
});

describe('patchedCap (meso-scale ecological patches)', () => {
  const climateSource = (biome: Biome, t: number, h: number): BiomeSource => ({
    biomeAt: () => biome,
    blendedTerrain: () => ({ amplitude: 8, baseOffset: 0 }),
    climateAt: () => ({ t, h, m: 0 }),
  });
  const ctxWith = (biomes: BiomeSource): GenContext => ({
    seed: 1,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(70),
    seaLevel: SEA_LEVEL,
    biomes,
  });

  it('is deterministic and swaps grass only for its own patch materials', () => {
    const c = ctxWith(climateSource(Biome.Plains, 0.6, -0.4));
    const seen = new Set<number>();
    for (let x = 0; x < 64; x++) {
      for (let z = 0; z < 64; z++) {
        const a = patchedCap(GRASS, x, z, 70, Biome.Plains, c);
        const b = patchedCap(GRASS, x, z, 70, Biome.Plains, c);
        expect(b).toBe(a);
        seen.add(a);
      }
    }
    for (const id of seen) expect([GRASS, DRY_GRASS]).toContain(id);
    expect(seen.has(DRY_GRASS)).toBe(true); // hot+dry plains actually produce patches
  });

  it('litters forest grass with forest-floor patches', () => {
    const c = ctxWith(climateSource(Biome.Forest, 0, 0.4));
    const seen = new Set<number>();
    for (let x = 0; x < 64; x++)
      for (let z = 0; z < 64; z++) seen.add(patchedCap(GRASS, x, z, 70, Biome.Forest, c));
    expect(seen.has(FOREST_FLOOR)).toBe(true);
    for (const id of seen) expect([GRASS, FOREST_FLOOR, MOSS]).toContain(id);
  });

  it('deposits clay only in beach shallows and peat only on mud', () => {
    const c = ctxWith(climateSource(Biome.Plains, 0, 0));
    const beach = new Set<number>();
    for (let x = 0; x < 64; x++)
      for (let z = 0; z < 64; z++) beach.add(patchedCap(SAND, x, z, SEA_LEVEL, Biome.Plains, c));
    expect(beach.has(CLAY)).toBe(true);
    // Desert sand well above the waterline is never clay-patched.
    expect(patchedCap(SAND, 5, 5, 90, Biome.Desert, c)).toBe(SAND);
    const bog = new Set<number>();
    for (let x = 0; x < 64; x++)
      for (let z = 0; z < 64; z++) bog.add(patchedCap(MUD, x, z, 66, Biome.Swamp, c));
    expect(bog.has(PEAT)).toBe(true);
    for (const id of bog) expect([MUD, PEAT]).toContain(id);
  });

  it('leaves grass un-patched when the source has no climate channel (custom presets)', () => {
    const noClimate = ctxWith(source(Biome.Plains));
    for (let x = 0; x < 32; x++) {
      expect(patchedCap(GRASS, x, 7, 70, Biome.Plains, noClimate)).toBe(GRASS);
    }
  });
});

describe('surfaceCap (shared cap rule)', () => {
  it('grass on a mid-altitude plains column', () => {
    expect(surfaceCap(70, Biome.Plains, SEA_LEVEL)).toBe(GRASS);
  });

  it('sand at or below the beach line, whatever the biome', () => {
    expect(surfaceCap(SEA_LEVEL + 1, Biome.Tundra, SEA_LEVEL)).toBe(SAND);
    expect(surfaceCap(SEA_LEVEL, Biome.Plains, SEA_LEVEL)).toBe(SAND);
  });

  it('snow for tundra and for anything above the snow line', () => {
    expect(surfaceCap(70, Biome.Tundra, SEA_LEVEL)).toBe(SNOW);
    expect(surfaceCap(120, Biome.Plains, SEA_LEVEL)).toBe(SNOW);
  });

  it('sand for desert, mud for swamp', () => {
    expect(surfaceCap(70, Biome.Desert, SEA_LEVEL)).toBe(SAND);
    expect(surfaceCap(70, Biome.Swamp, SEA_LEVEL)).toBe(MUD);
  });
});
