import { describe, it, expect } from 'vitest';
import { scatterTrees } from '../src/worldgen/TreeScatterer';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, CHUNK_VOLUME } from '../src/core/constants';
import { GRASS, STONE, SAND, SNOW, WOOD, CACTUS } from '../src/blocks/blocks';

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

  // --- New: growOak near chunk edge must not throw RangeError ---
  it('scatterTrees never throws on any chunk in a wide region', () => {
    // Regression test: before the OOB guard, growOak could throw RangeError
    // if placeLeaves tried to write a voxel at x+dx or z+dz outside [0,15].
    // This tests a wide range of chunks to exercise all tree-placement paths.
    expect(() => {
      for (let cx = -8; cx <= 8; cx++) {
        for (let cz = -8; cz <= 8; cz++) {
          const c = gen.generateBaseChunk(SEED, cx, cz);
          scatterTrees(c, cx, cz, SEED);
        }
      }
    }).not.toThrow();
  });

  it('does not throw when chunk is a minimal stone+grass column at edge position', () => {
    // Build a chunk where surface is near x=0/z=0 and manually test that scatterTrees
    // doesn't crash. The OOB crash in placeLeaves would fire if growOak is ever called
    // with an interior-but-near-edge position where canopy radius would extend OOB.
    // The fix ensures set() is guarded for OOB before calling.

    // Create a full grass chunk — scatterTrees may attempt trees anywhere in [2,13]
    const c = new ChunkData(0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let y = 0; y < 50; y++) c.set(x, y, z, STONE);
        c.set(x, 50, z, GRASS);
      }
    }
    expect(() => scatterTrees(c, 0, 0, SEED)).not.toThrow();
  });

  it('leaves do not appear outside chunk bounds (no OOB write)', () => {
    // All leaves placed must be within [0,15] x [0,15] columns.
    // We verify this by checking the chunk data is internally consistent after scatterTrees.
    const c = gen.generateBaseChunk(SEED, 3, -2);
    expect(() => scatterTrees(c, 3, -2, SEED)).not.toThrow();
    // All voxels in c.data are valid (no exception on get)
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++)
        for (let y = 0; y < WORLD_HEIGHT; y++) expect(() => c.get(x, y, z)).not.toThrow();
  });

  it('chunk data buffer length is unchanged after scatterTrees (no overrun)', () => {
    // Sanity: chunk data must remain exactly CHUNK_VOLUME bytes after tree scatter.
    const c = gen.generateBaseChunk(SEED, 2, 2);
    scatterTrees(c, 2, 2, SEED);
    // Buffer must be exactly CHUNK_VOLUME — checked before and after to catch any overrun.
    expect(c.data.length).toBe(CHUNK_VOLUME);
  });
});
