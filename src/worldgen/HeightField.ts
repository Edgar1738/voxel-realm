import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const MIN_AMPLITUDE = 6; // gentle plains
const MAX_AMPLITUDE = 50; // mountains
const RELIEF_SALT = 0x9e3779b9; // derive a second noise channel from the seed

const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };
const RELIEF: FbmOptions = { octaves: 2, persistence: 0.5, lacunarity: 2, frequency: 1 / 384 };

interface SeedNoise {
  shape: NoiseFunction2D;
  relief: NoiseFunction2D;
}

/**
 * Seeded heightmap with Minecraft-style relief: an fBm "shape" channel modulated by a
 * low-frequency "relief" channel that scales amplitude between plains and mountains.
 */
export class HeightField implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedNoise>();

  private noise(seed: WorldSeed): SeedNoise {
    let n = this.bySeed.get(seed);
    if (!n) {
      n = {
        shape: createNoise2D(mulberry32(seed)),
        relief: createNoise2D(mulberry32((seed ^ RELIEF_SALT) >>> 0)),
      };
      this.bySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const { shape, relief } = this.noise(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const rRaw = fbm2D(relief, worldX, worldZ, RELIEF); // [-1, 1]
        const r = (rRaw + 1) / 2; // [0, 1]
        // r^2 biases toward plains, with occasional dramatic mountains.
        const amplitude = MIN_AMPLITUDE + r * r * (MAX_AMPLITUDE - MIN_AMPLITUDE);

        let height = Math.floor(BASE_HEIGHT + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
