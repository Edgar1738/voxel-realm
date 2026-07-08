import {
  AIR,
  STONE,
  COBBLESTONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  GRAVEL,
  SAND,
  DEEPSLATE,
  TERRACOTTA,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  FURNACE,
  BOOKSHELF,
  OAK_FENCE,
  COBBLE_WALL,
  STONEBRICK_WALL,
  STAIRS_STONE,
  STAIRS_PLANK,
  STAIRS_COBBLE,
  STAIRS_BRICK,
  PLANK_SLAB,
  GOLD_ORE,
  EMERALD_ORE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { ASHEN, ASHEN_ROAD, ashenSurfaceAt } from './AshenReachGenerator';
import { well, marketStall, lampPost } from './prefabs';
import { deadTree, obelisk } from './wildsPrefabs';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { BlockId, WorldSeed } from '../core/types';
import { SEA_LEVEL } from '../core/constants';

// ── Frame ──────────────────────────────────────────────────────────────────────────────────────
const VY = ASHEN.village.benchY; // 68 — Emberhold deck level
const SHORE = ASHEN.shoreY; // 63

/** Stamp a prefab (min-corner) with orientation state preserved. */
function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    const state = b.length === 5 ? b[4] : 0;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, state);
  }
}

// ── Hip roof (same contract as harbor) ─────────────────────────────────────────────────────────
function hipRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
  stair: BlockId,
  cube: BlockId,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  for (let r = 0; ; r++) {
    const lx0 = ax + r;
    const lx1 = bx - r;
    const lz0 = az + r;
    const lz1 = bz - r;
    if (lx0 > lx1 || lz0 > lz1) break;
    const y = baseY + r;
    if (lx1 - lx0 <= 1 || lz1 - lz0 <= 1) {
      s.fill(lx0, y, lz0, lx1, y, lz1, cube);
      break;
    }
    for (let x = lx0 + 1; x <= lx1 - 1; x++) {
      s.set(x, y, lz0, stair, packState(FACING.N, 0));
      s.set(x, y, lz1, stair, packState(FACING.S, 0));
    }
    for (let z = lz0 + 1; z <= lz1 - 1; z++) {
      s.set(lx0, y, z, stair, packState(FACING.W, 0));
      s.set(lx1, y, z, stair, packState(FACING.E, 0));
    }
    s.set(lx0, y, lz0, cube);
    s.set(lx1, y, lz0, cube);
    s.set(lx0, y, lz1, cube);
    s.set(lx1, y, lz1, cube);
  }
}

// ── Houses ─────────────────────────────────────────────────────────────────────────────────────
type Facing4 = 'N' | 'E' | 'S' | 'W';

interface HouseOpts {
  wall: BlockId;
  roofStair: BlockId;
  roofCube: BlockId;
  height: number;
  door: Facing4;
}

