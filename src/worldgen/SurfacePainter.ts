import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import {
  GRASS,
  DIRT,
  STONE,
  SAND,
  SNOW,
  MUD,
  WARM_STONE,
  BLUE_STONE,
  GRANITE,
  BASALT,
  SANDSTONE,
} from '../blocks/blocks';
import { Biome } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { BlockId } from '../core/types';

const DIRT_BAND = 3; // thickness of the sub-surface band
const SNOW_LINE = 95; // any surface at/above this altitude is snow-capped

function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Broad, deterministic geological regions rather than per-voxel color confetti. */
export function geologicalStone(
  worldX: number,
  y: number,
  worldZ: number,
  height: number,
  biome: Biome,
): BlockId {
  const region = hash01(worldX >> 4, worldZ >> 4, 0x6e6f6c);
  const depth = height - y;
  if (depth > 30) return region < 0.18 ? BASALT : STONE;
  if (biome === Biome.Desert) return depth < 14 ? SANDSTONE : WARM_STONE;
  if (biome === Biome.Mountains) {
    if (height >= SNOW_LINE + 12) return region < 0.58 ? GRANITE : BLUE_STONE;
    if (height >= 76) return region < 0.55 ? BLUE_STONE : GRANITE;
    return region < 0.3 ? WARM_STONE : STONE;
  }
  if (biome === Biome.Tundra) return region < 0.65 ? BLUE_STONE : GRANITE;
  return region < 0.13 ? WARM_STONE : STONE;
}

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
          let block = geologicalStone(worldX, y, worldZ, height, biome);
          if (y === height) block = cap;
          else if (y >= height - DIRT_BAND) block = band;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
