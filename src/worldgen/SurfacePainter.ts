import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

const DIRT_BAND = 3; // dirt thickness between the grass top and stone

/** Paints stone fill, a dirt band, and a grass cap from ctx.heights (same as original gen). */
export class SurfacePainter implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = GRASS;
          else if (y >= height - DIRT_BAND) block = DIRT;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