function house(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  opts: HouseOpts,
): void {
  const top = floorY + opts.height;
  const roofPeak = top + Math.ceil((Math.max(x1 - x0, z1 - z0) + 3) / 2);

  s.fill(x0 - 1, floorY, z0 - 1, x1 + 1, roofPeak + 1, z1 + 1, AIR);
  s.fill(x0, floorY - 1, z0, x1, floorY - 14, z1, DEEPSLATE);
  s.slab(x0, z0, x1, z1, floorY, PLANKS);

  s.walls(x0, floorY + 1, z0, x1, top, z1, opts.wall);
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    s.fill(px, floorY + 1, pz, px, top, pz, WOOD);
  }

  const wy = floorY + 2;
  for (let x = x0 + 2; x <= x1 - 2; x += 2) {
    s.set(x, wy, z0, GLASS);
    s.set(x, wy, z1, GLASS);
  }
  for (let z = z0 + 2; z <= z1 - 2; z += 2) {
    s.set(x0, wy, z, GLASS);
    s.set(x1, wy, z, GLASS);
  }

  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (opts.door === 'N') s.fill(mx, floorY + 1, z0, mx, floorY + 2, z0, AIR);
  else if (opts.door === 'S') s.fill(mx, floorY + 1, z1, mx, floorY + 2, z1, AIR);
  else if (opts.door === 'W') s.fill(x0, floorY + 1, mz, x0, floorY + 2, mz, AIR);
  else s.fill(x1, floorY + 1, mz, x1, floorY + 2, mz, AIR);

  s.set(x1 - 1, top - 1, z1 - 1, LANTERN);
  hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, opts.roofStair, opts.roofCube);

  // Interior detail: furniture + hearth so houses aren't hollow shells.
  const ix0 = x0 + 1;
  const iz0 = z0 + 1;
  const ix1 = x1 - 1;
  const iz1 = z1 - 1;
  if (ix1 - ix0 >= 2 && iz1 - iz0 >= 2) {
    s.set(ix0, floorY + 1, iz0, BOOKSHELF);
    s.set(ix0, floorY + 2, iz0, BOOKSHELF);
    s.set(ix1, floorY + 1, iz1, FURNACE);
    // Table: plank slab + fence "legs" reading as a small dining block.
    const tx = (ix0 + ix1) >> 1;
    const tz = (iz0 + iz1) >> 1;
    s.set(tx, floorY + 1, tz, OAK_FENCE);
    s.set(tx, floorY + 2, tz, PLANK_SLAB);
    s.set(tx, floorY + 3, tz, LANTERN);
    // Bed nook: two carpet-like terracotta slabs against the far wall.
    s.set(ix0 + 1, floorY + 1, iz1, TERRACOTTA);
    s.set(ix0 + 2, floorY + 1, iz1, TERRACOTTA);
  }
}

// ── Plaza + forge market ───────────────────────────────────────────────────────────────────────
const PLAZA = { x0: -10, z0: -14, x1: 26, z1: 18 } as const;

function pavePlaza(s: CitadelStamp): void {
  s.fill(PLAZA.x0, VY - 1, PLAZA.z0, PLAZA.x1, VY - 1, PLAZA.z1, DEEPSLATE);
  const ax = Math.max(PLAZA.x0, s.wx0);
  const bx = Math.min(PLAZA.x1, s.wx1);
  const az = Math.max(PLAZA.z0, s.wz0);
  const bz = Math.min(PLAZA.z1, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const r = hash2(wx, wz, 0xa51);
      // Warm flagstones: brick / terracotta / cobble mix
      s.set(wx, VY, wz, r < 0.18 ? BRICK : r < 0.32 ? TERRACOTTA : r < 0.4 ? STONE : COBBLESTONE);
    }
  }
}

function buildMarket(s: CitadelStamp): void {
  stampPrefab(s, well(), 6, VY + 1, 0);
  stampPrefab(s, marketStall(), 16, VY + 1, -8);
  stampPrefab(s, marketStall(), -4, VY + 1, 8);
  // Ember forges: furnaces as "smelters" under a open timber shed.
  s.fill(18, VY + 1, 6, 24, VY + 1, 12, COBBLESTONE);
  for (const [fx, fz] of [
    [19, 7],
    [22, 7],
    [19, 10],
    [22, 10],
  ] as const) {
    s.set(fx, VY + 1, fz, FURNACE);
  }
  // Shed posts + plank roof.
  for (const [px, pz] of [
    [18, 6],
    [24, 6],
    [18, 12],
    [24, 12],
  ] as const) {
    s.fill(px, VY + 2, pz, px, VY + 4, pz, WOOD);
  }
  s.slab(17, 5, 25, 13, VY + 5, PLANK_SLAB);
  s.set(21, VY + 4, 9, LANTERN);

  for (const [lx, lz] of [
    [PLAZA.x0 + 2, PLAZA.z0 + 2],
    [PLAZA.x1 - 2, PLAZA.z0 + 2],
    [PLAZA.x0 + 2, PLAZA.z1 - 2],
    [PLAZA.x1 - 2, PLAZA.z1 - 2],
  ] as const) {
    stampPrefab(s, lampPost(), lx, VY + 1, lz);
  }
}

