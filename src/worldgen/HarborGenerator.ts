import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { GRASS, DIRT, STONE, SAND } from '../blocks/blocks';
import { fbm2D, type FbmOptions } from './fbm';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { LayeredGenerator } from './LayeredGenerator';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/**
 * Geometry of the harbor site, in world coordinates. The coast runs north–south; the sea lies to
 * the EAST (+x) and the land rises to the WEST (−x). Both this terrain generator and the site
 * overlay read these constants so the quay wall, piers, and hillside houses line up exactly with
 * the flat waterfront bench (no floating docks or buried foundations). The town centre sits over
 * the origin, so the default spawn (8, _, 8) drops the player straight onto the open quay plaza.
 */
export const HARBOR = {
  /** East of this world-x is open water; the quay wall stands at the waterline. */
  shoreX: 22,
  /** The flat waterfront bench height — one block above the sea. Docks + plaza sit here. */
  quayY: SEA_LEVEL + 1, // 63
  /** The bench runs flat from the shore back to here, then the hillside begins to climb. */
  benchWestX: -10,
  /** Where the hill reaches its crest — a compact, steep slope so the town terraces tightly. */
  hillCrestX: -70,
  /** Height of the hill crest (well above the quay, within the ~130-block headroom). */
  hillTopY: SEA_LEVEL + 34, // 96
} as const;

const HILL_FBM: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 70 };
const SHORE_FBM: FbmOptions = { octaves: 2, persistence: 0.5, lacunarity: 2, frequency: 1 / 34 };
const SALT = 0x8a2b04; // distinct noise channel for the harbor terrain

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

/** The wobbling shoreline x at a given world-z, so the coast isn't a ruler-straight line. */
function shoreAt(noise: NoiseFunction2D, wz: number): number {
  return HARBOR.shoreX + fbm2D(noise, 777, wz, SHORE_FBM) * 2;
}

/**
 * Raw (un-rounded) surface height for a column: a sea floor sloping down offshore (flooded to sea
 * level by the WaterFiller), a perfectly flat waterfront bench for the quay and docks, and a
 * smoothly rising, gently rolling hillside inland to seat the terraced town.
 */
function harborHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  const shore = shoreAt(noise, wz);
  if (wx >= shore) {
    const d = wx - shore;
    return SEA_LEVEL - Math.min(3 + d * 0.6, 14); // shallow at the shore → deeper offshore
  }
  if (wx >= HARBOR.benchWestX) return HARBOR.quayY; // flat bench
  const t = (HARBOR.benchWestX - wx) / (HARBOR.benchWestX - HARBOR.hillCrestX);
  const rise = smoothstep(t) * (HARBOR.hillTopY - HARBOR.quayY);
  const roll = fbm2D(noise, wx, wz, HILL_FBM) * 4;
  return HARBOR.quayY + rise + roll;
}

// One simplex sampler per seed, shared by the terrain stage and the public surfaceAt helper, so
// scattered trees snap to the very same ground the generator builds (no drift).
const noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();
function noiseFor(seed: WorldSeed): NoiseFunction2D {
  let n = noiseBySeed.get(seed);
  if (!n) {
    n = createNoise2D(mulberry32((seed ^ SALT) >>> 0));
    noiseBySeed.set(seed, n);
  }
  return n;
}

/** Deterministic ground height the tree overlay snaps saplings to. */
export function harborSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(harborHeight(noiseFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

const DIRT_BAND = 3;

/**
 * Heightmap + surface paint for the harbor coast: a sand sea floor, a grassy bench with a sandy
 * beach strip at the waterline, and a grass hillside inland. Fills ctx.heights so the reused
 * WaterFiller floods the basin to sea level and the OreScatterer seeds the rock beneath.
 */
class HarborField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = noiseFor(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const h = clampInt(harborHeight(noise, worldX, worldZ), 1, WORLD_HEIGHT - 1);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;
        const shore = shoreAt(noise, worldZ);
        const underwater = h < ctx.seaLevel;
        const beach = !underwater && worldX >= shore - 3; // a thin sandy strip at the waterline
        const cap = underwater || beach ? SAND : GRASS;
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
 * The harbor terrain: a coastline with an open sea to the east and a rising town hillside to the
 * west. No caves — the ground stays solid so the quay, piers, and terraced houses always rest on
 * rock. A touch of gravel-free ore gives the inland rock something to mine.
 */
export function createHarborGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [new HarborField(), new WaterFiller(), new OreScatterer({ densityScale: 0.9 })],
    SEA_LEVEL,
  );
}
