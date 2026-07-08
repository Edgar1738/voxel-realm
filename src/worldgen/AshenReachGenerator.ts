import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import {
  GRASS,
  DIRT,
  STONE,
  SAND,
  GRAVEL,
  DEEPSLATE,
  TERRACOTTA,
  MUD,
} from '../blocks/blocks';
import { fbm2D, type FbmOptions } from './fbm';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { LayeredGenerator } from './LayeredGenerator';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { BlockId, WorldSeed } from '../core/types';

/**
 * Ashen Reach: a volcanic caldera kingdom around a dark crater lake.
 *
 * Composition (looking down, +z south):
 *   - Crater lake south of spawn, flooded to sea level with a deep slate floor
 *   - Black-sand beach ring, then a raised ash terrace for Emberhold village (north shore)
 *   - A basalt rim wall with one high observatory knoll on the west
 *   - Outer ash slopes rolling away beyond the rim
 *
 * Terrain and site overlays share these constants so architecture seats on the ground.
 */
export const ASHEN = {
  /** Heart of the crater lake. */
  caldera: { cx: 0, cz: 96 },
  /** Circular lake: floor deep enough to read dark from the terrace. */
  lake: { r: 40, floorY: 46 },
  /** Sandy/gravel beach width outside the waterline. */
  beachWidth: 7,
  /** First solid shore step just above water. */
  shoreY: SEA_LEVEL + 1, // 63
  /** Emberhold village bench on the north shore (covers default spawn at ~8,8). */
  village: { cx: 8, cz: 6, rx: 38, rz: 30, benchY: 68 },
  /** Mid ash terrace between beach and rim. */
  terraceY: 68,
  /** Inner radius where the rim climb begins. */
  rimInner: 88,
  /** Peak of the basalt rim wall. */
  rimPeakY: 112,
  /** Outer radius of the rim crest before the land falls away. */
  rimOuter: 128,
  /** Gentle outer ash plains beyond the rim. */
  outerY: 78,
  /** West-rim observatory knoll (seated on the rim crest). */
  observatory: { cx: -92, cz: 96, r: 14, y: 118 },
  /** Magma fissure the ash bridge spans (east shore approach). */
  fissure: { cx: 48, cz: 72, halfLen: 14, halfW: 3 },
} as const;

const DETAIL_FBM: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 55 };
const MACRO_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 160 };
const RIM_FBM: FbmOptions = { octaves: 3, persistence: 0.55, lacunarity: 2.1, frequency: 1 / 42 };

const SALT = 0xa54e01;

function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Radial distance from the caldera heart, with slight elliptical squash (east–west wider). */
function calderaDist(wx: number, wz: number): number {
  const dx = (wx - ASHEN.caldera.cx) / 1.08;
  const dz = (wz - ASHEN.caldera.cz) / 0.96;
  return Math.hypot(dx, dz);
}

/** Superellipse falloff inside the lake: 1 at center → 0 at rim. */
function lakeMask(d: number): number {
  const t = d / ASHEN.lake.r;
  if (t >= 1) return 0;
  return 1 - t * t;
}

/** Village bench mask: soft ellipse around the north-shore hamlet (1 = fully flattened). */
function villageMask(wx: number, wz: number): number {
  const dx = (wx - ASHEN.village.cx) / ASHEN.village.rx;
  const dz = (wz - ASHEN.village.cz) / ASHEN.village.rz;
  const e = Math.sqrt(dx * dx + dz * dz);
  if (e >= 1) return 0;
  // Hold flat through the core, then soft falloff near the rim of the ellipse.
  if (e < 0.72) return 1;
  return 1 - smoothstep01((e - 0.72) / 0.28);
}

/** Observatory knoll mask on the west rim. */
function knollMask(wx: number, wz: number): number {
  const dx = wx - ASHEN.observatory.cx;
  const dz = wz - ASHEN.observatory.cz;
  const t = Math.hypot(dx, dz) / ASHEN.observatory.r;
  if (t >= 1) return 0;
  return (1 - t * t) ** 1.4;
}

interface Samplers {
  detail: NoiseFunction2D;
  macro: NoiseFunction2D;
  rim: NoiseFunction2D;
}

const samplersBySeed = new Map<WorldSeed, Samplers>();

function samplersFor(seed: WorldSeed): Samplers {
  let s = samplersBySeed.get(seed);
  if (!s) {
    const mk = (salt: number): NoiseFunction2D =>
      createNoise2D(mulberry32((seed ^ salt) >>> 0));
    s = { detail: mk(SALT), macro: mk(SALT + 1), rim: mk(SALT + 2) };
    samplersBySeed.set(seed, s);
  }
  return s;
}

/**
 * Raw surface height for a world column. Authored radial profile with noise jitter so the rim
 * reads as broken basalt, not a perfect cone.
 */