/** Arrival gate on the north edge of the plaza — two pillars + arch, facing the caldera. */
function buildArrivalGate(s: CitadelStamp): void {
  const z = PLAZA.z0 - 2;
  for (const x of [2, 14]) {
    s.fill(x, VY + 1, z, x + 1, VY + 7, z + 1, DEEPSLATE);
    s.set(x, VY + 8, z, GLOWSTONE);
    s.set(x + 1, VY + 8, z + 1, GLOWSTONE);
  }
  s.fill(2, VY + 6, z, 15, VY + 7, z + 1, BRICK); // lintel
  s.fill(4, VY + 1, z, 13, VY + 5, z + 1, AIR); // passage
  // Ember crystals on the gate crown.
  s.set(8, VY + 8, z, CRYSTAL);
  s.set(9, VY + 8, z, CRYSTAL);
}

// ── Neighbourhood ──────────────────────────────────────────────────────────────────────────────
function buildVillageHouses(s: CitadelStamp): void {
  const palettes: HouseOpts[] = [
    { wall: BRICK, roofStair: STAIRS_STONE, roofCube: DEEPSLATE, height: 4, door: 'S' },
    { wall: TERRACOTTA, roofStair: STAIRS_BRICK, roofCube: BRICK, height: 4, door: 'S' },
    { wall: COBBLESTONE, roofStair: STAIRS_PLANK, roofCube: PLANKS, height: 5, door: 'E' },
    { wall: PLANKS, roofStair: STAIRS_BRICK, roofCube: BRICK, height: 4, door: 'W' },
  ];

  // Cottages ring the plaza but leave a clear south vista corridor (x≈4..12) so spawn
  // looks over the dock toward The Ember Spire — landscape composition first.
  const plots: Array<{ x0: number; z0: number; x1: number; z1: number; p: number; door: Facing4 }> =
    [
      { x0: -8, z0: -28, x1: -2, z1: -22, p: 0, door: 'S' },
      { x0: 2, z0: -30, x1: 10, z1: -24, p: 1, door: 'S' },
      { x0: 14, z0: -28, x1: 22, z1: -22, p: 2, door: 'S' },
      { x0: 28, z0: -10, x1: 34, z1: -2, p: 3, door: 'W' },
      { x0: 28, z0: 4, x1: 34, z1: 12, p: 0, door: 'W' },
      { x0: 28, z0: 16, x1: 34, z1: 24, p: 1, door: 'W' },
      { x0: -18, z0: -8, x1: -12, z1: 0, p: 1, door: 'E' },
      { x0: -18, z0: 6, x1: -12, z1: 14, p: 2, door: 'E' },
      { x0: -18, z0: 18, x1: -12, z1: 26, p: 3, door: 'E' },
      // Flanking cottages south of plaza, clear of the x=4..12 vista corridor.
      { x0: -10, z0: 22, x1: -4, z1: 28, p: 0, door: 'N' },
      { x0: 16, z0: 22, x1: 24, z1: 28, p: 2, door: 'N' },
    ];

  for (const plot of plots) {
    const opts = { ...palettes[plot.p % palettes.length], door: plot.door };
    house(s, plot.x0, plot.z0, plot.x1, plot.z1, VY, opts);
  }
}

// ── Ember path: plaza → shore → fissure bridge → rim climb → observatory ───────────────────────
function distToRoad(wx: number, wz: number): { dist: number; t: number } {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  for (let i = 0; i < ASHEN_ROAD.length - 1; i++) {
    const a = ASHEN_ROAD[i];
    const b = ASHEN_ROAD[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2) || 1;
    let u = ((wx - a.x) * dx + (wz - a.z) * dz) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const d = Math.hypot(wx - px, wz - pz);
    if (d < best) {
      best = d;
      bestT = acc + u * len;
    }
    acc += len;
  }
  return { dist: best, t: bestT };
}

