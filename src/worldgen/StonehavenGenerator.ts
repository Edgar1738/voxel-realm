import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { GRASS, DIRT, STONE, SAND, GRAVEL, SNOW } from '../blocks/blocks';
import { fbm2D, type FbmOptions } from './fbm';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { LayeredGenerator } from './LayeredGenerator';
import { hash2 } from './CitadelStamp';
import {
  coniferVariants,
  oakVariants,
  birchVariants,
  oakScatterOptions,
  OAK_TRUNK_OFFSET,
} from './treePrefabs';
import { scatterStructures } from './Structures';
import {
  smoothstep01,
  lerp,
  clampInt,
  smin,
  superellipseT,
  directionalLobe,
  polylineProject,
  RouteSpline,
  type PolylinePoint,
  type RoutePoint,
} from './fields';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { Overlay } from './Generator';
import type { BlockId, WorldSeed } from '../core/types';

/**
 * Stonehaven: an ancient alpine kingdom around a deep mountain lake. The whole landscape is one
 * authored composition — a lake basin, a village bench on its north shore, a fortress crag on the
 * southwest shore, a stream gorge incising the eastern ascent, and a ring of peaks with a single
 * low pass to the northwest. The journey (harbor → village → forest road → waterfall → bridge →
 * gate → fortress → tower) half-circles the lake, so the destination stays in view across the
 * water. Both this terrain generator and the site overlays read these constants, so architecture
 * always seats exactly on the ground the generator builds.
 */
export const STONEHAVEN = {
  /** Composition center: the heart of the lake. Bearings are measured from here. */
  valley: { cx: 0, cz: 66 },
  /** The lake basin: waterline at SEA_LEVEL, floor deep enough to read black-blue from shore. */
  lake: { rx: 74, rz: 54, pow: 2.4, floorY: 42 },
  /** Valley floor around the lake (above the waterline so meadows drain). */
  floorY: 66,
  /** The village bench: a flattened apron on the north shore, centered on the world origin. */
  village: { cx: 0, cz: 0, rx: 54, rz: 34, benchY: 65 },
  /** The fortress crag: outer-ward plateau + inner keep knoll, cliffs toward the lake. */
  crag: {
    cx: -58,
    cz: 132,
    plateauY: 108,
    coreR: 26,
    /** Lower cliff-band benches stacked under the plateau, so the crag reads as layered rock. */
    tiers: [
      { r: 46, y: 74 },
      { r: 36, y: 88 },
    ],
    /** The keep knoll perches at the plateau's northwest edge, silhouetted above the lake. */
    knoll: { cx: -74, cz: 120, r: 9, y: 118 },
  },
  /**
   * The mountain ring rises in two phases from innerR(θ): a gentle forested apron, then a steep
   * ridged wall to the peak line. The apron keeps grass caps (so the conifer belt climbs it);
   * the wall paints as rock and carries the snow.
   */
  mountains: { innerR: 150, apronRun: 55, apronRise: 26, wallStart: 38, wallRun: 55, peakY: 152 },
  /** A hanging shelf behind the east shore; its lake-cut rim is the waterfall lip. */
  fallsBench: { cx: 102, cz: 108, r: 20, y: 92 },
  /** Ecology bands (jittered by macro noise at sample time). */
  treelineY: 105,
  snowlineY: 118,
} as const;

/** The stream that gorges the eastern ascent and falls into the lake (upstream → mouth). */
export const STONEHAVEN_STREAM: readonly PolylinePoint[] = [
  { x: 150, z: 128 },
  { x: 122, z: 118 },
  { x: 100, z: 110 },
  { x: 84, z: 104 },
  { x: 66, z: 96 },
];

/**
 * The journey road: village square → east shore → up onto the falls bench (the stone bridge
 * crosses the stream there) → down the southern seam → along the south shore with the fortress
 * ahead across the water → switchbacks up the crag's tier ramps → the ancient gate notch → the
 * outer ward. Elevations are authored; the terrain grades a walkable corridor toward them, so
 * every step of the climb is single-block or gentler.
 */
