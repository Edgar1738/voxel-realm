import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE, SAND, SNOW, MUD } from '../blocks/blocks';
import { Biome } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

const DIRT_BAND = 3; // thickness of the sub-surface band
const SNOW_LINE = 95; // any surface at/above this altitude is snow-capped

/** Paints the surface cap + band per column from biome, altitude, and sea level. */
export class SurfacePainter implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const biome = ctx.biomes.biomeAt(worldX, worldZ);
        chunk.setBiome(x, z, biome);

        let cap = GRASS;
        let band = DIRT;
        if (height <= ctx.seaLevel + 1) {
          cap = SAND; // beaches / lake & sea floors win over biome
          band = SAND;
        } else if (height >= SNOW_LINE || biome === Biome.Tundra) {
          cap = SNOW; // altitude or tundra snow, over a dirt band
          band = DIRT;
        } else if (biome === Biome.Desert) {
          cap = SAND;
          band = SAND;
        } else if (biome === Biome.Swamp) {
          cap = MUD;
          band = MUD;
        }

        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = cap;
          else if (y >= height - DIRT_BAND) block = band;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
