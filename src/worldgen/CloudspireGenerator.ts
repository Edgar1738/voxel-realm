import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { GRASS, DIRT, STONE, SAND, STONE as ROCK } from '../blocks/blocks';
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
 * Cloudspire Citadel site geometry. Terraced mountain mesa with steep cliffs and
 * elevated water basins; stamps and terrain share these anchors.
 */
export const CLOUDSPIRE = {
  centerX: 0,
  centerZ: 0,
  /** Outer city terrace (top solid). */
  groundY: 96,
  /** Inner palace / cathedral terrace. */
  palaceY: 112,
  /** Garden terrace between outer walls and palace. */
  gardenY: 104,
  /** Flat outer terrace half-extent (Chebyshev). */
  outerRadius: 130,
  /** Palace terrace half-extent. */
  palaceRadius: 78,
  /** Garden band outer edge. */
  gardenRadius: 100,
  /** Where mountain skirt returns toward plains. */
  skirtRadius: 210,
  plainsY: 72,
  /** Elevated reservoir east of the cathedral (waterfall source). */
  reservoirY: 140,
  reservoirCx: 50,
  reservoirCz: -30,
} as const;

const PLAINS_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 120 };
const RIDGE_FBM: FbmOptions = { octaves: 4, persistence: 0.55, lacunarity: 2.1, frequency: 1 / 90 };
const SALT = 0xc10d51e1;

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

function terraceHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  const dx = wx - CLOUDSPIRE.centerX;
  const dz = wz - CLOUDSPIRE.centerZ;
  const cheb = Math.max(Math.abs(dx), Math.abs(dz));
  const plains =
    CLOUDSPIRE.plainsY +
    fbm2D(noise, wx, wz, PLAINS_FBM) * 4 +
    fbm2D(noise, wx + 40, wz - 20, RIDGE_FBM) * 6;

  // Distant mountain ridges (north / west) for fog silhouettes.
  const ridgeBoost =
    Math.max(0, 1 - Math.abs(wz + 260) / 80) * 55 + Math.max(0, 1 - Math.abs(wx - 240) / 70) * 40;

  if (cheb <= CLOUDSPIRE.palaceRadius) return CLOUDSPIRE.palaceY;
  if (cheb <= CLOUDSPIRE.gardenRadius) {
    const t =
      (cheb - CLOUDSPIRE.palaceRadius) / (CLOUDSPIRE.gardenRadius - CLOUDSPIRE.palaceRadius);
    return CLOUDSPIRE.palaceY + (CLOUDSPIRE.gardenY - CLOUDSPIRE.palaceY) * smoothstep(t);
  }
  if (cheb <= CLOUDSPIRE.outerRadius) {
    const t = (cheb - CLOUDSPIRE.gardenRadius) / (CLOUDSPIRE.outerRadius - CLOUDSPIRE.gardenRadius);
    return CLOUDSPIRE.gardenY + (CLOUDSPIRE.groundY - CLOUDSPIRE.gardenY) * smoothstep(t);
  }
  if (cheb >= CLOUDSPIRE.skirtRadius) return plains + ridgeBoost * 0.35;

  const t = (cheb - CLOUDSPIRE.outerRadius) / (CLOUDSPIRE.skirtRadius - CLOUDSPIRE.outerRadius);
  // Steep cliff-like drop off the outer terrace with residual ridges.
  const cliff = CLOUDSPIRE.groundY + (plains + ridgeBoost - CLOUDSPIRE.groundY) * smoothstep(t * t);
  return cliff;
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

/** Deterministic ground height for scatter overlays outside the citadel. */
export function cloudspireSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(terraceHeight(noiseFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

/**
 * Authored terrace grade at (wx,wz), seed-independent. Inside the citadel envelope
 * (Chebyshev radius <= outerRadius) the terrain is pure terrace math with no noise, so site
 * stamps can grade paths, gardens, and props onto the exact surface the generator produced —
 * the fix for garden features authored below grade and buried under the natural cap.
 */
export function cloudspireTerraceY(wx: number, wz: number): number {
  const dx = wx - CLOUDSPIRE.centerX;
  const dz = wz - CLOUDSPIRE.centerZ;
  const cheb = Math.max(Math.abs(dx), Math.abs(dz));
  if (cheb <= CLOUDSPIRE.palaceRadius) return CLOUDSPIRE.palaceY;
  if (cheb <= CLOUDSPIRE.gardenRadius) {
    const t =
      (cheb - CLOUDSPIRE.palaceRadius) / (CLOUDSPIRE.gardenRadius - CLOUDSPIRE.palaceRadius);
    return Math.round(
      CLOUDSPIRE.palaceY + (CLOUDSPIRE.gardenY - CLOUDSPIRE.palaceY) * smoothstep(t),
    );
  }
  const t = (cheb - CLOUDSPIRE.gardenRadius) / (CLOUDSPIRE.outerRadius - CLOUDSPIRE.gardenRadius);
  return Math.round(
    CLOUDSPIRE.gardenY + (CLOUDSPIRE.groundY - CLOUDSPIRE.gardenY) * smoothstep(Math.min(1, t)),
  );
}

const DIRT_BAND = 3;

class TerraceField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = noiseFor(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const h = clampInt(terraceHeight(noise, worldX, worldZ), 1, WORLD_HEIGHT - 1);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;
        const cap = h <= ctx.seaLevel + 1 ? SAND : GRASS;
        const band = cap === SAND ? SAND : DIRT;
        for (let y = 0; y <= h; y++) {
          let block = STONE;
          if (y === h) block = cap;
          else if (y >= h - DIRT_BAND) block = band;
          else if (y < h - 18) block = ROCK;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}

/** Multi-terrace mountain pad for Cloudspire Citadel. */
export function createCloudspireGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [
      new TerraceField(),
      new CaveCarver({ threshold: 0.12, frequency: 1 / 28, floorMargin: 5 }),
      new WaterFiller(),
      new OreScatterer({ densityScale: 1.0 }),
      new CaveTorcher({ density: 0.03 }),
    ],
    SEA_LEVEL,
  );
}