function paveRoad(s: CitadelStamp, seed: WorldSeed): void {
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const { dist } = distToRoad(wx, wz);
      const width = 2.2 + hash2(wx, wz, 0x70ad) * 0.7;
      if (dist > width) continue;
      const h = ashenSurfaceAt(seed, wx, wz);
      // Don't pave underwater or deep in the fissure.
      if (h < SHORE - 1) continue;
      const m = hash2(wx, wz, 0x9a7e);
      s.set(wx, h, wz, m < 0.45 ? COBBLESTONE : m < 0.75 ? GRAVEL : BRICK);
      // Clear headroom along the road (cut overhangs / tree stumps).
      s.fill(wx, h + 1, wz, wx, h + 3, wz, AIR);
      // Occasional lantern posts along the edge.
      if (dist > width - 0.55 && dist <= width && hash2(wx, wz, 0x1a77) < 0.045) {
        s.set(wx, h + 1, wz, COBBLE_WALL);
        s.set(wx, h + 2, wz, LANTERN);
      }
    }
  }
}

/**
 * Place stairs on road segments that climb more than one block so foot traversal stays reliable
 * without flying the rim approach.
 */
function stairRoadClimbs(s: CitadelStamp, seed: WorldSeed): void {
  for (let i = 0; i < ASHEN_ROAD.length - 1; i++) {
    const a = ASHEN_ROAD[i];
    const b = ASHEN_ROAD[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z), 1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const wx = Math.round(a.x + (b.x - a.x) * t);
      const wz = Math.round(a.z + (b.z - a.z) * t);
      if (wx < s.wx0 || wx > s.wx1 || wz < s.wz0 || wz > s.wz1) continue;
      const h = ashenSurfaceAt(seed, wx, wz);
      const hNext = ashenSurfaceAt(
        seed,
        Math.round(a.x + (b.x - a.x) * Math.min(1, (k + 1) / steps)),
        Math.round(a.z + (b.z - a.z) * Math.min(1, (k + 1) / steps)),
      );
      if (hNext > h) {
        // Climbing toward +z or +x of the segment — face stairs uphill.
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const face =
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? FACING.E
              : FACING.W
            : dz > 0
              ? FACING.S
              : FACING.N;
        s.set(wx, h, wz, STAIRS_COBBLE, packState(face as 0 | 1 | 2 | 3, 0));
        s.fill(wx, h + 1, wz, wx, h + 3, wz, AIR);
      }
    }
  }
}

// ── Magma fissure + ash bridge ─────────────────────────────────────────────────────────────────
function buildFissureAndBridge(s: CitadelStamp): void {
  const { cx, cz, halfLen, halfW } = ASHEN.fissure;
  // Glowstone "magma" bed + crystal flecks in the trench.
  for (let z = cz - halfLen; z <= cz + halfLen; z++) {
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const edge =
        Math.max(Math.abs(x - cx) / halfW, Math.abs(z - cz) / halfLen);
      const bedY = SHORE - 6 - Math.floor((1 - edge) * 3);
      for (let y = bedY; y <= SHORE - 3; y++) {
        const r = hash2(x + y, z, 0xf155);
        s.set(x, y, z, r < 0.55 ? GLOWSTONE : r < 0.75 ? CRYSTAL : DEEPSLATE);
      }
      // Steam: occasional crystal "spouts" above the bed.
      if (hash2(x, z, 0x57ea) < 0.08) s.set(x, SHORE - 2, z, CRYSTAL);
    }
  }

  // Stone bridge deck spanning the fissure north–south at shore height + 1.
  const deckY = SHORE + 2;
  const x0 = cx - halfW - 2;
  const x1 = cx + halfW + 2;
  s.fill(x0, deckY, cz - halfLen - 2, x1, deckY, cz + halfLen + 2, STONE);
  // Rails
  for (let z = cz - halfLen - 2; z <= cz + halfLen + 2; z++) {
    s.set(x0, deckY + 1, z, STONEBRICK_WALL);
    s.set(x1, deckY + 1, z, STONEBRICK_WALL);
    if ((z - cz) % 4 === 0) {
      s.set(x0, deckY + 2, z, LANTERN);
      s.set(x1, deckY + 2, z, LANTERN);
    }
  }
  // Support piers into the trench.
  for (const z of [cz - halfLen + 2, cz, cz + halfLen - 2]) {
    s.fill(cx - 1, deckY - 1, z, cx + 1, SHORE - 8, z, DEEPSLATE);
  }
}

