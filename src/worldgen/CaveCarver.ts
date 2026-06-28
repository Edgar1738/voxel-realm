import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { AIR } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const SALT_A = 0x00ca7e5; // distinct noise channels from the world seed
const SALT_B = 0x0b1ade5;

interface SeedNoise {
  a: NoiseFunction3D;
  b: NoiseFunction3D;
}

export interface CaveCarverOptions {
  /** Tunnels carve where both noise fields are within +/- this of zero. Larger = roomier. Default 0.09. */
  threshold?: number;
  /** Noise sampling frequency; lower = larger, smoother caverns. Default 1/24. */
  frequency?: number;
  /** Keep a solid world floor below this y. Default 4. */
  floorMargin?: number;
}

/**
 * Carves winding cave tunnels: a voxel becomes air where two 3D noise fields are both
 * near zero (their near-zero isosurfaces intersect in worm-like curves). Carves only
 * below the surface cap and above a solid floor margin, so the world floor and the grass
 * top stay intact. Tunables (threshold/frequency) let a preset grow open caverns.
 */
export class CaveCarver implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedNoise>();
  private readonly threshold: number;
  private readonly frequency: number;
  private readonly floorMargin: number;

  constructor(opts: CaveCarverOptions = {}) {
    this.threshold = opts.threshold ?? 0.09;
    this.frequency = opts.frequency ?? 1 / 24;
    this.floorMargin = opts.floorMargin ?? 4;
  }

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
        for (let y = this.floorMargin; y < surface; y++) {
          if (chunk.get(x, y, z) === AIR) continue;
          const na = a(worldX * this.frequency, y * this.frequency, worldZ * this.frequency);
          if (Math.abs(na) >= this.threshold) continue;
          const nb = b(worldX * this.frequency, y * this.frequency, worldZ * this.frequency);
          if (Math.abs(nb) >= this.threshold) continue;
          chunk.set(x, y, z, AIR);
        }
      }
    }
  }
}
