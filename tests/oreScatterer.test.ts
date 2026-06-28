import { describe, it, expect } from 'vitest';
import { OreScatterer } from '../src/worldgen/OreScatterer';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA } from '../src/core/constants';
import { STONE, DIRT, COAL_ORE, IRON_ORE, GOLD_ORE, CRYSTAL } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';
import type { BiomeSource } from '../src/worldgen/BiomeMap';

const SURFACE = 64;

function ctx(seed: number): GenContext {
  return {
    seed,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(SURFACE),
    seaLevel: 62,
    biomes: {} as unknown as BiomeSource, // unused by OreScatterer
  };
}

/** A chunk filled with stone from y=0 up to the surface. */
function stoneChunk(): ChunkData {
  const c = new ChunkData(0, 0);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) for (let y = 0; y < SURFACE; y++) c.set(x, y, z, STONE);
  return c;
}

function countOres(c: ChunkData): number {
  let n = 0;
  for (const v of c.data)
    if (v === COAL_ORE || v === IRON_ORE || v === GOLD_ORE || v === CRYSTAL) n++;
  return n;
}

const BAND_Y: Record<number, [number, number]> = {
  [CRYSTAL]: [5, 24],
  [GOLD_ORE]: [5, 30],
  [IRON_ORE]: [8, 62],
  [COAL_ORE]: [14, SURFACE - 1],
};

describe('OreScatterer', () => {
  it('places ores in stone and keeps each ore within its depth band', () => {
    const c = stoneChunk();
    new OreScatterer().apply(c, ctx(1337));
    expect(countOres(c)).toBeGreaterThan(0);
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++)
        for (let y = 0; y < SURFACE; y++) {
          const v = c.get(x, y, z);
          const band = BAND_Y[v];
          if (band) {
            expect(y).toBeGreaterThanOrEqual(band[0]);
            expect(y).toBeLessThanOrEqual(band[1]);
          }
        }
  });

  it('only replaces STONE (leaves other blocks alone)', () => {
    const c = stoneChunk();
    c.set(0, 40, 0, DIRT);
    new OreScatterer({ densityScale: 30 }).apply(c, ctx(1337));
    expect(c.get(0, 40, 0)).toBe(DIRT);
  });

  it('places nothing at densityScale 0', () => {
    const c = stoneChunk();
    new OreScatterer({ densityScale: 0 }).apply(c, ctx(1337));
    expect(countOres(c)).toBe(0);
  });

  it('is deterministic for the same seed', () => {
    const a = stoneChunk();
    const b = stoneChunk();
    new OreScatterer().apply(a, ctx(99));
    new OreScatterer().apply(b, ctx(99));
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
