import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { AIR, WATER, LANTERN } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

export interface CaveTorcherOptions {
  /** Chance a qualifying cave-floor cell gets a torch (0..1). Default 0.06. */
  density?: number;
  /** Don't place torches below this y (keeps them off the solid world floor). Default 5. */
  floorMargin?: number;
}

const SALT = 0x70c4ed; // distinct hash channel for torch placement

/**
 * Inline one-shot integer → [0,1) hash using a MurmurHash3-style avalanche
 * finalizer. All multiplies via Math.imul to stay in 32-bit integer space,
 * avoiding float precision loss for large seeds or coordinates.
 */
function hashToFloat(h: number): number {
  // Every step uses >>> 0 to ensure the value stays unsigned before division.
  let x = h >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000; // unsigned 32-bit / 2^32 → [0,1)
}

/**
 * Lights carved caves: places lantern "torches" on cave floors so the (post-lighting) dark
 * underground is navigable. A cell qualifies if it is air, rests on a solid (non-water) floor,
 * and has headroom above; placement is a deterministic sparse hash of world coords + seed, so
 * torches scatter along passages and stay consistent across chunk borders. Runs after the
 * carve/water stages.
 */
export class CaveTorcher implements TerrainStage {
  private readonly density: number;
  private readonly floorMargin: number;

  constructor(opts: CaveTorcherOptions = {}) {
    this.density = opts.density ?? 0.06;
    this.floorMargin = opts.floorMargin ?? 5;
  }

  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const surface = ctx.heights[x + CHUNK_SIZE_X * z];
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        for (let y = this.floorMargin; y < surface; y++) {
          if (chunk.get(x, y, z) !== AIR) continue;
          const below = chunk.get(x, y - 1, z);
          if (below === AIR || below === WATER) continue; // need a solid floor
          if (chunk.get(x, y + 1, z) !== AIR) continue; // need headroom
          // All multiplies use Math.imul to stay in 32-bit integer space,
          // preventing float precision loss for large seeds or coordinates.
          const hash =
            (Math.imul(worldX, 73856093) ^
              Math.imul(y, 19349663) ^
              Math.imul(worldZ, 83492791) ^
              Math.imul(ctx.seed, 2654435761) ^
              SALT) >>>
            0;
          if (hashToFloat(hash) < this.density) chunk.set(x, y, z, LANTERN);
        }
      }
    }
  }
}