export const STONEHAVEN_ROAD: readonly RoutePoint[] = [
  { x: 16, z: 4, y: 65 },
  { x: 36, z: 8, y: 65 },
  { x: 56, z: 16, y: 66 },
  { x: 72, z: 32, y: 67 },
  { x: 83, z: 52, y: 68 },
  { x: 90, z: 70, y: 70 },
  { x: 95, z: 84, y: 76 },
  { x: 99, z: 96, y: 88 },
  { x: 100, z: 104, y: 92 },
  { x: 104, z: 116, y: 92 },
  { x: 107, z: 130, y: 84 },
  { x: 98, z: 148, y: 76 },
  { x: 74, z: 160, y: 71 },
  { x: 42, z: 168, y: 68 },
  { x: 8, z: 174, y: 67 },
  { x: -24, z: 170, y: 69 },
  { x: -44, z: 164, y: 72 },
  { x: -58, z: 176, y: 76 },
  { x: -80, z: 158, y: 82 },
  { x: -86, z: 145, y: 88 },
  { x: -76, z: 150, y: 94 },
  { x: -68, z: 142, y: 102 },
  { x: -58, z: 132, y: 108 },
];

const road = new RouteSpline(STONEHAVEN_ROAD);

/** Exposed for the site overlay, tests, and later milestones (bridge/gate placement). */
export function stonehavenRoad(): RouteSpline {
  return road;
}

/**
 * Milestone 3 composition anchors. Like STONEHAVEN itself these are read by BOTH the terrain
 * field (aprons, the bridge gap, tree clearings) and the site overlay (paving, massing), so
 * every authored object seats exactly on ground shaped to receive it.
 */
export const STONEHAVEN_SITES = {
  /** The village plaza: the road's first waypoint, paved as an arrival square. */
  plaza: { cx: 16, cz: 4, r: 7 },
  /** The harbor: a level quay apron cut into the bench's lake edge, one block above water. */
  harbor: {
    cx: 16,
    cz: 11,
    rx: 13,
    rz: 5.5,
    apronY: SEA_LEVEL + 1,
    pier: { x: 15, z0: 16, z1: 27 },
  },
  /** The stone bridge where the road crosses the stream gorge on the falls bench. */
  bridge: { x0: 100, x1: 104, z0: 105, z1: 117, deckY: 92 },
  /** The fortress ward: curtain wall + corner bastions on the plateau, keep massing on the knoll. */
  ward: {
    x0: -74,
    x1: -42,
    z0: 112,
    z1: 140,
    wallTopY: 114,
    towerTopY: 120,
    gate: { x0: -68, x1: -64, z: 140 },
    keep: { x0: -80, x1: -68, z0: 114, z1: 126, topY: 134 },
    turret: { x0: -80, x1: -77, z0: 114, z1: 117, topY: 140 },
  },
  /** Road pullouts framing destination views: the south-shore fortress vista, the falls-bench
   *  rim overlook (lake below, the keep straight across the water — clear of the stream gorge). */
  viewpoints: [
    { x: 40, z: 160, r: 4 },
    { x: 90, z: 120, r: 4 },
  ],
} as const;

// Bearings from the valley center (+x east, +z south).
const THETA_EAST = 0;
const THETA_SOUTH = Math.PI / 2;
const THETA_NORTHWEST = (-3 * Math.PI) / 4;

const DETAIL_FBM: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 60 };
const MACRO_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 180 };
const ROUGH_FBM: FbmOptions = { octaves: 3, persistence: 0.55, lacunarity: 2.1, frequency: 1 / 38 };
/** Mid-frequency summit variation: breaks the peak line into distinct summits and saddles. */
const SUMMIT_FBM: FbmOptions = { octaves: 2, persistence: 0.5, lacunarity: 2, frequency: 1 / 90 };

const SALT_DETAIL = 0x570e01;
const SALT_MACRO = 0x570e02;
const SALT_ROUGH = 0x570e03;

