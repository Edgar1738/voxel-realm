import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };

/**
 * Seeded heightmap: an fBm "shape" channel scaled by biome-blended amplitude/base (from the
 * shared BiomeSource in the context), so each biome has its own relief with smooth borders.
 */
export class HeightField implements TerrainStage {
  private readonly shapeBySeed = new Map<WorldSeed, NoiseFunction2D>();

  private shape(seed: WorldSeed): NoiseFunction2D {
    let n = this.shapeBySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32(seed));
      this.shapeBySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const shape = this.shape(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const { amplitude, baseOffset } = ctx.biomes.blendedTerrain(worldX, worldZ);

        let height = Math.floor(BASE_HEIGHT + baseOffset + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
