import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { mulberry32 } from '../core/math';
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
          const r = mulberry32(
            ((worldX * 73856093) ^
              (y * 19349663) ^
              (worldZ * 83492791) ^
              (ctx.seed * 2654435761) ^
              SALT) >>>
              0,
          )();
          if (r < this.density) chunk.set(x, y, z, LANTERN);
        }
      }
    }
  }
}
