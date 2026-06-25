import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { AIR } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const FLOOR_MARGIN = 4; // keep a solid world floor below this
const FREQUENCY = 1 / 24;
const THRESHOLD = 0.09; // tunnels where |both fields| < THRESHOLD
const SALT_A = 0x00ca7e5; // distinct noise channels from the world seed
const SALT_B = 0x0b1ade5;

interface SeedNoise {
  a: NoiseFunction3D;
  b: NoiseFunction3D;
}

/**
 * Carves winding cave tunnels: a voxel becomes air where two 3D noise fields are both
 * near zero (their near-zero isosurfaces intersect in worm-like curves). Carves only
 * below the surface cap and above a solid floor margin, so the world floor and the grass
 * top stay intact.
 */
export class CaveCarver implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedNoise>();

  private noise(seed: WorldSeed): SeedNoise {
    let n = this.bySeed.get(seed);
    if (!n) {
      n = {
        a: createNoise3D(mulberry32((seed ^ SALT_A) >>> 0)),
        b: createNoise3D(mulberry32((seed ^ SALT_B) >>> 0)),
      };
      this.bySeed.set(seed, n);
    }
    return n;
  }

  apply(chunk: ChunkData, ctx: GenContext): void {
    const { a, b } = this.noise(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const surface = ctx.heights[x + CHUNK_SIZE_X * z];
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        // Carve below the grass cap, above the floor margin.
        for (let y = FLOOR_MARGIN; y < surface; y++) {
          if (chunk.get(x, y, z) === AIR) continue;
          const na = a(worldX * FREQUENCY, y * FREQUENCY, worldZ * FREQUENCY);
          if (Math.abs(na) >= THRESHOLD) continue;
          const nb = b(worldX * FREQUENCY, y * FREQUENCY, worldZ * FREQUENCY);
          if (Math.abs(nb) >= THRESHOLD) continue;
          chunk.set(x, y, z, AIR);
        }
      }
    }
  }
}
