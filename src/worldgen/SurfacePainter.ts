import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE, SAND, SNOW, MUD } from '../blocks/blocks';
import { Biome } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { BlockId } from '../core/types';

const DIRT_BAND = 3; // thickness of the sub-surface band
const SNOW_LINE = 95; // any surface at/above this altitude is snow-capped

/**
 * The surface cap block for a column, from its altitude and biome. Shared so overlays (e.g. the tree
 * scatterer deciding where an oak may root) apply the exact same rule the terrain paints with.
 */
export function surfaceCap(height: number, biome: Biome, seaLevel: number): BlockId {
  if (height <= seaLevel + 1) return SAND; // beaches / lake & sea floors win over biome
  if (height >= SNOW_LINE || biome === Biome.Tundra) return SNOW; // altitude or tundra snow
  if (biome === Biome.Desert) return SAND;
  if (biome === Biome.Swamp) return MUD;
  return GRASS;
}

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

        const cap = surfaceCap(height, biome, ctx.seaLevel);
        // Grass/snow sit over a dirt band; sand and mud caps continue their own material below.
        const band = cap === GRASS || cap === SNOW ? DIRT : cap;

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
