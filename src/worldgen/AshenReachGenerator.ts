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
/**
 * Official identity (Milestone 2+): permanent Voxel Realm world — not an experiment name.
 * Preset / save ID: `ashen-reach`. Display title: Ashen Reach.
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
  /**
   * Hero island in the lake: seats The Ember Spire. Top sits above the waterline so the tower
   * rises from rock, not from open water — readable silhouette from Emberhold and the rim.
   */
  spireIsland: { cx: 0, cz: 96, r: 12, topY: 66 },
  /** Caldera Gate District bench on the north shore. */
  village: { cx: 8, cz: 6, rx: 42, rz: 34, benchY: 68 },
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
  /**
   * Arrival approach north of the district: enclosed pass → Crater Gate → first reveal.
   * Spawn sits in the pass; look south toward the gate.
   */
  arrival: {
    spawnX: 8,
    spawnY: 71.5,
    spawnZ: -48,
    passZ0: -56,
    passZ1: -30,
    passHalfW: 4,
    passY: 70,
    wallY: 86,
  },
  /** West-rim observatory knoll (secondary). */
  observatory: { cx: -92, cz: 96, r: 14, y: 118 },
  /** Magma fissure the ash bridge spans (east shore approach). */
  fissure: { cx: 48, cz: 72, halfLen: 14, halfW: 3 },
  /** East-rim ash mines (secondary destination). */
  mine: { cx: 78, cz: 108, mouthY: 88 },
  /** NW cliff monastery shelf (secondary). */
  monastery: { cx: -62, cz: 48, r: 16, y: 102 },
  /** SE basalt cliff horn (geological landmark). */
  cliffHorn: { cx: 58, cz: 148, r: 18, y: 128 },
  /** SW ash ravine cut (geological landmark). */
  ravine: { cx: -48, cz: 148, halfW: 6, halfL: 22, floorY: 78 },
  /** NE terraced rim shelf. */
  terraceShelf: { cx: 70, cz: 40, r: 14, y: 96 },
  /** Drowned ruins shallows (west lake, secondary). */
  drowned: { cx: -28, cz: 100, r: 8 },
} as const;

/**
 * Authored ash road with target elevations. Terrain grades a walkable corridor toward these
 * heights; the site overlay paves the same line. Order: plaza → bridge → south shore → observatory.
 */
export const ASHEN_ROAD: ReadonlyArray<{ x: number; z: number; y: number }> = [
  { x: 8, z: 10, y: 68 },
  { x: 12, z: 28, y: 67 },
  { x: 20, z: 44, y: 65 },
  { x: 32, z: 56, y: 64 },
  { x: 48, z: 64, y: 64 }, // fissure bridge north
  { x: 48, z: 80, y: 64 }, // past fissure
  { x: 36, z: 100, y: 66 },
  { x: 12, z: 118, y: 70 },
  { x: -20, z: 124, y: 76 },
  { x: -52, z: 118, y: 92 },
  { x: -72, z: 108, y: 104 },
  { x: -88, z: 100, y: 116 }, // observatory approach
];

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

/** Soft radial mask for a circular feature (1 at center → 0 at r). */
function radialMask(wx: number, wz: number, cx: number, cz: number, r: number): number {
  const t = Math.hypot(wx - cx, wz - cz) / r;
  if (t >= 1) return 0;
  return (1 - t * t) ** 1.35;
}