function ashenHeight(noise: Samplers, wx: number, wz: number): number {
  const d = calderaDist(wx, wz);
  const detail = fbm2D(noise.detail, wx, wz, DETAIL_FBM);
  const macro = fbm2D(noise.macro, wx, wz, MACRO_FBM);
  const rimN = fbm2D(noise.rim, wx, wz, RIM_FBM);

  // 1) Lake basin floor (flooded by WaterFiller).
  if (d < ASHEN.lake.r) {
    const m = lakeMask(d);
    // Bowl: deeper center, rising toward the beach.
    const bowl = lerp(ASHEN.lake.floorY, ASHEN.shoreY - 2, 1 - m);
    return bowl + detail * 1.2;
  }

  // 2) Beach strip just outside the waterline.
  const beachOuter = ASHEN.lake.r + ASHEN.beachWidth;
  if (d < beachOuter) {
    const t = (d - ASHEN.lake.r) / ASHEN.beachWidth;
    return lerp(ASHEN.shoreY - 1, ASHEN.shoreY + 1, smoothstep01(t)) + detail * 0.6;
  }

  // 3) Climb from beach to ash terrace, then basalt rim, then outer plains.
  const terraceStart = beachOuter;
  const terraceEnd = ASHEN.rimInner - 10; // ~78
  const rimCrestStart = ASHEN.rimInner + 8; // ~96 — start of high crest plateau
  let h: number;
  if (d < terraceEnd) {
    const t = (d - terraceStart) / Math.max(1, terraceEnd - terraceStart);
    h = lerp(ASHEN.shoreY + 1, ASHEN.terraceY, smoothstep01(t));
    h += detail * 1.8 + macro * 1.2;
  } else if (d < rimCrestStart) {
    // 4a) Steep climb from terrace to rim crest.
    const t = (d - terraceEnd) / Math.max(1, rimCrestStart - terraceEnd);
    h = lerp(ASHEN.terraceY, ASHEN.rimPeakY, smoothstep01(t));
    h += rimN * (3 + t * 5) + detail * 2;
  } else if (d < ASHEN.rimOuter) {
    // 4b) Jagged basalt crest plateau.
    const t = (d - rimCrestStart) / Math.max(1, ASHEN.rimOuter - rimCrestStart);
    h = ASHEN.rimPeakY - t * 6 + rimN * 5 + detail * 2;
  } else {
    // 5) Outer ash plains sloping gently down from the rim.
    const t = Math.min(1, (d - ASHEN.rimOuter) / 70);
    h = lerp(ASHEN.rimPeakY - 10, ASHEN.outerY, smoothstep01(t));
    h += macro * 3 + detail * 2.5;
  }

  // Flatten the village bench on the north shore (applied last so architecture seats cleanly).
  const vm = villageMask(wx, wz);
  if (vm > 0) {
    h = lerp(h, ASHEN.village.benchY + detail * 0.25, vm);
  }

  // Observatory knoll on the west rim crest.
  const km = knollMask(wx, wz);
  if (km > 0) {
    h = Math.max(h, lerp(h, ASHEN.observatory.y, km) + rimN * 1.5);
  }

  // Magma fissure trench on the east approach (site fills glowstone; terrain digs the bed).
  const fx = wx - ASHEN.fissure.cx;
  const fz = wz - ASHEN.fissure.cz;
  if (Math.abs(fx) <= ASHEN.fissure.halfW + 1 && Math.abs(fz) <= ASHEN.fissure.halfLen) {
    const edge = Math.max(
      Math.abs(fx) / (ASHEN.fissure.halfW + 1),
      Math.abs(fz) / ASHEN.fissure.halfLen,
    );
    if (edge < 1) {
      const cut = (1 - edge) * 8;
      h = Math.min(h, ASHEN.shoreY - 2 - cut);
    }
  }

  return h;
}

/** Deterministic ground height for overlays (trees, roads, foundations). */
export function ashenSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(ashenHeight(samplersFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

/** Resolve surface paint for the column at (wx,wz). */
function surfacePaint(seed: WorldSeed, wx: number, wz: number): { top: BlockId; band: BlockId } {
  const d = calderaDist(wx, wz);
  const h = ashenSurfaceAt(seed, wx, wz);
  if (h < SEA_LEVEL) {
    if (d < ASHEN.lake.r * 0.55) return { top: DEEPSLATE, band: DEEPSLATE };
    return { top: GRAVEL, band: STONE };
  }
  if (d < ASHEN.lake.r + ASHEN.beachWidth + 2) return { top: SAND, band: SAND };
  if (d < ASHEN.rimInner - 8) {
    const vm = villageMask(wx, wz);
    if (vm > 0.35) return { top: GRAVEL, band: DIRT };
    const n = fbm2D(samplersFor(seed).detail, wx * 1.7, wz * 1.7, DETAIL_FBM);
    if (n > 0.48) return { top: TERRACOTTA, band: DIRT };
    if (n < -0.4 && h >= ASHEN.terraceY - 2) return { top: GRASS, band: DIRT };
    if (n > 0.15 && n < 0.3) return { top: MUD, band: DIRT };
    return { top: GRAVEL, band: DIRT };
  }
  if (d < ASHEN.rimOuter + 6) {
    return h > ASHEN.rimPeakY - 14
      ? { top: DEEPSLATE, band: DEEPSLATE }
      : { top: GRAVEL, band: STONE };
  }
  const n = fbm2D(samplersFor(seed).macro, wx, wz, MACRO_FBM);
  if (n > 0.28) return { top: GRASS, band: DIRT };
  if (n < -0.35) return { top: MUD, band: DIRT };
  return { top: GRAVEL, band: DIRT };
}

const DIRT_BAND = 3;

/**
 * Heightmap + volcanic surface paint. Fills ctx.heights for WaterFiller / OreScatterer.
 * No caves — solid ground so architecture never floats over voids.
 */
class AshenField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = samplersFor(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const h = clampInt(ashenHeight(noise, worldX, worldZ), 1, WORLD_HEIGHT - 1);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;
        const { top, band } = surfacePaint(ctx.seed, worldX, worldZ);
        for (let y = 0; y <= h; y++) {
          let block: BlockId = STONE;
          if (y === h) block = top;
          else if (y >= h - DIRT_BAND) block = band;
          else if (y < h - 12 && top === DEEPSLATE) block = DEEPSLATE;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}

/** Crater lake + ash terraces + basalt rim. Solid ground, flooded basin, light ore. */
export function createAshenReachGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [new AshenField(), new WaterFiller(), new OreScatterer({ densityScale: 0.85 })],
    SEA_LEVEL,
  );
}
