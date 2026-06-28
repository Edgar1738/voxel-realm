import { describe, it, expect } from 'vitest';
import { CaveTorcher } from '../src/worldgen/CaveTorcher';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, STONE, WATER, LANTERN } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';
import type { BiomeSource } from '../src/worldgen/BiomeMap';

function ctx(seed: number, surface: number): GenContext {
  return {
    seed,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(surface),
    seaLevel: 62,
    biomes: {} as unknown as BiomeSource, // unused by CaveTorcher
  };
}

function countLanterns(chunk: ChunkData): number {
  let n = 0;
  for (const v of chunk.data) if (v === LANTERN) n++;
  return n;
}

describe('CaveTorcher', () => {
  it('places a torch on a qualifying cave floor (air, solid below, headroom above)', () => {
    const chunk = new ChunkData(0, 0);
    chunk.set(0, 10, 0, STONE); // floor
    // (0,11,0) and (0,12,0) are AIR by default -> cave with headroom
    new CaveTorcher({ density: 1 }).apply(chunk, ctx(1, 64));
    expect(chunk.get(0, 11, 0)).toBe(LANTERN);
  });

  it('does not place torches on a floating cell, without headroom, in water, or in solid', () => {
    const chunk = new ChunkData(0, 0);
    // floating: air below
    // (1,11,1) air, (1,10,1) air -> skip
    // no headroom
    chunk.set(2, 20, 1, STONE); // floor
    chunk.set(2, 22, 1, STONE); // ceiling directly above the cell -> no headroom at y=21
    // water floor
    chunk.set(3, 30, 1, WATER);
    new CaveTorcher({ density: 1 }).apply(chunk, ctx(1, 64));
    expect(chunk.get(1, 11, 1)).toBe(AIR); // floating
    expect(chunk.get(2, 21, 1)).toBe(AIR); // no headroom
    expect(chunk.get(3, 31, 1)).toBe(AIR); // water floor
  });

  it('places nothing at density 0', () => {
    const chunk = new ChunkData(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.set(x, 10, z, STONE);
    new CaveTorcher({ density: 0 }).apply(chunk, ctx(1, 64));
    expect(countLanterns(chunk)).toBe(0);
  });

  it('is deterministic for the same seed', () => {
    const make = (): ChunkData => {
      const c = new ChunkData(0, 0);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.set(x, 10, z, STONE);
      new CaveTorcher({ density: 0.5 }).apply(c, ctx(1337, 64));
      return c;
    };
    expect(Array.from(make().data)).toEqual(Array.from(make().data));
  });

  it('stays within the world and off the floor margin', () => {
    const chunk = new ChunkData(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.set(x, 10, z, STONE);
    new CaveTorcher({ density: 1 }).apply(chunk, ctx(1, 64));
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          if (chunk.get(x, y, z) === LANTERN) expect(y).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});
