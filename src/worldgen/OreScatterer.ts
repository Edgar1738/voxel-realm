import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { mulberry32 } from '../core/math';
import { STONE, COAL_ORE, IRON_ORE, GOLD_ORE, CRYSTAL } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { BlockId } from '../core/types';

interface OreBand {
  id: BlockId;
  minY: number;
  maxY: number;
  density: number;
  salt: number;
}

/** Rarest/deepest first so a richer ore wins a contested voxel. */
const BANDS: readonly OreBand[] = [
  { id: CRYSTAL, minY: 5, maxY: 24, density: 0.004, salt: 0x0c8a1 },
  { id: GOLD_ORE, minY: 5, maxY: 30, density: 0.006, salt: 0x0901d },
  { id: IRON_ORE, minY: 8, maxY: 62, density: 0.013, salt: 0x01401 },
  { id: COAL_ORE, minY: 14, maxY: 120, density: 0.02, salt: 0x0c0a1 },
];

const MIN_Y = 5;

export interface OreScattererOptions {
  /** Multiplies every band's density (0 disables; >1 enriches). Default 1. */
  densityScale?: number;
}

/**
 * Sprinkles ore into underground stone so cave walls reward exploration. For each stone voxel,
 * the depth-banded ores are tried rarest-first and the first deterministic hit wins (so a vein of
 * crystal isn't overwritten by common coal). Only STONE is replaced; runs after carving/water so
 * ore shows in cave walls. CRYSTAL is emissive, giving deep caves a faint glow.
 */
export class OreScatterer implements TerrainStage {
  private readonly densityScale: number;

  constructor(opts: OreScattererOptions = {}) {
    this.densityScale = opts.densityScale ?? 1;
  }

  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const surface = ctx.heights[x + CHUNK_SIZE_X * z];
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        for (let y = MIN_Y; y < surface; y++) {
          if (chunk.get(x, y, z) !== STONE) continue;
          for (const band of BANDS) {
            if (y < band.minY || y > band.maxY) continue;
            const r = mulberry32(
              ((worldX * 73856093) ^
                (y * 19349663) ^
                (worldZ * 83492791) ^
                (ctx.seed * 2654435761) ^
                band.salt) >>>
                0,
            )();
            if (r < band.density * this.densityScale) {
              chunk.set(x, y, z, band.id);
              break;
            }
          }
        }
      }
    }
  }
}
