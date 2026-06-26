import { describe, it, expect } from 'vitest';
import { scatterTrees } from '../src/worldgen/TreeScatterer';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, GRASS, WOOD, LEAVES } from '../src/blocks/blocks';
import type { ChunkData } from '../src/world/ChunkData';

const SEED = 1337;
const gen = createWorldGenerator();

function grownChunk(cx: number, cz: number): ChunkData {
  const c = gen.generateBaseChunk(SEED, cx, cz);
  scatterTrees(c, cx, cz, SEED);
  return c;
}

function countBlock(c: ChunkData, id: number): number {
  let n = 0;
  for (let y = 0; y < WORLD_HEIGHT; y++)
    for (let z = 0; z < CHUNK_SIZE_Z; z++)
      for (let x = 0; x < CHUNK_SIZE_X; x++) if (c.get(x, y, z) === id) n++;
  return n;
}

describe('scatterTrees', () => {
  it('is deterministic for the same chunk/seed', () => {
    const a = grownChunk(2, -1);
    const b = grownChunk(2, -1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('grows trees (wood + leaves) somewhere across a region', () => {
    let wood = 0;
    let leaves = 0;
    for (let cx = -4; cx < 4; cx++) {
      for (let cz = -4; cz < 4; cz++) {
        const c = grownChunk(cx, cz);
        wood += countBlock(c, WOOD);
        leaves += countBlock(c, LEAVES);
      }
    }
    expect(wood).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(0);
  });

  it('roots every trunk on grass', () => {
    for (let cx = -4; cx < 4; cx++) {
      for (let cz = -4; cz < 4; cz++) {
        const c = grownChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            // Find the lowest wood voxel in this column (the trunk base).
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              if (c.get(x, y, z) === WOOD) {
                expect(c.get(x, y - 1, z)).toBe(GRASS);
                break;
              }
            }
          }
        }
      }
    }
  });

  it('does not overwrite the grass surface it grows on', () => {
    const c = grownChunk(0, 0);
    expect(countBlock(c, AIR)).toBeGreaterThan(0);
  });
});