// ── Ember vents around the lake ────────────────────────────────────────────────────────────────
const VENTS: ReadonlyArray<{ x: number; z: number; r: number }> = [
  { x: -18, z: 58, r: 4 },
  { x: 28, z: 52, r: 3 },
  { x: -36, z: 88, r: 5 },
  { x: 22, z: 128, r: 4 },
  { x: -8, z: 140, r: 3 },
  { x: 60, z: 100, r: 4 },
];

function buildVents(s: CitadelStamp, seed: WorldSeed): void {
  for (const v of VENTS) {
    for (let dz = -v.r - 1; dz <= v.r + 1; dz++) {
      for (let dx = -v.r - 1; dx <= v.r + 1; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > v.r + 0.6) continue;
        const wx = v.x + dx;
        const wz = v.z + dz;
        const base = ashenSurfaceAt(seed, wx, wz);
        const rise = Math.max(0, Math.floor((1 - d / (v.r + 0.6)) * 4));
        // Cone of gravel/deepslate with glowing heart.
        for (let y = 1; y <= rise; y++) {
          s.set(wx, base + y, wz, y === rise && d < 1.2 ? GLOWSTONE : d < 1 ? DEEPSLATE : GRAVEL);
        }
        if (d < 0.8) {
          s.set(wx, base + rise + 1, wz, CRYSTAL);
          if (hash2(wx, wz, 0x7e17) < 0.5) s.set(wx, base + rise + 2, wz, GLOWSTONE);
        }
      }
    }
  }
}

// ── Shore dock ─────────────────────────────────────────────────────────────────────────────────
function buildShoreDock(s: CitadelStamp, seed: WorldSeed): void {
  // Cobble jetty on the north shore looking into the crater lake / Ember Spire.
  // Seat every column on the real surface so we never bury the deck under sand.
  const z0 = 48;
  const z1 = 60;
  const x = 8;
  for (let z = z0 - 4; z <= z1; z++) {
    for (let dx = -3; dx <= 3; dx++) {
      const wx = x + dx;
      const h = ashenSurfaceAt(seed, wx, z);
      const deck = Math.max(h, SHORE);
      // Clear headroom, pave deck, carry stilts down.
      s.fill(wx, deck + 1, z, wx, deck + 4, z, AIR);
      s.set(wx, deck, z, Math.abs(dx) <= 1 && z >= z0 ? COBBLESTONE : GRAVEL);
      s.fill(wx, deck - 1, z, wx, deck - 10, z, DEEPSLATE);
      if (Math.abs(dx) === 1 && z >= z0) s.set(wx, deck + 1, z, OAK_FENCE);
    }
  }
  const hEnd = Math.max(ashenSurfaceAt(seed, x, z1), SHORE);
  const hStart = Math.max(ashenSurfaceAt(seed, x, z0), SHORE);
  s.set(x, hEnd + 1, z1, LANTERN);
  s.set(x, hStart + 1, z0, LANTERN);
  // Steps from village bench down toward the dock along the vista corridor.
  for (let i = 0; i <= VY - SHORE + 2; i++) {
    const z = 38 + i;
    const y = VY - Math.min(i, VY - SHORE);
    s.fill(x - 1, y + 1, z, x + 1, y + 6, z, AIR);
    s.set(x, y, z, STAIRS_COBBLE, packState(FACING.S, 0));
    s.fill(x - 1, y - 1, z, x + 1, y - 8, z, COBBLESTONE);
  }
}

