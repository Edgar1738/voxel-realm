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
  SNOW,
} from '../blocks/blocks';
import { fbm2D, type FbmOptions } from './fbm';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { LayeredGenerator } from './LayeredGenerator';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/**
 * Hollowmere — a fertile valley village grown around a flooded older settlement,
 * beneath a distant stratovolcano. Terrain and site overlays share these constants.
 *
 * Axes: +z south (arrival), −z north (volcano), origin near the drowned basin.
 */
export const HOLLOWMERE = {
  /** Flooded lost-village basin (inner valley). */
  basin: { cx: 0, cz: -2, r: 28, floorY: 56 },
  /** Living-village street level around the basin rim. */
  livingY: 66,
  /** Outer valley floor (farms, paths). */
  valleyY: 67,
  /** River channel south of the living village (east–west flow). */
  river: { zCenter: 72, halfW: 5, bedY: 57 },
  /** Covered-bridge crossing on the main road. */
  bridge: { x: 6, z: 72 },
  /** Arrival hamlet just north of the river. */
  hamlet: { cx: 6, cz: 56 },
  /** Market square (social center). */
  market: { cx: 2, cz: 36 },
  /** West hillside district. */
  hillside: { crestX: -48, crestY: 82 },
  /** Watermill on the east river bend. */
  mill: { x: 46, z: 70 },
  /** Drowned Bell Tower (hero landmark of the lost village). */
  bell: { cx: 0, cz: -6 },
  /** Stratovolcano north of the valley (NOT a crater city) — close enough to read as silhouette. */
  volcano: { cx: 28, cz: -145, baseR: 70, peakY: 168, craterR: 11 },
  /** Foothill transition belt between valley and volcano. */
  foothills: { z0: -70, z1: -120 },
  /** Forest arrival / spawn — far enough that the full village isn't visible at once. */
  spawn: { x: 6, y: 71.5, z: 122, yaw: 0 }, // look north (−z)
  /** Main road spine (south → north toward basin). */
  roadX: 6,
} as const;

const VALLEY_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 90 };
const DETAIL_FBM: FbmOptions = { octaves: 2, persistence: 0.45, lacunarity: 2, frequency: 1 / 28 };
const SALT = 0x484f4c4c; // 'HOLL'

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

function dist2(wx: number, wz: number, cx: number, cz: number): number {
  const dx = wx - cx;
  const dz = wz - cz;
  return Math.sqrt(dx * dx + dz * dz);
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

/**
 * Authored height for Hollowmere:
 * green valley + organic river + flooded basin + west hills + distant stratovolcano.
 */
function hollowmereHeight(noise: NoiseFunction2D, wx: number, wz: number): number {
  const H = HOLLOWMERE;
  const roll = fbm2D(noise, wx, wz, VALLEY_FBM) * 2.4;
  const detail = fbm2D(noise, wx * 1.3, wz * 1.3, DETAIL_FBM) * 1.1;

  // Base fertile valley, slightly higher to the south (arrival forest).
  let h = H.valleyY + roll + detail;
  if (wz > 85) h += smoothstep((wz - 85) / 40) * 3; // forest rise
  if (wz < -40 && wz > H.foothills.z0) {
    // gentle climb toward foothills
    h += smoothstep((-40 - wz) / 55) * 4;
  }

  // West hillside: rise as x decreases.
  if (wx < -12) {
    const t = smoothstep((-12 - wx) / (H.hillside.crestX * -1 - 8));
    h = Math.max(h, H.livingY + t * (H.hillside.crestY - H.livingY) + roll * 0.5);
  }

  // East gentle farm rise.
  if (wx > 30) {
    h += smoothstep((wx - 30) / 40) * 3;
  }

  // Living-village bench: keep streets walkable around the basin rim.
  const basinD = dist2(wx, wz, H.basin.cx, H.basin.cz);
  if (basinD > H.basin.r + 2 && basinD < H.basin.r + 38 && wz < 62 && wz > -55) {
    const rim = H.livingY + roll * 0.35;
    // Prefer the bench without erasing hill/farm slopes entirely.
    if (wx > -40 && wx < 40) h = Math.max(h * 0.35 + rim * 0.65, rim - 1);
  }

  // Flooded basin: organic not-perfect circle, slightly elongated east–west.
  const basinNx = (wx - H.basin.cx) / (H.basin.r * 1.15);
  const basinNz = (wz - H.basin.cz) / H.basin.r;
  const basinEll = Math.sqrt(basinNx * basinNx + basinNz * basinNz);
  const basinWobble = 1 + fbm2D(noise, wx * 0.08, wz * 0.08, DETAIL_FBM) * 0.08;
  if (basinEll < basinWobble) {
    const edge = smoothstep((basinWobble - basinEll) / 0.35);
    const floor = H.basin.floorY + (1 - edge) * 2 + detail * 0.3;
    // Stepped rim so the transition feels like an old shore.
    if (basinEll > basinWobble - 0.22) {
      h = Math.min(h, H.livingY - 2 - edge * 4);
    } else {
      h = Math.min(h, floor);
    }
  }

  // River channel (east–west), wobbling, south of the village.
  const riverWobble = fbm2D(noise, 900, wz * 0.02 + wx * 0.04, DETAIL_FBM) * 3.5;
  const riverZ = H.river.zCenter + riverWobble;
  const riverDist = Math.abs(wz - riverZ);
  // Narrow near bridge, wider near mill (east).
  const halfW = H.river.halfW + (wx > 25 ? 2 : 0) + (wx < -20 ? 1 : 0);
  if (riverDist < halfW + 1.5 && wx > -55 && wx < 85) {
    const t = smoothstep(1 - riverDist / (halfW + 1.5));
    const bed = H.river.bedY + (1 - t) * 2;
    h = Math.min(h, bed + (1 - t) * 3);
  }

  // Stream fingers from foothills into the basin (visual drainage story).
  if (wz < -40 && wz > -110) {
    const streamX = 8 + fbm2D(noise, wx * 0.05, 400, DETAIL_FBM) * 6;
    const sd = Math.abs(wx - streamX);
    if (sd < 2.5) {
      const t = smoothstep(1 - sd / 2.5);
      h = Math.min(h, SEA_LEVEL - 1 - t * 3);
    }
  }

  // Stratovolcano — large cone beyond the valley, not enclosing the village.
  const v = H.volcano;
  const vd = dist2(wx, wz, v.cx, v.cz);
  if (vd < v.baseR * 1.35) {
    const u = 1 - Math.min(vd / v.baseR, 1.2);
    // Smooth cone with a slightly steeper upper third.
    const cone = Math.pow(Math.max(u, 0), 1.15);
    let volcanoH = H.valleyY + 6 + cone * (v.peakY - H.valleyY - 6);
    // Summit crater cup.
    if (vd < v.craterR + 4) {
      const craterT = smoothstep(1 - vd / (v.craterR + 4));
      volcanoH -= craterT * 14;
    }
    // Lava-scar ridges (subtle height breaks).
    const scar = fbm2D(noise, wx * 0.03, wz * 0.03, VALLEY_FBM);
    if (scar > 0.35 && vd < v.baseR * 0.85) volcanoH -= (scar - 0.35) * 6;
    h = Math.max(h, volcanoH);
  }

  // Foothill dark-rock knolls between valley and volcano.
  if (wz < H.foothills.z0 && wz > H.foothills.z1 && vd > v.baseR * 0.9) {
    const knoll = fbm2D(noise, wx * 0.06, wz * 0.06, VALLEY_FBM);
    if (knoll > 0.25) h += (knoll - 0.25) * 10;
  }

  // Clamp walkable headroom.
  return clampInt(h, 8, WORLD_HEIGHT - 8);
}

/** Deterministic ground height for overlays (trees, foundations). */
export function hollowmereSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return hollowmereHeight(noiseFor(seed), wx, wz);
}

