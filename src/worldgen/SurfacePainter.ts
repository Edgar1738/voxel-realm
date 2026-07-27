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
  DRY_GRASS,
  FOREST_FLOOR,
  MOSS,
  CLAY,
  PEAT,
  BLUE_ICE,
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

/**
 * Smoothstep-interpolated 2D value noise on a `scale`-block lattice — coherent
 * meso-scale patches (roughly one feature per `scale` blocks) instead of the
 * blocky squares a raw region hash would give. Deterministic in world coords.
 */
export function patchNoise(worldX: number, worldZ: number, scale: number, salt: number): number {
  const fx = worldX / scale;
  const fz = worldZ / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const ux = tx * tx * (3 - 2 * tx);
  const uz = tz * tz * (3 - 2 * tz);
  const a = hash01(x0, z0, salt);
  const b = hash01(x0 + 1, z0, salt);
  const c = hash01(x0, z0 + 1, salt);
  const d = hash01(x0 + 1, z0 + 1, salt);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

/**
 * Meso-scale ecological patching of the base cap: dry-grass swathes in hot dry plains,
 * leaf-litter floors in forests, moss near humid waterlines, clay in beach shallows, and
 * peat pockets in swamps. CAP-MATERIAL SWAPS ONLY — heights are never touched, so player
 * edits and authored structures sit exactly where they always did. Deterministic from
 * seed + world coords; trees/decorations gate on the pure surfaceCap() rule and coexist.
 */
export function patchedCap(
  cap: BlockId,
  worldX: number,
  worldZ: number,
  height: number,
  biome: Biome,
  ctx: GenContext,
): BlockId {
  const seedSalt = (s: number): number => (s ^ Math.imul(ctx.seed, 0x9e3779b1)) | 0;
  if (cap === GRASS) {
    const climate = ctx.biomes.climateAt?.(worldX, worldZ);
    if (climate) {
      // Hot + dry pushes patches of parched grass; the noise keeps edges organic.
      const dry =
        patchNoise(worldX, worldZ, 14, seedSalt(0x0d47)) + climate.t * 0.2 - climate.h * 0.3;
      if (climate.t > 0.1 && climate.h < 0.1 && dry > 0.72) return DRY_GRASS;
      // Humid ground near the waterline mosses over.
      if (
        climate.h > 0.25 &&
        height <= ctx.seaLevel + 3 &&
        patchNoise(worldX, worldZ, 8, seedSalt(0x305)) > 0.62
      ) {
        return MOSS;
      }
    }
    if (biome === Biome.Forest && patchNoise(worldX, worldZ, 10, seedSalt(0xf10c)) > 0.64) {
      return FOREST_FLOOR;
    }
    return cap;
  }
  if (cap === SAND && height <= ctx.seaLevel + 1) {
    // Tundra shores freeze over: broad blue-ice rims with sand gaps, so cold coasts
    // read frozen instead of beach-like. Checked before clay — ice owns the cold.
    if (biome === Biome.Tundra) {
      return patchNoise(worldX, worldZ, 10, seedSalt(0x1ced)) > 0.3 ? BLUE_ICE : cap;
    }
    // 0.73: beaches are broad and flat, so even a small threshold drop reads as
    // sprawling grey sheets — keep clay an accent, not a second shoreline.
    if (patchNoise(worldX, worldZ, 9, seedSalt(0xc1a7)) > 0.73) return CLAY;
    return cap;
  }
  if (cap === MUD && patchNoise(worldX, worldZ, 12, seedSalt(0x9ea7)) > 0.62) return PEAT;
  return cap;
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

        const cap = patchedCap(
          surfaceCap(height, biome, ctx.seaLevel),
          worldX,
          worldZ,
          height,
          biome,
          ctx,
        );
        // Grass-like caps sit over a dirt band; sand/mud/clay/peat continue their own
        // material below (clay and peat read as deposits, not veneers).
        const band =
          cap === GRASS || cap === SNOW || cap === DRY_GRASS || cap === FOREST_FLOOR || cap === MOSS
            ? DIRT
            : cap;

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
