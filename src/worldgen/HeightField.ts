import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const AMPLITUDE = 24;
const FREQUENCY = 1 / 64;

/** Fills ctx.heights with a seeded 2D heightmap (one biome, same as the original gen). */
export class HeightField implements TerrainStage {
  private readonly noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();

  private noise(seed: WorldSeed): NoiseFunction2D {
    let n = this.noiseBySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32(seed));
      this.noiseBySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const noise2D = this.noise(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const n = noise2D(worldX * FREQUENCY, worldZ * FREQUENCY); // [-1, 1]
        let height = Math.floor(BASE_HEIGHT + n * AMPLITUDE);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
