import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { AIR, WATER } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

/**
 * Floods basins: in columns whose surface dips below sea level, fills the air from just
 * above the surface up to sea level with water. Only fills air (never overwrites terrain)
 * and only above the surface, so caves under higher ground are not flooded.
 */
export class WaterFiller implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const surface = ctx.heights[x + CHUNK_SIZE_X * z];
        if (surface >= ctx.seaLevel) continue;
        for (let y = surface + 1; y <= ctx.seaLevel; y++) {
          if (chunk.get(x, y, z) === AIR) chunk.set(x, y, z, WATER);
        }
      }
    }
  }
}
