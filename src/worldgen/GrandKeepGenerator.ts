import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { GRASS, DIRT, STONE, SAND } from '../blocks/blocks';
import { fbm2D, type FbmOptions } from './fbm';
import { CaveCarver } from './CaveCarver';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { CaveTorcher } from './CaveTorcher';
import { LayeredGenerator } from './LayeredGenerator';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/**
 * Geometry of The Grand Keep site. The fortress sits on a flat square mesa; generator and site
 * stamps share these constants so walls, keep, and dungeon line up with the flattened ground.
 * Spawn is south of the gate (~z=-95) looking north into the massing.
 */
export const GRAND_KEEP = {
  centerX: 8,
  centerZ: 20,
  /** Top solid block of the courtyard / plateau. Buildings stamp from groundY+1 up. */
  groundY: 72,
  /**
   * Chebyshev half-width of the flat mesa top.
   * Expanded so outer city walls, village ring, and sky-bridge towers sit on flat ground.
   */
  plateauRadius: 140,
  /** Chebyshev distance where the slope returns to surrounding plains. */
  skirtRadius: 220,
  /** Surrounding plains height. */
  plainsY: 64,
} as const;

const PLAINS_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 110 };
const SALT = 0x67a4d1e1;

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

function plateauHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  const cheb = Math.max(Math.abs(wx - GRAND_KEEP.centerX), Math.abs(wz - GRAND_KEEP.centerZ));
  const plains = GRAND_KEEP.plainsY + fbm2D(noise, wx, wz, PLAINS_FBM) * 3;
  if (cheb <= GRAND_KEEP.plateauRadius) return GRAND_KEEP.groundY;
  if (cheb >= GRAND_KEEP.skirtRadius) return plains;
  const t = (cheb - GRAND_KEEP.plateauRadius) / (GRAND_KEEP.skirtRadius - GRAND_KEEP.plateauRadius);
  return GRAND_KEEP.groundY + (plains - GRAND_KEEP.groundY) * smoothstep(t);
}

const noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();
function noiseFor(seed: WorldSeed): NoiseFunction2D {
  let n = noiseBySeed.get(seed);
  if (!n) {
    n = createNoise2D(mulberry32((seed ^ SALT) >>> 0));
    noiseBySeed.set(seed, n);
  }
  return n;
}

/** Deterministic ground height for scatter overlays outside the fortress. */
export function grandKeepSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(plateauHeight(noiseFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

const DIRT_BAND = 3;

class PlateauField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = noiseFor(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const h = clampInt(plateauHeight(noise, worldX, worldZ), 1, WORLD_HEIGHT - 1);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;
        const cap = h <= ctx.seaLevel + 1 ? SAND : GRASS;
        const band = cap === SAND ? SAND : DIRT;
        for (let y = 0; y <= h; y++) {
          let block = STONE;
          if (y === h) block = cap;
          else if (y >= h - DIRT_BAND) block = band;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}

/** Mesa terrain for The Grand Keep: flat fortress pad, skirt, plains, caves below. */
export function createGrandKeepGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [
      new PlateauField(),
      new CaveCarver({ threshold: 0.1, frequency: 1 / 26, floorMargin: 5 }),
      new WaterFiller(),
      new OreScatterer({ densityScale: 1.1 }),
      new CaveTorcher({ density: 0.04 }),
    ],
    SEA_LEVEL,
  );
}