const DIRT_BAND = 3;

/**
 * Surface paint: lush grass in the valley, sand/mud near water, dark volcanic rock on the mountain.
 */
class HollowmereField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const noise = noiseFor(ctx.seed);
    const H = HOLLOWMERE;
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const h = hollowmereHeight(noise, worldX, worldZ);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;

        const vd = dist2(worldX, worldZ, H.volcano.cx, H.volcano.cz);
        const basinD = dist2(worldX, worldZ, H.basin.cx, H.basin.cz);
        const underwater = h < ctx.seaLevel;
        const nearRiver =
          Math.abs(worldZ - (H.river.zCenter + fbm2D(noise, 900, worldX * 0.04, DETAIL_FBM) * 3)) <
          8;
        const volcanic = vd < H.volcano.baseR * 1.05;
        const foothill =
          worldZ < H.foothills.z0 && worldZ > H.foothills.z1 && vd < H.volcano.baseR * 1.4;
        const snowCap = volcanic && h > H.volcano.peakY - 28;

        let cap = GRASS;
        let band = DIRT;
        if (underwater) {
          if (basinD < H.basin.r + 4) {
            cap = MUD;
            band = MUD;
          } else if (nearRiver) {
            cap = SAND;
            band = SAND;
          } else {
            cap = GRAVEL;
            band = GRAVEL;
          }
        } else if (snowCap) {
          cap = SNOW;
          band = GRAVEL;
        } else if (volcanic && h > SEA_LEVEL + 20) {
          // Dark upper slopes.
          cap = h > H.volcano.peakY - 50 ? DEEPSLATE : TERRACOTTA;
          band = DEEPSLATE;
        } else if (foothill && h > SEA_LEVEL + 8) {
          const rock = fbm2D(noise, worldX * 0.1, worldZ * 0.1, DETAIL_FBM);
          if (rock > 0.2) {
            cap = GRAVEL;
            band = DEEPSLATE;
          } else if (rock > 0) {
            cap = TERRACOTTA;
            band = DIRT;
          }
        } else if (nearRiver && h <= SEA_LEVEL + 2) {
          cap = SAND;
          band = SAND;
        } else if (basinD < H.basin.r + 6 && h <= H.livingY - 1) {
          // Mossy/muddy shore of the lost village.
          cap = fbm2D(noise, worldX, worldZ, DETAIL_FBM) > 0 ? MUD : GRASS;
          band = DIRT;
        }

        for (let y = 0; y <= h; y++) {
          let block = STONE;
          if (y === h) block = cap;
          else if (y >= h - DIRT_BAND) block = band;
          else if (volcanic && y > h - 18) block = DEEPSLATE;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}

/** Hollowmere terrain: no caves (solid under village + volcano), water-filled basins, sparse ore. */
export function createHollowmereGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [new HollowmereField(), new WaterFiller(), new OreScatterer({ densityScale: 0.7 })],
    SEA_LEVEL,
  );
}
