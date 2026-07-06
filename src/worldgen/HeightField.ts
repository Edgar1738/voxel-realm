import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { layeredSurfaceAt } from './layeredHeight';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

/**
 * Seeded heightmap stage: fills ctx.heights from the shared {@link layeredSurfaceAt} so terrain
 * generation and surface overlays (trees, cacti) agree on exactly where the ground is.
 */
export class HeightField implements TerrainStage {
  apply(_chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        ctx.heights[x + CHUNK_SIZE_X * z] = layeredSurfaceAt(ctx.seed, worldX, worldZ);
      }
    }
  }
}
