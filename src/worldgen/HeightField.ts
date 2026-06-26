import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import { BiomeMap } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };

interface SeedState {
  shape: NoiseFunction2D;
  biomes: BiomeMap;
}

/**
 * Seeded heightmap: an fBm "shape" channel scaled by biome-blended amplitude/base, so each
 * biome has its own relief (flat deserts, dramatic mountains) with smooth borders.
 */
export class HeightField implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedState>();

  private state(seed: WorldSeed): SeedState {
    let s = this.bySeed.get(seed);
    if (!s) {
      s = { shape: createNoise2D(mulberry32(seed)), biomes: new BiomeMap(seed) };
      this.bySeed.set(seed, s);
    }
    return s;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const { shape, biomes } = this.state(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const { amplitude, baseOffset } = biomes.blendedTerrain(worldX, worldZ);

        let height = Math.floor(BASE_HEIGHT + baseOffset + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
