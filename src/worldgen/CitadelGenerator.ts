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
 * Geometry of the citadel site, in world coordinates. The fortress sits on a flat square mesa
 * centred here; both this terrain generator and the site overlay read these constants so the
 * walls / towers / dungeon line up exactly with the flattened ground (no floating or buried
 * foundations). Spawn is (8, _, 8), so a player descending lands inside the courtyard.
 */
export const CITADEL = {
  centerX: 8,
  centerZ: 8,
  /** Top solid block of the courtyard — the flat mesa cap. Buildings stamp from groundY+1 up. */
  groundY: 80,
  /** Chebyshev half-width of the perfectly flat mesa top (covers walls + corner towers + margin). */
  plateauRadius: 64,
  /** Chebyshev distance at which the slope has fully returned to the surrounding plains. */
  skirtRadius: 120,
  /** Surrounding plains height the mesa slopes down to. */
  plainsY: 66,
} as const;

const PLAINS_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 110 };
const SALT = 0xc17ade1; // distinct noise channel for the citadel terrain

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

/**
 * Raw (un-rounded) surface height for a column: a perfectly flat mesa top inside `plateauRadius`,
 * a smooth slope out to `skirtRadius`, and gently rolling plains beyond. Chebyshev distance gives
 * the mesa a square footprint that matches the square curtain wall.
 */
function plateauHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  const cheb = Math.max(Math.abs(wx - CITADEL.centerX), Math.abs(wz - CITADEL.centerZ));
  const plains = CITADEL.plainsY + fbm2D(noise, wx, wz, PLAINS_FBM) * 3;
  if (cheb <= CITADEL.plateauRadius) return CITADEL.groundY;
  if (cheb >= CITADEL.skirtRadius) return plains;
  const t = (cheb - CITADEL.plateauRadius) / (CITADEL.skirtRadius - CITADEL.plateauRadius);
  return CITADEL.groundY + (plains - CITADEL.groundY) * smoothstep(t);
}

// One simplex sampler per seed, shared by the terrain stage and the public surfaceAt helper, so
// scattered outlying structures snap to the very same ground the generator builds (no drift).
const noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();
function noiseFor(seed: WorldSeed): NoiseFunction2D {
  let n = noiseBySeed.get(seed);
  if (!n) {
    n = createNoise2D(mulberry32((seed ^ SALT) >>> 0));
    noiseBySeed.set(seed, n);
  }
  return n;
}

/** Deterministic ground height the scatter overlays snap outlying ruins/landmarks to. */
export function citadelSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(plateauHeight(noiseFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

const DIRT_BAND = 3;

/**
 * Heightmap + surface paint for the citadel mesa: a flat grass top for the fortress, a sloped
 * skirt, and plains beyond. Fills ctx.heights so the reused CaveCarver / WaterFiller / ore / torch
 * stages carve and decorate beneath it exactly as in the default world.
 */
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

/**
 * The citadel terrain: a flat mesa to seat the fortress, with natural caves + ore below for
 * spelunking that connects to the authored dungeon. Caves are a touch roomier than the default.
 */
export function createCitadelGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [
      new PlateauField(),
      new CaveCarver({ threshold: 0.1, frequency: 1 / 26, floorMargin: 5 }),
      new WaterFiller(),
      new OreScatterer({ densityScale: 1.25 }),
      new CaveTorcher({ density: 0.05 }),
    ],
    SEA_LEVEL,
  );
}