interface Samplers {
  detail: NoiseFunction2D;
  macro: NoiseFunction2D;
  rough: NoiseFunction2D;
}

const samplersBySeed = new Map<WorldSeed, Samplers>();
function samplersFor(seed: WorldSeed): Samplers {
  let s = samplersBySeed.get(seed);
  if (!s) {
    s = {
      detail: createNoise2D(mulberry32((seed ^ SALT_DETAIL) >>> 0)),
      macro: createNoise2D(mulberry32((seed ^ SALT_MACRO) >>> 0)),
      rough: createNoise2D(mulberry32((seed ^ SALT_ROUGH) >>> 0)),
    };
    samplersBySeed.set(seed, s);
  }
  return s;
}

/** Direction-dependent inner radius of the mountain ring: close in the east (the ascent
 * shoulder), closer in the south (the fortress backdrop), pushed far out at the northwest notch. */
function ringInnerR(theta: number): number {
  return (
    STONEHAVEN.mountains.innerR -
    55 * directionalLobe(theta, THETA_EAST, 3.5) -
    45 * directionalLobe(theta, THETA_SOUTH, 2.2) +
    55 * directionalLobe(theta, THETA_NORTHWEST, 6)
  );
}

/** Un-rounded surface height for a world column — the whole composition in one scalar field. */
function stonehavenHeight(s: Samplers, wx: number, wz: number): number {
  const detail = fbm2D(s.detail, wx, wz, DETAIL_FBM); // [-1, 1]
  const macro = fbm2D(s.macro, wx, wz, MACRO_FBM); // [-1, 1]

  // 1. Valley floor: gentle alpine meadow, tilting up into the northern hillside where the
  //    village's upper terraces will sit.
  const hillside = smoothstep01((-wz - 30) / 50) * 14;
  let h = STONEHAVEN.floorY + detail * 2.5 + hillside;

  // 2. The mountain ring, in two phases: a gentle apron the forest can climb, then a steep
  //    ridged wall to a varied peak line. Ridge noise only weights the wall, so the valley and
  //    apron stay soft while the faces break into spurs and gullies.
  const dx = wx - STONEHAVEN.valley.cx;
  const dz = wz - STONEHAVEN.valley.cz;
  const r = Math.hypot(dx, dz);
  const theta = Math.atan2(dz, dx);
  const m = STONEHAVEN.mountains;
  const u = r - ringInnerR(theta);
  if (u > 0) {
    const apron = m.apronRise * smoothstep01(u / m.apronRun);
    const wallT = smoothstep01((u - m.wallStart) / m.wallRun) ** 1.2;
    const notchDip = 62 * directionalLobe(theta, THETA_NORTHWEST, 6);
    const ridge = 1 - Math.abs(fbm2D(s.rough, wx, wz, ROUGH_FBM));
    const summit = fbm2D(s.rough, wx + 4096, wz - 4096, SUMMIT_FBM);
    const peak = m.peakY + macro * 18 + summit * 12 - notchDip;
    const wall = wallT * Math.max(0, peak - m.apronRise - STONEHAVEN.floorY) + ridge * 14 * wallT;
    h = Math.max(h, STONEHAVEN.floorY + apron + wall + detail * 2);
  }

  // 3. The falls bench: a hanging shelf behind the east shore. The lake carve (step 5) cuts its
  //    western toe into a cliff at the waterline — the waterfall lip — facing the village across
  //    the water. The stream itself is only a shallow groove; the lip carries the drama.
  const fb = STONEHAVEN.fallsBench;
  const dF = Math.hypot(wx - fb.cx, wz - fb.cz);
  if (dF < fb.r + 14) {
    const w = 1 - smoothstep01((dF - fb.r) / 14);
    h = Math.max(h, lerp(h, fb.y + detail * 0.8, w));
  }
  if (wx > 40 && wz > 60 && wx < 170 && wz < 150) {
    const hit = polylineProject(wx, wz, STONEHAVEN_STREAM);
    if (hit.dist < 9) {
      const w = 1 - smoothstep01(hit.dist / 9);
      const depth = Math.min(9, Math.max(0, (h - (SEA_LEVEL + 2)) * 0.5));
      h -= w * depth;
    }
  }

  // 4. The village bench: flatten the north-shore apron so districts build on level ground.
  const tV = superellipseT(
    wx - STONEHAVEN.village.cx,
    wz - STONEHAVEN.village.cz,
    STONEHAVEN.village.rx,
    STONEHAVEN.village.rz,
    2.2,
  );
  if (tV < 1) {
    const w = Math.min(1, smoothstep01((1 - tV) / 0.35));
    h = lerp(h, STONEHAVEN.village.benchY + detail * 0.7, w);
  }

  // 4.5 The harbor apron: a hard, level quay bench cut into the village bench's lake edge one
  //     block above the waterline, so the quay wall and pier seat on crisp, dry ground. The
  //     lake carve (next) trims its southern lip into the waterfront.
  const hb = STONEHAVEN_SITES.harbor;
  const tH = superellipseT(wx - hb.cx, wz - hb.cz, hb.rx, hb.rz, 3);
  if (tH < 1) {
    const w = Math.min(1, smoothstep01((1 - tH) / 0.3));
    h = lerp(h, hb.apronY, w);
  }

  // 5. The lake basin, smooth-min carved through whatever it meets — including the village
  //    bench, whose cut edge becomes the harbor waterfront.
  const tL = superellipseT(dx, dz, STONEHAVEN.lake.rx, STONEHAVEN.lake.rz, STONEHAVEN.lake.pow);
  if (tL < 1.1) {
    const sink = smoothstep01((1 - tL) / 0.85);
    const target = lerp(STONEHAVEN.floorY - 2, STONEHAVEN.lake.floorY, sink) + detail * 1.2;
    // A tight fillet: wide radii here sag every shoreline bench into a soggy margin.
    h = smin(h, target, 2.5);
  }

  // 6. The fortress crag, applied after the lake so its rock always wins: stacked cliff-band
  //    benches under a flat outer-ward plateau, with direction-dependent skirts — tight sheer
  //    steps rising straight out of the water on the lake side (north/west), wider climbable
  //    ramps on the south and east where the switchback road will approach.
  const cdx = wx - STONEHAVEN.crag.cx;
  const cdz = wz - STONEHAVEN.crag.cz;
  const dC = Math.hypot(cdx, cdz);
  if (dC < 90) {
    const thetaC = Math.atan2(cdz, cdx);
    const soft = Math.max(
      directionalLobe(thetaC, THETA_SOUTH, 2),
      directionalLobe(thetaC, THETA_EAST, 2),
    );
    // Lowest tier first; each higher bench overrides inside its own radius.
    for (const tier of STONEHAVEN.crag.tiers) {
      const w = 1 - smoothstep01((dC - tier.r) / (8 + 16 * soft));
      if (w > 0) h = lerp(h, Math.max(h, tier.y + detail * 0.7), w);
    }
    const w = 1 - smoothstep01((dC - STONEHAVEN.crag.coreR) / (7 + 18 * soft));
    if (w > 0) h = lerp(h, STONEHAVEN.crag.plateauY + detail * 0.6, w);

    const k = STONEHAVEN.crag.knoll;
    const dK = Math.hypot(wx - k.cx, wz - k.cz);
    const wk = 1 - smoothstep01((dK - k.r) / 7);
    if (wk > 0) h = lerp(h, k.y + detail * 0.5, wk);
  }

  // 7. The road corridor, graded last so it cuts and fills a walkable ledge through everything
  //    it crosses — shore marge, the falls-bench climb, the crag's tier risers. The authored
  //    profile never dips below the waterline, so the road stays dry the whole way.
  const rHit = road.project(wx, wz);
  if (rHit.dist < 10) {
    const target = road.yAt(rHit.along);
    let w = 1 - smoothstep01((rHit.dist - 3.5) / 6.5);
    // The bridge gap: where the road corridor crosses the stream gorge, fade the grading out so
    // the groove passes beneath instead of being filled — the site overlay spans it with the
    // stone bridge deck at road level, abutments seating on the graded ends.
    if (wx > 40 && wz > 60 && wx < 170 && wz < 150) {
      const sHit = polylineProject(wx, wz, STONEHAVEN_STREAM);
      if (sHit.dist < 6) w *= smoothstep01((sHit.dist - 2.5) / 3.5);
    }
    h = lerp(h, target, w);
  }

  return h;
}