// ── Observatory on the west rim ────────────────────────────────────────────────────────────────
function buildObservatory(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz, y } = ASHEN.observatory;
  const floorY = Math.max(y - 2, ashenSurfaceAt(seed, cx, cz));

  // Circular basalt plinth.
  for (let dz = -8; dz <= 8; dz++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dz * dz > 64) continue;
      s.fill(cx + dx, floorY - 12, cz + dz, cx + dx, floorY, cz + dz, DEEPSLATE);
      s.set(cx + dx, floorY, cz + dz, STONE);
    }
  }

  // Tower drum.
  const r = 5;
  const wallTop = floorY + 14;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < (r - 1) * (r - 1)) continue;
      s.fill(cx + dx, floorY + 1, cz + dz, cx + dx, wallTop, cz + dz, DEEPSLATE);
    }
  }
  // Interior floors + spiral.
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, floorY + 1, PLANKS);
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, floorY + 8, PLANKS);
  // Clear spiral shaft then build it.
  s.fill(cx - 1, floorY + 2, cz - 1, cx + 1, wallTop, cz + 1, AIR);
  spiralStair(s, cx, cz, floorY + 2, wallTop, STAIRS_STONE, DEEPSLATE);

  // Door facing east (toward the caldera).
  s.fill(cx + r, floorY + 1, cz, cx + r, floorY + 3, cz, AIR);
  s.set(cx + r - 1, floorY + 2, cz - 2, LANTERN);

  // Windows
  for (const [dx, dz] of [
    [0, -r],
    [0, r],
    [-r, 0],
  ] as const) {
    s.set(cx + dx, floorY + 5, cz + dz, GLASS);
    s.set(cx + dx, floorY + 11, cz + dz, GLASS);
  }

  // Glass + crystal dome with glowstone beacon.
  for (let dy = 0; dy <= 5; dy++) {
    const rr = r - Math.floor(dy * 0.7);
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < (rr - 1) * (rr - 1)) continue;
        s.set(cx + dx, wallTop + 1 + dy, cz + dz, dy < 3 ? GLASS : CRYSTAL);
      }
    }
  }
  s.set(cx, wallTop + 7, cz, GLOWSTONE);
  s.set(cx, wallTop + 8, cz, GLOWSTONE);

  // Study clutter.
  s.set(cx - 3, floorY + 2, cz - 3, BOOKSHELF);
  s.set(cx - 3, floorY + 2, cz - 2, BOOKSHELF);
  s.set(cx + 3, floorY + 2, cz + 3, FURNACE);
  s.set(cx - 2, floorY + 9, cz + 2, LANTERN);

  // Approach stairs from the road (east of the knoll).
  for (let i = 0; i < 10; i++) {
    const x = cx + r + 2 + i;
    const z = cz;
    const y = floorY - i;
    s.fill(x, y + 1, z - 1, x, y + 5, z + 1, AIR);
    s.set(x, y, z, STAIRS_STONE, packState(FACING.W, 0));
    s.fill(x, y - 1, z - 1, x, y - 8, z + 1, DEEPSLATE);
  }

  // Rim parapet ring around the plinth.
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * 8);
    const pz = Math.round(cz + Math.sin(ang) * 8);
    s.set(px, floorY + 1, pz, STONEBRICK_WALL);
    if (a % 4 === 0) s.set(px, floorY + 2, pz, LANTERN);
  }
}

// ── Hero landmark: The Ember Spire on the caldera island ───────────────────────────────────────
/**
 * Tall basalt spire with a glowing crystal crown — the world's skyline signature. Walkable
 * spiral interior from the island top to a balcony under the beacon.
 */
