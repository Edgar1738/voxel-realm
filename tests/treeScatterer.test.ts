import { describe, it, expect } from 'vitest';
import { scatterTrees } from '../src/worldgen/TreeScatterer';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { GRASS, SNOW, SAND, WOOD, CACTUS } from '../src/blocks/blocks';
import type { ChunkData } from '../src/world/ChunkData';

const SEED = 1337;
const gen = createWorldGenerator();
const biomes = new BiomeMap(SEED);

function grownChunk(cx: number, cz: number): ChunkData {
  const c = gen.generateBaseChunk(SEED, cx, cz);
  scatterTrees(c, cx, cz, SEED);
  return c;
}

/** Lowest y of a given block in a column, or -1. */
function lowestOf(c: ChunkData, x: number, z: number, id: number): number {
  for (let y = 0; y < WORLD_HEIGHT; y++) if (c.get(x, y, z) === id) return y;
  return -1;
}

describe('scatterTrees (biome-aware)', () => {
  it('is deterministic for the same chunk/seed', () => {
    const a = grownChunk(2, -1);
    const b = grownChunk(2, -1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('grows oaks (on grass/tundra-snow) and cacti (on desert sand) across a region', () => {
    let woodSeen = false;
    let cactusSeen = false;
    let cactusInDesert = true;
    let oakSupportOk = true;

    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = grownChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            const wood = lowestOf(c, x, z, WOOD);
            if (wood > 0) {
              woodSeen = true;
              const support = c.get(x, wood - 1, z);
              if (support !== GRASS && support !== SNOW) oakSupportOk = false;
            }
            const cactus = lowestOf(c, x, z, CACTUS);
            if (cactus > 0) {
              cactusSeen = true;
              if (c.get(x, cactus - 1, z) !== SAND) cactusInDesert = false;
              if (biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z) !== Biome.Desert)
                cactusInDesert = false;
            }
          }
        }
      }
    }

    expect(woodSeen).toBe(true);
    expect(cactusSeen).toBe(true);
    expect(oakSupportOk).toBe(true); // oaks only root on grass or tundra snow
    expect(cactusInDesert).toBe(true); // cacti only on desert sand
  });

  it('never roots an oak trunk in the desert (cacti only there)', () => {
    // Leaves may overhang a biome border, but no oak TRUNK should root in a desert column.
    let oakTrunkInDesert = false;
    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = grownChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            if (
              lowestOf(c, x, z, WOOD) > 0 &&
              biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z) === Biome.Desert
            )
              oakTrunkInDesert = true;
          }
        }
      }
    }
    expect(oakTrunkInDesert).toBe(false);
  });
});