// One sampler bundle per seed, shared by the terrain stage, the public surfaceAt helper, and the
// forest gates, so trees and buildings seat on the very same ground the generator builds.
export function stonehavenSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  return clampInt(stonehavenHeight(samplersFor(seed), wx, wz), 1, WORLD_HEIGHT - 1);
}

/** Local grade (blocks of rise per block of run) from central differences of the height field. */
function gradeAt(s: Samplers, wx: number, wz: number): number {
  const gx = (stonehavenHeight(s, wx + 1, wz) - stonehavenHeight(s, wx - 1, wz)) / 2;
  const gz = (stonehavenHeight(s, wx, wz + 1) - stonehavenHeight(s, wx, wz - 1)) / 2;
  return Math.hypot(gx, gz);
}

/** The Stonehaven surface-cap decision: shared by the painter stage and the forest gates. */
function capFor(h: number, grade: number, macro: number, wx: number, wz: number): BlockId {
  if (h < SEA_LEVEL) return h >= SEA_LEVEL - 6 ? SAND : GRAVEL; // shelving beach → deep bed
  const snowline = STONEHAVEN.snowlineY + macro * 6;
  if (h > snowline) return grade > 1.6 ? STONE : SNOW; // cliffs too steep to hold snow
  if (grade > 1.35) return STONE; // exposed rock faces
  if (grade > 0.95) return hash2(wx, wz, 0x5c8ee) < 0.55 ? STONE : GRAVEL; // scree bands
  if (h <= SEA_LEVEL + 1) {
    return hash2(wx, wz, 0x5480e) < 0.6 ? SAND : GRAVEL; // shingle waterline strip
  }
  const treeline = STONEHAVEN.treelineY + macro * 5;
  if (h > treeline) {
    const m = hash2(wx, wz, 0xa1b0e);
    return m < 0.68 ? GRASS : m < 0.88 ? STONE : GRAVEL; // alpine meadow thinning to rock
  }
  return GRASS;
}

