import { describe, it, expect } from 'vitest';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE, SAND, SNOW } from '../src/blocks/blocks';
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
    stage.apply(chunk, ctx(top, Biome.Tundra)); // even in tundra, the shoreline is sand
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, 0, 0)).toBe(STONE);
  });
});