function buildEmberSpire(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz, topY } = {
    cx: ASHEN.spireIsland.cx,
    cz: ASHEN.spireIsland.cz,
    topY: ashenSurfaceAt(seed, ASHEN.spireIsland.cx, ASHEN.spireIsland.cz),
  };
  const baseY = Math.max(topY, ASHEN.spireIsland.topY - 1);
  const wallTop = baseY + 28;
  const r = 4;

  // Island plinth ring (seals the tower footing).
  for (let dz = -7; dz <= 7; dz++) {
    for (let dx = -7; dx <= 7; dx++) {
      if (dx * dx + dz * dz > 49) continue;
      s.fill(cx + dx, SEA_LEVEL - 4, cz + dz, cx + dx, baseY, cz + dz, DEEPSLATE);
      if (dx * dx + dz * dz > 25) s.set(cx + dx, baseY, cz + dz, GRAVEL);
      else s.set(cx + dx, baseY, cz + dz, STONE);
    }
  }

  // Outer drum walls + interior void.
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 >= (r - 1) * (r - 1)) {
        s.fill(cx + dx, baseY + 1, cz + dz, cx + dx, wallTop, cz + dz, DEEPSLATE);
      } else {
        s.fill(cx + dx, baseY + 1, cz + dz, cx + dx, wallTop, cz + dz, AIR);
      }
    }
  }

  // Floors at mid + balcony with stair shafts.
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, baseY + 1, STONE);
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, baseY + 14, PLANKS);
  s.fill(cx - 1, baseY + 2, cz - 1, cx + 1, wallTop, cz + 1, AIR);
  spiralStair(s, cx, cz, baseY + 2, wallTop, STAIRS_STONE, DEEPSLATE);

  // North door (toward Emberhold) — short pier of cobble from island edge is terrain.
  s.fill(cx, baseY + 1, cz - r, cx, baseY + 3, cz - r, AIR);
  s.set(cx - 1, baseY + 2, cz - r + 1, LANTERN);
  s.set(cx + 1, baseY + 2, cz - r + 1, LANTERN);

  // Arrow-slit windows on the cardinals.
  for (const [dx, dz] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ] as const) {
    s.set(cx + dx, baseY + 8, cz + dz, GLASS);
    s.set(cx + dx, baseY + 20, cz + dz, GLASS);
  }

  // Ember crown: stepped crystal/glowstone finial — the beacon visible from the village.
  for (let dy = 0; dy <= 8; dy++) {
    const rr = Math.max(1, 3 - Math.floor(dy / 2));
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
        const id = dy < 3 ? DEEPSLATE : dy < 6 ? CRYSTAL : GLOWSTONE;
        s.set(cx + dx, wallTop + 1 + dy, cz + dz, id);
      }
    }
  }
  s.fill(cx, wallTop + 10, cz, cx, wallTop + 14, cz, GLOWSTONE);
  s.set(cx, wallTop + 15, cz, CRYSTAL);

  // Balcony ring under the crown (walkable lookout).
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * (r + 1));
    const pz = Math.round(cz + Math.sin(ang) * (r + 1));
    s.set(px, wallTop, pz, STONE);
    s.set(px, wallTop + 1, pz, STONEBRICK_WALL);
  }

  // Study chamber at mid floor.
  s.set(cx - 2, baseY + 15, cz - 2, BOOKSHELF);
  s.set(cx - 2, baseY + 15, cz - 1, BOOKSHELF);
  s.set(cx + 2, baseY + 15, cz + 2, FURNACE);
  s.set(cx + 2, baseY + 16, cz + 2, LANTERN);
}

// ── East-rim mine adit ─────────────────────────────────────────────────────────────────────────
function buildMine(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz } = ASHEN.mine;
  const mouthY = ashenSurfaceAt(seed, cx, cz);
  // Timber-framed portal into the rim, tunnel running east into rock.
  s.fill(cx - 1, mouthY + 1, cz - 2, cx + 1, mouthY + 4, cz + 2, AIR);
  s.fill(cx - 1, mouthY, cz - 2, cx + 1, mouthY, cz + 2, COBBLESTONE);
  for (const z of [cz - 2, cz + 2]) {
    s.fill(cx, mouthY + 1, z, cx, mouthY + 4, z, WOOD);
  }
  s.fill(cx - 1, mouthY + 4, cz - 2, cx + 1, mouthY + 4, cz + 2, WOOD);
  s.set(cx, mouthY + 3, cz - 2, LANTERN);
  s.set(cx, mouthY + 3, cz + 2, LANTERN);

  // Tunnel 14 blocks into the rim (+x), with ore flecks and a glowstone "seam".
  for (let i = 0; i <= 14; i++) {
    const x = cx + i;
    s.fill(x, mouthY + 1, cz - 1, x, mouthY + 3, cz + 1, AIR);
    s.fill(x, mouthY, cz - 1, x, mouthY, cz + 1, COBBLESTONE);
    if (i % 4 === 0) s.set(x, mouthY + 3, cz, LANTERN);
    if (hash2(x, cz, 0x01a1) < 0.2) s.set(x, mouthY + 1, cz - 1, GOLD_ORE);
    if (hash2(x, cz, 0x02b2) < 0.12) s.set(x, mouthY + 2, cz + 1, EMERALD_ORE);
    if (i > 8 && i < 12) s.set(x, mouthY + 1, cz, GLOWSTONE);
  }
  // Cart stop / crate at the end.
  s.set(cx + 13, mouthY + 1, cz, FURNACE);
  s.set(cx + 14, mouthY + 1, cz - 1, WOOD);
  s.set(cx + 14, mouthY + 1, cz + 1, WOOD);
}