/** Observatory knoll mask on the west rim. */
function knollMask(wx: number, wz: number): number {
  return radialMask(wx, wz, ASHEN.observatory.cx, ASHEN.observatory.cz, ASHEN.observatory.r);
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

/** Distance + interpolated target Y along ASHEN_ROAD (for grading a walkable corridor). */
function projectRoad(wx: number, wz: number): { dist: number; y: number } {
  let best = Infinity;
  let bestY = ASHEN.terraceY;
  for (let i = 0; i < ASHEN_ROAD.length - 1; i++) {
    const a = ASHEN_ROAD[i];
    const b = ASHEN_ROAD[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    let u = ((wx - a.x) * dx + (wz - a.z) * dz) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const dist = Math.hypot(wx - px, wz - pz);
    if (dist < best) {
      best = dist;
      bestY = a.y + (b.y - a.y) * u;
    }
  }
  return { dist: best, y: bestY };
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

  // 1) Lake basin: flooded bowl, with a dry basalt island under the Ember Spire.
  if (d < ASHEN.lake.r) {
    const ix = wx - ASHEN.spireIsland.cx;
    const iz = wz - ASHEN.spireIsland.cz;
    const id = Math.hypot(ix, iz);
    if (id < ASHEN.spireIsland.r) {
      // Soft cone island rising above the waterline.
      const t = id / ASHEN.spireIsland.r;
      const island = lerp(ASHEN.spireIsland.topY, ASHEN.shoreY - 1, t * t);
      return island + detail * 0.8;
    }
    const m = lakeMask(d);
    // Bowl: deeper mid-ring (around the island), rising toward the beach.
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

  // ── Milestone 2: large authored geological landmarks (break up procedural rim noise) ──
  // SE basalt cliff horn — a single massive silhouette for orientation.
  {
    const m = radialMask(wx, wz, ASHEN.cliffHorn.cx, ASHEN.cliffHorn.cz, ASHEN.cliffHorn.r);
    if (m > 0) h = Math.max(h, lerp(h, ASHEN.cliffHorn.y, m) + rimN * 2);
  }
  // NW monastery shelf — walkable flat for the cliff complex.
  {
    const m = radialMask(wx, wz, ASHEN.monastery.cx, ASHEN.monastery.cz, ASHEN.monastery.r);
    if (m > 0.2) h = lerp(h, ASHEN.monastery.y + detail * 0.3, Math.min(1, m * 1.4));
  }
  // NE terraced rim shelf.
  {
    const m = radialMask(wx, wz, ASHEN.terraceShelf.cx, ASHEN.terraceShelf.cz, ASHEN.terraceShelf.r);
    if (m > 0.25) h = lerp(h, ASHEN.terraceShelf.y, Math.min(1, m * 1.3));
  }
  // SW ash ravine — deep cut for a recognizable gap in the wall.
  {
    const dx = (wx - ASHEN.ravine.cx) / ASHEN.ravine.halfW;
    const dz = (wz - ASHEN.ravine.cz) / ASHEN.ravine.halfL;
    const e = dx * dx + dz * dz;
    if (e < 1) {
      const cut = (1 - e) * (h - ASHEN.ravine.floorY);
      h = Math.max(ASHEN.ravine.floorY, h - cut);
    }
  }
  // Drowned-ruins shallows: tiny basalt knuckles west of the island (still mostly open water).
  {
    const m = radialMask(wx, wz, ASHEN.drowned.cx, ASHEN.drowned.cz, ASHEN.drowned.r);
    if (m > 0 && d < ASHEN.lake.r) {
      const rise = lerp(ASHEN.lake.floorY, SEA_LEVEL - 1, m);
      h = Math.max(h, rise);
    }
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

  // Arrival pass north of the district: flat floor + raised walls (enclosed approach → reveal).
  {
    const A = ASHEN.arrival;
    if (wz >= A.passZ0 && wz <= A.passZ1) {
      const dx = Math.abs(wx - A.spawnX);
      if (dx <= A.passHalfW) {
        h = A.passY + detail * 0.2;
      } else if (dx <= A.passHalfW + 8) {
        const t = (dx - A.passHalfW) / 8;
        h = Math.max(h, lerp(A.passY + 2, A.wallY, smoothstep01(t)) + rimN * 2);
      }
    }
  }

  // Grade a walkable corridor along the ash road (single-block steps, not cliff climbs).
  const road = projectRoad(wx, wz);
  if (road.dist < 5.5) {
    const blend = 1 - smoothstep01(road.dist / 5.5);
    h = lerp(h, road.y, blend * 0.92);
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
  // Spire island top (above water) is basalt.
  {
    const id = Math.hypot(wx - ASHEN.spireIsland.cx, wz - ASHEN.spireIsland.cz);
    if (id < ASHEN.spireIsland.r && h >= SEA_LEVEL) return { top: DEEPSLATE, band: DEEPSLATE };
  }
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
