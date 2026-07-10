import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { DEEPSLATE, GRAVEL, STONE } from '../blocks/blocks';
import { mulberry32 } from '../core/math';
import { fbm2D, type FbmOptions } from './fbm';
import { LayeredGenerator } from './LayeredGenerator';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/** Shared terrain frame for the authored overlook, valley, and Cinderkeep site. */
export const ASHEN_REACH = {
  spawnX: 0,
  spawnZ: 92,
  overlookY: 104,
  keepX: 0,
  keepZ: -64,
  keepY: 78,
  valleyZ: 20,
} as const;

const SALT = 0xa5e4_9001;
const VOLCANIC_FBM: FbmOptions = {
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2,
  frequency: 1 / 72,
};

const noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();

function noiseFor(seed: WorldSeed): NoiseFunction2D {
  let noise = noiseBySeed.get(seed);
  if (!noise) {
    noise = createNoise2D(mulberry32((seed ^ SALT) >>> 0));
    noiseBySeed.set(seed, noise);
  }
  return noise;
}

function clampHeight(height: number): number {
  return Math.max(1, Math.min(WORLD_HEIGHT - 1, Math.round(height)));
}

function inOverlook(wx: number, wz: number): boolean {
  return Math.abs(wx - ASHEN_REACH.spawnX) <= 20 && wz >= 70 && wz <= 112;
}

function inKeepFoundation(wx: number, wz: number): boolean {
  return Math.abs(wx - ASHEN_REACH.keepX) <= 46 && Math.abs(wz - ASHEN_REACH.keepZ) <= 42;
}

function rawHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  if (inOverlook(wx, wz)) return ASHEN_REACH.overlookY;
  if (inKeepFoundation(wx, wz)) return ASHEN_REACH.keepY;

  const ridge = fbm2D(noise, wx, wz, VOLCANIC_FBM) * 12;
  const valleyDistance = (wz - ASHEN_REACH.valleyZ) / 28;
  const valley = Math.exp(-(valleyDistance * valleyDistance)) * 27;
  const shoulder = Math.min(Math.abs(wx) * 0.09, 9);
  return SEA_LEVEL + 12 + ridge + shoulder - valley;
}

/** Deterministic solid surface height for terrain stamps and exploration props. */
export function ashenReachSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampHeight(rawHeight(noiseFor(seed), wx, wz));
}

class AshenField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = noiseFor(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const wx = ctx.cx * CHUNK_SIZE_X + x;
        const wz = ctx.cz * CHUNK_SIZE_Z + z;
        const height = clampHeight(rawHeight(noise, wx, wz));
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
        const ashCap = fbm2D(noise, wx + 401, wz - 173, VOLCANIC_FBM) > 0.12;
        for (let y = 0; y <= height; y++) {
          const block =
            y === height ? (ashCap ? GRAVEL : DEEPSLATE) : y > height - 4 ? DEEPSLATE : STONE;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}

/** Dark, cliffed terrain with a fixed overlook and foundation for the authored frontier site. */
export function createAshenReachGenerator(): LayeredGenerator {
  return new LayeredGenerator([new AshenField()], SEA_LEVEL);
}
