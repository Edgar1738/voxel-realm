import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import {
  AIR,
  STONE,
  BASALT,
  GRANITE,
  BLUE_STONE,
  WARM_STONE,
  CRYSTAL,
  MOSS,
  MUSHROOM,
  DARK_LOAM,
  STALACTITE,
} from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/** Natural cave-floor stones a theme may decorate. Ore/authored blocks are never touched. */
const FLOOR_STONES = new Set<number>([STONE, BASALT, GRANITE, BLUE_STONE, WARM_STONE]);

function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export type CaveTheme = 'none' | 'crystal' | 'fungal';

/**
 * Deep caves get regional identities in broad 128-block cells: crystal galleries
 * (luminous CRYSTAL seams in the floor) and fungal hollows (moss beds + mushrooms).
 * Most of the underground stays plain stone so a themed cavern reads as a find.
 */
export function caveThemeAt(seed: WorldSeed, worldX: number, worldZ: number): CaveTheme {
  const salt = (0xca7e ^ Math.imul(seed, 0x9e3779b1)) | 0;
  const r = hash01(worldX >> 7, worldZ >> 7, salt);
  if (r < 0.14) return 'crystal';
  if (r < 0.28) return 'fungal';
  return 'none';
}

/** Themes live in the deep dark, never in surface pits or just under the topsoil. */
const THEME_CEILING_Y = 52;
const MIN_COVER = 12;

/**
 * Sprinkles theme accents onto already-carved cave floors. Pure and deterministic in
 * (seed, world coords); runs after ore scattering so it never overwrites ore, and only
 * ever swaps natural floor stone or fills cave air — heights are untouched.
 */
export class CaveThemeStage implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const salt = (0x71e0 ^ Math.imul(ctx.seed, 0x85ebca6b)) | 0;
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const theme = caveThemeAt(ctx.seed, worldX, worldZ);
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        const top = Math.min(THEME_CEILING_Y, height - MIN_COVER);
        for (let y = 2; y <= top; y++) {
          if (chunk.get(x, y, z) !== AIR) continue;
          // Stalactites hang from any deep stone ceiling, themed or not — sparse
          // enough (~1.2% of ceiling cells) that finding a cluster feels geological.
          if (
            y + 1 <= top + MIN_COVER &&
            FLOOR_STONES.has(chunk.get(x, y + 1, z)) &&
            hash01(worldX ^ 0x7a11, worldZ ^ Math.imul(y, 0x27d4eb2d), salt) > 0.988
          ) {
            chunk.set(x, y, z, STALACTITE);
            continue;
          }
          if (theme === 'none') continue;
          if (!FLOOR_STONES.has(chunk.get(x, y - 1, z))) continue;
          // Rates are deliberately strong: background ore already sprinkles these depths,
          // so a themed gallery must repaint its FLOOR to read as a distinct place.
          const h = hash01(worldX, worldZ ^ Math.imul(y, 0x9e3779b1), salt);
          if (theme === 'crystal') {
            // Cool blue-stone floor threaded with luminous crystal seams (CRYSTAL emits
            // light, so galleries glow on their own).
            if (h > 0.93) chunk.set(x, y - 1, z, CRYSTAL);
            else if (h > 0.55) chunk.set(x, y - 1, z, BLUE_STONE);
          } else {
            // Earthy fungal hollow: loam-and-moss beds with scattered mushrooms.
            if (h > 0.96) chunk.set(x, y, z, MUSHROOM);
            else if (h > 0.75) chunk.set(x, y - 1, z, MOSS);
            else if (h > 0.45) chunk.set(x, y - 1, z, DARK_LOAM);
          }
        }
      }
    }
  }
}
