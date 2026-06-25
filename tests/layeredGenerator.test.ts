import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE } from '../src/blocks/blocks';

const SEED = 1337;

function columnTop(c: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (c.get(x, y, z) !== AIR) return y;
  return -1;
}

describe('LayeredGenerator', () => {
  const gen = createWorldGenerator();

  it('is deterministic: same seed/coords -> identical bytes', () => {
    const a = gen.generateBaseChunk(SEED, 0, 0);
    const b = gen.generateBaseChunk(SEED, 0, 0);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('differs for a different chunk and a different seed', () => {
    const base = gen.generateBaseChunk(SEED, 0, 0);
    expect(Array.from(gen.generateBaseChunk(SEED, 1, 0).data)).not.toEqual(Array.from(base.data));
    expect(Array.from(gen.generateBaseChunk(SEED + 1, 0, 0).data)).not.toEqual(
      Array.from(base.data),
    );
  });

  it('lays grass on top, dirt band beneath, stone below, air above', () => {
    const c = gen.generateBaseChunk(SEED, 0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const top = columnTop(c, x, z);
        expect(top).toBeGreaterThan(0);
        expect(c.get(x, top, z)).toBe(GRASS);
        expect(c.get(x, top - 1, z)).toBe(DIRT);
        expect(c.get(x, top - 4, z)).toBe(STONE);
        expect(c.get(x, 0, z)).toBe(STONE);
        if (top + 1 < WORLD_HEIGHT) expect(c.get(x, top + 1, z)).toBe(AIR);
      }
    }
  });

  it('with an empty overlay list leaves the chunk unchanged', () => {
    const c = gen.generateBaseChunk(SEED, 0, 0);
    const before = Array.from(c.data);
    applyOverlays(c, 0, 0, SEED, []);
    expect(Array.from(c.data)).toEqual(before);
  });
});
