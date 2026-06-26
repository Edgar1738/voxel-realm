import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE, SAND } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

const DIRT_BAND = 3; // thickness of the sub-surface band (dirt inland, sand on shores)

/** Paints stone fill with a grass-on-dirt cap, or a sandy cap near/below sea level. */
export class SurfacePainter implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        const sandy = height <= ctx.seaLevel + 1; // shorelines and lake/sea floors
        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = sandy ? SAND : GRASS;
          else if (y >= height - DIRT_BAND) block = sandy ? SAND : DIRT;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