/** Public cap probe (tree gates, later site logic). Same math as the painter, so no drift. */
export function stonehavenCapAt(seed: WorldSeed, wx: number, wz: number): BlockId {
  const s = samplersFor(seed);
  const h = clampInt(stonehavenHeight(s, wx, wz), 1, WORLD_HEIGHT - 1);
  const macro = fbm2D(s.macro, wx, wz, MACRO_FBM);
  return capFor(h, gradeAt(s, wx, wz), macro, wx, wz);
}

const DIRT_BAND = 3;

/**
 * Heightmap + slope/altitude-aware surface paint for the whole Stonehaven composition.
 *
 * The height field is evaluated once into a bordered 18x18 grid, and the per-column grade is
 * read from that grid via central differences — never by re-evaluating the field. Recomputing
 * neighbors per column (the naive approach) made each chunk ~5x more expensive to generate,
 * which is far past the streaming frame budget for an authored multi-fBm field like this one.
 */
class StonehavenField implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    const s = samplersFor(ctx.seed);
    const W = CHUNK_SIZE_X + 2; // bordered grid: local -1..16
    const grid = new Float64Array(W * W);
    for (let gz = 0; gz < W; gz++) {
      for (let gx = 0; gx < W; gx++) {
        const wx = ctx.cx * CHUNK_SIZE_X + gx - 1;
        const wz = ctx.cz * CHUNK_SIZE_Z + gz - 1;
        grid[gx + W * gz] = stonehavenHeight(s, wx, wz);
      }
    }
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const gx = x + 1;
        const gz = z + 1;
        const wx = ctx.cx * CHUNK_SIZE_X + x;
        const wz = ctx.cz * CHUNK_SIZE_Z + z;
        const h = clampInt(grid[gx + W * gz], 1, WORLD_HEIGHT - 1);
        ctx.heights[x + CHUNK_SIZE_X * z] = h;
        const gradeX = (grid[gx + 1 + W * gz] - grid[gx - 1 + W * gz]) / 2;
        const gradeZ = (grid[gx + W * (gz + 1)] - grid[gx + W * (gz - 1)]) / 2;
        const macro = fbm2D(s.macro, wx, wz, MACRO_FBM);
        const cap = capFor(h, Math.hypot(gradeX, gradeZ), macro, wx, wz);
        const band = cap === GRASS ? DIRT : cap === SAND ? SAND : cap === SNOW ? STONE : cap;
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