// ── Outer wilds dressing ───────────────────────────────────────────────────────────────────────
function buildWilds(s: CitadelStamp, seed: WorldSeed): void {
  // Standing stones south of the lake, dead trees on outer slopes, a gold cache near a vent.
  stampPrefab(s, obelisk(), 8, ashenSurfaceAt(seed, 8, 160) + 1, 160);

  for (const [tx, tz] of [
    [-40, 20],
    [50, 30],
    [-110, 60],
    [90, 90],
    [-20, 180],
    [70, 150],
    [-80, 160],
  ] as const) {
    const h = ashenSurfaceAt(seed, tx, tz);
    if (h < SHORE + 2) continue;
    stampPrefab(s, deadTree(), tx, h + 1, tz);
  }

  // Small "ember shrine" on the east rim: deepslate ring + crystal + gold/emerald accents.
  const sx = 100;
  const sz = 96;
  const sh = ashenSurfaceAt(seed, sx, sz);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = Math.round(sx + Math.cos(ang) * 4);
    const pz = Math.round(sz + Math.sin(ang) * 4);
    s.fill(px, sh + 1, pz, px, sh + 3, pz, DEEPSLATE);
  }
  s.set(sx, sh + 1, sz, GLOWSTONE);
  s.set(sx, sh + 2, sz, CRYSTAL);
  s.set(sx + 1, sh + 1, sz, GOLD_ORE);
  s.set(sx - 1, sh + 1, sz, EMERALD_ORE);
}

// ── Dockside sandbar & lake edge polish ────────────────────────────────────────────────────────
function polishShore(s: CitadelStamp): void {
  // Occasional sand/gravel scatter on the beach ring so it isn't uniform.
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const dx = (wx - ASHEN.caldera.cx) / 1.08;
      const dz = (wz - ASHEN.caldera.cz) / 0.96;
      const d = Math.hypot(dx, dz);
      if (d < ASHEN.lake.r || d > ASHEN.lake.r + ASHEN.beachWidth) continue;
      if (hash2(wx, wz, 0xbc11) < 0.12) s.set(wx, SHORE, wz, GRAVEL);
      else if (hash2(wx, wz, 0x5a0d) < 0.08) s.set(wx, SHORE, wz, SAND);
    }
  }
}

/**
 * Ashen Reach site overlay: Ember Spire (hero) on the caldera island, Emberhold village,
 * graded ash road with stair climbs, magma fissure bridge, vents, dock, west-rim observatory,
 * east-rim mine, and outer wilds.
 */
export function ashenReachSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const s = new CitadelStamp(chunk, cx, cz);
    pavePlaza(s);
    buildArrivalGate(s);
    buildMarket(s);
    buildVillageHouses(s);
    paveRoad(s, seed);
    stairRoadClimbs(s, seed);
    buildFissureAndBridge(s);
    buildVents(s, seed);
    buildShoreDock(s, seed);
    buildEmberSpire(s, seed);
    buildObservatory(s, seed);
    buildMine(s, seed);
    buildWilds(s, seed);
    polishShore(s);
  };
}