// ── Forests ─────────────────────────────────────────────────────────────────────────────────────

/** Zones no tree may root in: the lake, the village bench, the fortress domain, the gorge. */
function inClearing(wx: number, wz: number): boolean {
  const tV = superellipseT(
    wx - STONEHAVEN.village.cx,
    wz - STONEHAVEN.village.cz,
    STONEHAVEN.village.rx,
    STONEHAVEN.village.rz,
    2.2,
  );
  if (tV < 1.12) return true;
  const dC = Math.hypot(wx - STONEHAVEN.crag.cx, wz - STONEHAVEN.crag.cz);
  if (dC < 58) return true;
  if (wx > 40 && wz > 60 && wx < 170 && wz < 150) {
    if (polylineProject(wx, wz, STONEHAVEN_STREAM).dist < 11) return true;
  }
  if (road.project(wx, wz).dist < 7) return true;
  // Vista clearings: keep the pullouts' framed views (fortress across the water, the falls lip)
  // open — a treeless wedge is what turns a road bend into a destination glimpse.
  for (const vp of STONEHAVEN_SITES.viewpoints) {
    if (Math.hypot(wx - vp.x, wz - vp.z) < 15) return true;
  }
  return false;
}

/** A species belt: rooted on grass, inside an altitude band, outside the authored clearings. */
function belt(
  library: ReturnType<typeof coniferVariants>,
  loY: number,
  hiY: number,
  cellSize: number,
  density: number,
  salt: number,
): Overlay {
  const seatAt = (seed: WorldSeed, x: number, z: number): number =>
    stonehavenSurfaceAt(seed, x, z) + 1;
  return scatterStructures(
    library,
    oakScatterOptions(seatAt, {
      cellSize,
      density,
      salt,
      canPlace: (c) => {
        const tx = c.ox + OAK_TRUNK_OFFSET[0]; // gate by the trunk column, not a canopy corner
        const tz = c.oz + OAK_TRUNK_OFFSET[1];
        const h = stonehavenSurfaceAt(c.seed, tx, tz);
        if (h < loY || h > hiY) return false;
        if (inClearing(tx, tz)) return false;
        return stonehavenCapAt(c.seed, tx, tz) === GRASS;
      },
    }),
  );
}

/**
 * Stonehaven's woodland: mixed oak/birch around the valley floor giving way to a pure conifer
 * belt that climbs to the treeline. Clearings (village, fortress, gorge, lake) stay open.
 */
export function stonehavenForests(): Overlay[] {
  return [
    belt([...oakVariants(), ...birchVariants()], 63, 84, 13, 0.4, 0x0a41),
    belt(coniferVariants(), 72, STONEHAVEN.treelineY, 9, 0.62, 0xc0a1),
  ];
}

/**
 * The Stonehaven terrain: the authored alpine valley, flooded to the waterline, with ore seeded
 * through the rock. No cave carving in v1 — the lake floor and road cuts stay watertight.
 */
export function createStonehavenGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [new StonehavenField(), new WaterFiller(), new OreScatterer({ densityScale: 1.0 })],
    SEA_LEVEL,
  );
}
