import {
  AIR,
  WATER,
  STONE,
  COBBLESTONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  GRAVEL,
  DEEPSLATE,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  COBBLE_WALL,
  STAIRS_STONE,
  STAIRS_PLANK,
  STAIRS_COBBLE,
  STAIRS_BRICK,
  PLANK_SLAB,
  STONE_SLAB,
  LEAVES,
  DIRT,
  MUD,
  TERRACOTTA,
  FLOWER,
  TALL_GRASS,
  FURNACE,
  BOOKSHELF,
  OAK_FENCE_GATE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { SEA_LEVEL } from '../core/constants';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { HOLLOWMERE, hollowmereSurfaceAt } from './HollowmereGenerator';
import { well, marketStall, lampPost, barn, farmPlot } from './prefabs';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { BlockId, WorldSeed } from '../core/types';

// ── Shared helpers ─────────────────────────────────────────────────────────────────────────────

function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    const state = b.length === 5 ? b[4] : 0;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, state);
  }
}

/** Stepped hip roof (overhanging). */
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

/** Gabled roof along X or Z. */
function gableRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
  along: 'x' | 'z',
  stair: BlockId,
  cube: BlockId,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  if (along === 'x') {
    const mid = (az + bz) >> 1;
    const half = Math.max(1, ((bz - az) / 2) | 0);
    for (let r = 0; r <= half; r++) {
      const y = baseY + r;
      const zA = az + r;
      const zB = bz - r;
      for (let x = ax; x <= bx; x++) {
        if (zA === zB) s.set(x, y, zA, cube);
        else {
          s.set(x, y, zA, stair, packState(FACING.N, 0));
          s.set(x, y, zB, stair, packState(FACING.S, 0));
        }
      }
      // close gable ends
      if (zA < zB) {
        s.fill(ax, baseY, zA, ax, y, zB, cube);
        s.fill(bx, baseY, zA, bx, y, zB, cube);
      }
    }
    s.fill(ax, baseY + half, mid, bx, baseY + half, mid, cube);
  } else {
    const mid = (ax + bx) >> 1;
    const half = Math.max(1, ((bx - ax) / 2) | 0);
    for (let r = 0; r <= half; r++) {
      const y = baseY + r;
      const xA = ax + r;
      const xB = bx - r;
      for (let z = az; z <= bz; z++) {
        if (xA === xB) s.set(xA, y, z, cube);
        else {
          s.set(xA, y, z, stair, packState(FACING.W, 0));
          s.set(xB, y, z, stair, packState(FACING.E, 0));
        }
      }
      if (xA < xB) {
        s.fill(xA, baseY, az, xB, y, az, cube);
        s.fill(xA, baseY, bz, xB, y, bz, cube);
      }
    }
    s.fill(mid, baseY + half, az, mid, baseY + half, bz, cube);
  }
}

type Facing4 = 'N' | 'E' | 'S' | 'W';

interface HouseOpts {
  wall: BlockId;
  timber?: BlockId;
  roofStair: BlockId;
  roofCube: BlockId;
  height: number;
  door: Facing4;
  gable?: 'x' | 'z';
  ruined?: boolean;
  mossy?: boolean;
  foundation?: BlockId;
}

function doorOpening(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  door: Facing4,
): void {
  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (door === 'N') s.fill(mx, floorY + 1, z0, mx, floorY + 2, z0, AIR);
  else if (door === 'S') s.fill(mx, floorY + 1, z1, mx, floorY + 2, z1, AIR);
  else if (door === 'W') s.fill(x0, floorY + 1, mz, x0, floorY + 2, mz, AIR);
  else s.fill(x1, floorY + 1, mz, x1, floorY + 2, mz, AIR);
}

/**
 * Hollowmere house: timber-frame / plaster / fieldstone language.
 * Ruined variant: broken roofs, dark timber, moss, water-damage floor.
 */
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
  const span = Math.max(x1 - x0, z1 - z0);
  const roofPeak = top + Math.ceil((span + 3) / 2);
  const timber = opts.timber ?? WOOD;
  const foundation = opts.foundation ?? COBBLESTONE;

  s.fill(x0 - 1, floorY, z0 - 1, x1 + 1, roofPeak + 1, z1 + 1, AIR);
  s.fill(x0, floorY - 1, z0, x1, floorY - 10, z1, foundation);
  s.slab(x0, z0, x1, z1, floorY, opts.ruined ? (opts.mossy ? MUD : GRAVEL) : PLANKS);

  s.walls(x0, floorY + 1, z0, x1, top, z1, opts.wall);
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    s.fill(px, floorY + 1, pz, px, top, pz, timber);
  }
  // mid timber posts on longer walls
  if (x1 - x0 >= 6) {
    const mx = (x0 + x1) >> 1;
    s.fill(mx, floorY + 1, z0, mx, top, z0, timber);
    s.fill(mx, floorY + 1, z1, mx, top, z1, timber);
  }
  if (z1 - z0 >= 6) {
    const mz = (z0 + z1) >> 1;
    s.fill(x0, floorY + 1, mz, x0, top, mz, timber);
    s.fill(x1, floorY + 1, mz, x1, top, mz, timber);
  }

  const wy = floorY + 2;
  for (let x = x0 + 2; x <= x1 - 2; x += 2) {
    if (opts.ruined && hash2(x, z0, 0x77) < 0.35) continue;
    s.set(x, wy, z0, GLASS);
    s.set(x, wy, z1, GLASS);
  }
  for (let z = z0 + 2; z <= z1 - 2; z += 2) {
    if (opts.ruined && hash2(x0, z, 0x78) < 0.35) continue;
    s.set(x0, wy, z, GLASS);
    s.set(x1, wy, z, GLASS);
  }

  if (!opts.ruined || hash2(x0, z0, 0x79) > 0.25) {
    doorOpening(s, x0, z0, x1, z1, floorY, opts.door);
  }

  // chimney
  if (!opts.ruined) {
    s.fill(x1 - 1, top - 1, z1 - 1, x1 - 1, top + 3, z1 - 1, BRICK);
    s.set(x1 - 1, floorY + 1, z1 - 1, FURNACE);
  }

  if (!opts.ruined) s.set(x1 - 1, top - 1, z0 + 1, LANTERN);

  if (opts.ruined) {
    // partial broken roof — leave holes
    const rStair = opts.roofStair;
    const rCube = opts.roofCube;
    if (opts.gable) gableRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, opts.gable, rStair, rCube);
    else hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, rStair, rCube);
    // punch holes in roof / walls
    for (let i = 0; i < 5; i++) {
      const hx = x0 + 1 + ((hash2(x0 + i, z0, 0x80 + i) * (x1 - x0 - 1)) | 0);
      const hz = z0 + 1 + ((hash2(x0, z0 + i, 0x90 + i) * (z1 - z0 - 1)) | 0);
      s.fill(hx, top, hz, hx, top + 3, hz, AIR);
    }
    // leaning / missing wall section
    if (hash2(x0, z0, 0xa1) < 0.5) {
      s.fill(x0, floorY + 2, z0 + 1, x0, top, z0 + 2, AIR);
    }
    // overgrowth
    s.set(x0 + 1, floorY + 1, z0 + 1, LEAVES);
    s.set((x0 + x1) >> 1, top + 1, (z0 + z1) >> 1, LEAVES);
  } else if (opts.gable) {
    gableRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, opts.gable, opts.roofStair, opts.roofCube);
  } else {
    hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, opts.roofStair, opts.roofCube);
  }
}

function flowerBox(s: CitadelStamp, x: number, y: number, z: number): void {
  s.set(x, y, z, DIRT);
  if (hash2(x, z, 0xb2) < 0.6) s.set(x, y + 1, z, FLOWER);
  else s.set(x, y + 1, z, TALL_GRASS);
}

function pavePath(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  primary: BlockId = COBBLESTONE,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const r = hash2(wx, wz, 0x40b1);
      const block = r < 0.12 ? GRAVEL : r < 0.2 ? STONE : primary;
      s.set(wx, y, wz, block);
      s.set(wx, y - 1, wz, STONE); // sub-base
    }
  }
}

function roadSegment(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  width: number,
): void {
  // Axis-aligned corridor path of given width.
  if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
    const zc = (z0 + z1) >> 1;
    const half = width >> 1;
    pavePath(s, Math.min(x0, x1), zc - half, Math.max(x0, x1), zc + half, y);
  } else {
    const xc = (x0 + x1) >> 1;
    const half = width >> 1;
    pavePath(s, xc - half, Math.min(z0, z1), xc + half, Math.max(z0, z1), y);
  }
}

// ── Forest arrival path ────────────────────────────────────────────────────────────────────────

function buildArrivalPath(s: CitadelStamp): void {
  const H = HOLLOWMERE;
  // Dirt trail from spawn toward river bridge — grade gently down to the bridge deck.
  const northY = SEA_LEVEL + 2; // matches covered-bridge deck
  const southY = H.livingY + 4;
  for (let z = 128; z >= 78; z--) {
    const t = (128 - z) / (128 - 78);
    const y = Math.round(southY + (northY - southY) * t);
    for (let dx = -1; dx <= 1; dx++) {
      const x = H.roadX + dx;
      const r = hash2(x, z, 0xc01);
      s.set(x, y, z, r < 0.3 ? GRAVEL : DIRT);
      s.set(x, y - 1, z, DIRT);
      s.fill(x, y + 1, z, x, y + 5, z, AIR);
    }
  }
  // roadside shrine (player-height landmark on the approach)
  const sy = southY - 1;
  s.fill(H.roadX + 4, sy - 1, 114, H.roadX + 6, sy, 116, COBBLESTONE);
  s.fill(H.roadX + 5, sy + 1, 115, H.roadX + 5, sy + 3, 115, STONE);
  s.set(H.roadX + 5, sy + 4, 115, LANTERN);
  s.set(H.roadX + 4, sy + 1, 115, FLOWER);
}

// ── Covered bridge ─────────────────────────────────────────────────────────────────────────────

function buildCoveredBridge(s: CitadelStamp): void {
  const H = HOLLOWMERE;
  const bx = H.bridge.x;
  const bz = H.bridge.z;
  const deckY = SEA_LEVEL + 2; // 64 — above water
  // stone piers
  for (const z of [bz - 4, bz + 4]) {
    s.fill(bx - 2, SEA_LEVEL - 8, z - 1, bx + 2, deckY - 1, z + 1, STONE);
  }
  // deck
  s.fill(bx - 2, deckY, bz - 7, bx + 2, deckY, bz + 7, PLANKS);
  // walls / rails + roof posts
  for (let z = bz - 7; z <= bz + 7; z++) {
    s.set(bx - 2, deckY + 1, z, OAK_FENCE);
    s.set(bx + 2, deckY + 1, z, OAK_FENCE);
    if ((z - bz) % 3 === 0) {
      s.fill(bx - 2, deckY + 1, z, bx - 2, deckY + 4, z, WOOD);
      s.fill(bx + 2, deckY + 1, z, bx + 2, deckY + 4, z, WOOD);
    }
  }
  // covered roof
  gableRoof(s, bx - 3, bz - 8, bx + 3, bz + 8, deckY + 4, 'z', STAIRS_PLANK, PLANKS);
  // lanterns
  s.set(bx, deckY + 3, bz - 5, LANTERN);
  s.set(bx, deckY + 3, bz + 5, LANTERN);
  // approach ramps
  for (let i = 0; i < 4; i++) {
    s.fill(bx - 1, deckY - 1, bz + 8 + i, bx + 1, deckY - 1, bz + 8 + i, COBBLESTONE);
    s.fill(bx - 1, deckY - 1, bz - 8 - i, bx + 1, deckY - 1, bz - 8 - i, COBBLESTONE);
  }
}

// ── Arrival hamlet ─────────────────────────────────────────────────────────────────────────────

function buildArrivalHamlet(s: CitadelStamp): void {
  const y = HOLLOWMERE.livingY;
  // Inn
  house(s, -6, 50, 2, 58, y, {
    wall: PLANKS,
    roofStair: STAIRS_BRICK,
    roofCube: BRICK,
    height: 5,
    door: 'S',
    gable: 'x',
  });
  // sign post
  s.fill(3, y + 1, 58, 3, y + 3, 58, WOOD);
  s.set(3, y + 4, 58, LANTERN);
  // stables
  s.fill(8, y - 1, 52, 16, y, 58, COBBLESTONE);
  s.walls(8, y + 1, 52, 16, y + 3, 58, WOOD);
  s.fill(8, y + 1, 55, 8, y + 2, 55, AIR); // door
  gableRoof(s, 7, 51, 17, 59, y + 3, 'x', STAIRS_PLANK, PLANKS);
  for (let x = 10; x <= 14; x += 2) s.set(x, y + 1, 53, OAK_FENCE); // stalls
  // cottages
  house(s, -14, 54, -8, 60, y, {
    wall: COBBLESTONE,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 4,
    door: 'E',
  });
  house(s, 10, 60, 16, 66, y, {
    wall: PLANKS,
    roofStair: STAIRS_STONE,
    roofCube: DEEPSLATE,
    height: 4,
    door: 'W',
    gable: 'z',
  });
  // storage
  s.fill(18, y - 1, 54, 22, y + 3, 58, COBBLESTONE);
  s.fill(19, y + 1, 55, 21, y + 2, 57, AIR);
  s.set(20, y + 1, 54, AIR);
  s.set(20, y + 2, 54, AIR);
  // small gate posts into living village
  s.fill(4, y + 1, 48, 4, y + 4, 48, STONE);
  s.fill(8, y + 1, 48, 8, y + 4, 48, STONE);
  s.set(4, y + 5, 48, LANTERN);
  s.set(8, y + 5, 48, LANTERN);
  s.fill(5, y + 4, 48, 7, y + 4, 48, WOOD); // lintel
  // path through hamlet
  roadSegment(s, 6, 66, 6, 48, y, 3);
  stampPrefab(s, lampPost(), 3, y + 1, 52);
  stampPrefab(s, lampPost(), 9, y + 1, 52);
}

// ── Living village roads + market ──────────────────────────────────────────────────────────────

function buildMainRoads(s: CitadelStamp): void {
  const y = HOLLOWMERE.livingY;
  // South spine from hamlet toward market
  roadSegment(s, 6, 48, 6, 28, y, 3);
  // Market ring roads
  roadSegment(s, -16, 36, 20, 36, y, 3);
  roadSegment(s, -10, 28, -10, 44, y, 2);
  roadSegment(s, 14, 28, 14, 44, y, 2);
  // Alley network
  roadSegment(s, -4, 44, -4, 20, y, 2);
  roadSegment(s, 10, 44, 10, 18, y, 2);
  roadSegment(s, -18, 28, 18, 28, y, 2);
  // West climb toward hillside
  roadSegment(s, -10, 36, -28, 36, y, 2);
  // East toward farms / mill path
  roadSegment(s, 14, 36, 36, 50, y, 2);
  // Path toward inner wall (north of market)
  roadSegment(s, 2, 28, 2, 12, y, 3);
  // Optional loop east of basin
  roadSegment(s, 22, 20, 22, -10, y, 2);
  roadSegment(s, 22, -10, 8, -20, y, 2);
  // Optional loop west
  roadSegment(s, -22, 20, -22, -8, y, 2);
}

function buildMarketSquare(s: CitadelStamp): void {
  const y = HOLLOWMERE.livingY;
  const mx0 = -8;
  const mx1 = 12;
  const mz0 = 30;
  const mz1 = 42;
  // plaza pave
  pavePath(s, mx0, mz0, mx1, mz1, y, COBBLESTONE);
  // well / fountain
  stampPrefab(s, well(), 1, y + 1, 35);
  // market stalls
  stampPrefab(s, marketStall(), -6, y + 1, 32);
  stampPrefab(s, marketStall(), 8, y + 1, 32);
  stampPrefab(s, marketStall(), -5, y + 1, 39);
  stampPrefab(s, marketStall(), 7, y + 1, 39);
  // bakery
  house(s, -14, 30, -9, 36, y, {
    wall: PLANKS,
    roofStair: STAIRS_BRICK,
    roofCube: BRICK,
    height: 4,
    door: 'E',
    gable: 'z',
  });
  s.set(-10, y + 1, 33, FURNACE);
  // blacksmith
  house(s, 14, 30, 20, 36, y, {
    wall: COBBLESTONE,
    roofStair: STAIRS_STONE,
    roofCube: DEEPSLATE,
    height: 4,
    door: 'W',
  });
  s.set(18, y + 1, 33, FURNACE);
  s.fill(15, y + 1, 37, 19, y + 2, 40, AIR);
  s.walls(14, y + 1, 37, 20, y + 3, 41, COBBLESTONE);
  // tavern
  house(s, -6, 43, 4, 50, y, {
    wall: PLANKS,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 5,
    door: 'S',
    gable: 'x',
  });
  s.set(-3, y + 1, 46, BOOKSHELF);
  // civic hall
  house(s, 6, 43, 16, 50, y, {
    wall: STONE,
    timber: WOOD,
    roofStair: STAIRS_BRICK,
    roofCube: BRICK,
    height: 5,
    door: 'S',
  });
  // balconies / upper porch on tavern
  s.fill(-5, y + 3, 42, 3, y + 3, 42, PLANK_SLAB);
  for (let x = -5; x <= 3; x += 2) s.set(x, y + 4, 42, OAK_FENCE);
  // lamps
  for (const [lx, lz] of [
    [-7, 31],
    [11, 31],
    [-7, 41],
    [11, 41],
    [2, 29],
  ] as const) {
    stampPrefab(s, lampPost(), lx, y + 1, lz);
  }
  // flower boxes on plaza edge
  for (let x = -6; x <= 10; x += 4) {
    flowerBox(s, x, y + 1, 30);
    flowerBox(s, x, y + 1, 42);
  }
  // narrow shop fronts for denser street feel (composition pass)
  house(s, -16, 38, -12, 42, y, {
    wall: PLANKS,
    roofStair: STAIRS_BRICK,
    roofCube: BRICK,
    height: 4,
    door: 'E',
    gable: 'z',
  });
  house(s, 16, 38, 20, 42, y, {
    wall: COBBLESTONE,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 4,
    door: 'W',
  });
  // alley arch connecting market north edge toward the inner wall
  s.fill(-1, y + 1, 27, -1, y + 4, 27, STONE);
  s.fill(5, y + 1, 27, 5, y + 4, 27, STONE);
  s.fill(-1, y + 4, 27, 5, y + 4, 27, WOOD);
  s.set(2, y + 5, 27, LANTERN);
}

// ── Dense living streets ───────────────────────────────────────────────────────────────────────

function buildLivingStreets(s: CitadelStamp): void {
  const y = HOLLOWMERE.livingY;
  const palettes: HouseOpts[] = [
    { wall: PLANKS, roofStair: STAIRS_BRICK, roofCube: BRICK, height: 4, door: 'S', gable: 'x' },
    { wall: COBBLESTONE, roofStair: STAIRS_PLANK, roofCube: PLANKS, height: 4, door: 'E' },
    { wall: PLANKS, roofStair: STAIRS_STONE, roofCube: DEEPSLATE, height: 5, door: 'W', gable: 'z' },
    { wall: BRICK, roofStair: STAIRS_PLANK, roofCube: PLANKS, height: 4, door: 'N' },
    {
      wall: PLANKS,
      timber: WOOD,
      roofStair: STAIRS_BRICK,
      roofCube: BRICK,
      height: 4,
      door: 'E',
      gable: 'x',
    },
  ];

  // South of market (between hamlet and square)
  const south: Array<[number, number, number, number, number, Facing4]> = [
    [-16, 44, -11, 49, 0, 'E'],
    [14, 52, 19, 58, 1, 'W'],
    [-20, 36, -15, 42, 2, 'E'],
    [18, 38, 24, 44, 3, 'W'],
    [-8, 20, -3, 26, 4, 'S'],
    [6, 18, 12, 24, 0, 'N'],
    [-18, 20, -12, 26, 1, 'E'],
    [16, 20, 22, 26, 2, 'W'],
  ];
  for (const [x0, z0, x1, z1, pi, door] of south) {
    const p = { ...palettes[pi % palettes.length], door };
    house(s, x0, z0, x1, z1, y, p);
  }

  // East belt houses
  const east: Array<[number, number, number, number, number]> = [
    [24, 8, 30, 14, 0],
    [24, -4, 30, 2, 1],
    [26, 18, 32, 24, 2],
    [28, 28, 34, 34, 3],
  ];
  for (const [x0, z0, x1, z1, pi] of east) {
    house(s, x0, z0, x1, z1, y, { ...palettes[pi % palettes.length], door: 'W' });
  }

  // West approach houses (before hillside climb)
  const west: Array<[number, number, number, number, number]> = [
    [-28, 28, -22, 34, 0],
    [-28, 18, -22, 24, 1],
    [-30, 8, -24, 14, 2],
    [-26, 40, -20, 46, 3],
  ];
  for (const [x0, z0, x1, z1, pi] of west) {
    house(s, x0, z0, x1, z1, y, { ...palettes[pi % palettes.length], door: 'E' });
  }

  // Narrow alley props
  for (const [x, z] of [
    [-2, 24],
    [8, 24],
    [0, 16],
    [-12, 32],
  ] as const) {
    stampPrefab(s, lampPost(), x, y + 1, z);
  }
  // garden plots between houses
  for (let x = -10; x <= -6; x++) {
    for (let z = 14; z <= 17; z++) {
      s.set(x, y, z, DIRT);
      if (hash2(x, z, 0xd1) < 0.5) s.set(x, y + 1, z, FLOWER);
    }
  }
}

// ── Hillside district ──────────────────────────────────────────────────────────────────────────

function buildHillside(s: CitadelStamp): void {
  // Terraces climbing west with stairs and overlooks.
  const rows = [
    { x0: -38, x1: -32, floorY: HOLLOWMERE.livingY + 4, zs: [30, 18, 6, -6] },
    { x0: -46, x1: -40, floorY: HOLLOWMERE.livingY + 10, zs: [24, 12, 0] },
    { x0: -54, x1: -48, floorY: HOLLOWMERE.livingY + 15, zs: [18, 6] },
  ];
  const palettes: HouseOpts[] = [
    { wall: PLANKS, roofStair: STAIRS_BRICK, roofCube: BRICK, height: 4, door: 'E', gable: 'z' },
    { wall: COBBLESTONE, roofStair: STAIRS_PLANK, roofCube: PLANKS, height: 4, door: 'E' },
    { wall: PLANKS, roofStair: STAIRS_STONE, roofCube: DEEPSLATE, height: 5, door: 'E' },
  ];
  let pi = 0;
  for (const row of rows) {
    // retaining wall
    s.fill(row.x1 + 1, HOLLOWMERE.livingY - 2, -10, row.x1 + 2, row.floorY, 36, COBBLESTONE);
    for (const zc of row.zs) {
      house(s, row.x0, zc - 3, row.x1, zc + 3, row.floorY, palettes[pi % palettes.length]);
      // garden terrace
      for (let x = row.x0; x <= row.x1; x++) {
        s.set(x, row.floorY, zc + 4, DIRT);
        if (hash2(x, zc, 0xe2) < 0.45) s.set(x, row.floorY + 1, zc + 4, FLOWER);
      }
      pi++;
    }
  }
  // stair path up the hillside
  for (let i = 0; i <= 28; i++) {
    const x = -30 - i;
    const y = HOLLOWMERE.livingY + Math.floor(i / 2);
    s.fill(x, y + 1, 12, x, y + 6, 14, AIR);
    if (i % 2 === 0) s.set(x, y, 13, STAIRS_COBBLE, packState(FACING.E, 0));
    else s.set(x, y, 13, COBBLESTONE);
    s.fill(x, y - 1, 13, x, y - 6, 13, COBBLESTONE);
  }
  // overlook platform — signature layered view (village + basin + volcano)
  const ox = -50;
  const oy = HOLLOWMERE.livingY + 15;
  const oz = 4;
  s.fill(ox - 2, oy - 1, oz - 2, ox + 2, oy, oz + 2, STONE);
  s.outline(ox - 2, oz - 2, ox + 2, oz + 2, oy + 1, OAK_FENCE);
  s.set(ox, oy + 1, oz, AIR); // open north toward volcano/basin
  s.set(ox, oy + 1, oz - 2, AIR);
  s.set(ox, oy + 2, oz - 1, LANTERN);
  // orchard trees (simple canopy posts)
  for (const [tx, tz] of [
    [-42, 36],
    [-44, 40],
    [-48, 34],
    [-52, 28],
  ] as const) {
    const ty = HOLLOWMERE.livingY + 8;
    s.fill(tx, ty, tz, tx, ty + 3, tz, WOOD);
    s.fill(tx - 1, ty + 3, tz - 1, tx + 1, ty + 5, tz + 1, LEAVES);
  }
}

// ── Farm belt ──────────────────────────────────────────────────────────────────────────────────

function buildFarms(s: CitadelStamp): void {
  const y = HOLLOWMERE.livingY;
  // East farm fields
  for (let x = 36; x <= 52; x++) {
    for (let z = 40; z <= 58; z++) {
      if (((x + z) & 3) === 0) continue; // dirt lanes
      s.set(x, y - 1, z, DIRT);
      s.set(x, y, z, DIRT);
      if (hash2(x, z, 0xf1) < 0.55) s.set(x, y + 1, z, TALL_GRASS);
      else if (hash2(x, z, 0xf2) < 0.2) s.set(x, y + 1, z, FLOWER);
    }
  }
  // fences
  for (let x = 36; x <= 52; x++) {
    s.set(x, y + 1, 40, OAK_FENCE);
    s.set(x, y + 1, 58, OAK_FENCE);
  }
  for (let z = 40; z <= 58; z++) {
    s.set(36, y + 1, z, OAK_FENCE);
    s.set(52, y + 1, z, OAK_FENCE);
  }
  s.set(36, y + 1, 49, OAK_FENCE_GATE, packState(FACING.E, 0));
  // farmhouse + barn
  house(s, 38, 60, 44, 66, y, {
    wall: PLANKS,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 4,
    door: 'N',
    gable: 'x',
  });
  stampPrefab(s, barn(), 48, y + 1, 62);
  stampPrefab(s, farmPlot(), 40, y + 1, 48);
  // stone wall field boundary
  for (let z = 20; z <= 40; z++) s.set(34, y + 1, z, COBBLE_WALL);
  // SE orchard
  for (const [tx, tz] of [
    [30, 48],
    [32, 52],
    [34, 46],
    [28, 54],
  ] as const) {
    s.fill(tx, y, tz, tx, y + 3, tz, WOOD);
    s.fill(tx - 1, y + 3, tz - 1, tx + 1, y + 5, tz + 1, LEAVES);
  }
}

// ── Watermill ──────────────────────────────────────────────────────────────────────────────────

function buildWatermill(s: CitadelStamp): void {
  const H = HOLLOWMERE;
  const mx = H.mill.x;
  const mz = H.mill.z;
  const y = SEA_LEVEL + 2;
  // mill building
  house(s, mx - 3, mz - 2, mx + 3, mz + 4, y, {
    wall: COBBLESTONE,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 5,
    door: 'W',
    gable: 'z',
  });
  // water wheel (vertical ring of stairs/planks on south face over river)
  const wx = mx + 4;
  for (let i = -3; i <= 3; i++) {
    s.set(wx, y + i, mz, WOOD);
    s.set(wx, y, mz + i, WOOD);
  }
  // wheel rim
  for (const [dy, dz] of [
    [-3, -1],
    [-3, 0],
    [-3, 1],
    [-2, -2],
    [-2, 2],
    [-1, -3],
    [-1, 3],
    [0, -3],
    [0, 3],
    [1, -3],
    [1, 3],
    [2, -2],
    [2, 2],
    [3, -1],
    [3, 0],
    [3, 1],
  ] as const) {
    s.set(wx, y + dy, mz + dz, PLANKS);
  }
  s.set(wx, y, mz, WOOD); // hub
  // mill race / channel
  s.fill(mx - 8, SEA_LEVEL - 4, mz - 1, mx + 6, SEA_LEVEL, mz + 1, AIR);
  for (let x = mx - 8; x <= mx + 6; x++) {
    s.set(x, SEA_LEVEL, mz, WATER);
    s.set(x, SEA_LEVEL - 1, mz, WATER);
    s.set(x, SEA_LEVEL - 2, mz - 1, STONE);
    s.set(x, SEA_LEVEL - 2, mz + 1, STONE);
  }
  // footbridge by mill
  s.fill(mx - 6, y, mz - 4, mx - 4, y, mz + 2, PLANKS);
  for (let z = mz - 4; z <= mz + 2; z++) {
    s.set(mx - 6, y + 1, z, OAK_FENCE);
    s.set(mx - 4, y + 1, z, OAK_FENCE);
  }
  s.set(mx - 5, y + 2, mz - 3, LANTERN);
  // path from village
  roadSegment(s, 30, 50, mx - 4, mz, HOLLOWMERE.livingY, 2);
}

// ── Transition: inner wall + descent ────────────────────────────────────────────────────────────

function buildInnerWall(s: CitadelStamp): void {
  const H = HOLLOWMERE;
  const y = H.livingY;
  // Organic old stone wall around the basin — not a perfect circle.
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    const wobble = 1 + Math.sin(a * 0.07) * 0.08 + Math.cos(a * 0.13) * 0.05;
    const r = (H.basin.r + 6) * wobble;
    const x = Math.round(H.basin.cx + Math.cos(rad) * r);
    const z = Math.round(H.basin.cz + Math.sin(rad) * r * 0.92);
    // gate gaps: south main (from market), east optional, west optional
    const southGate = a > 250 && a < 290;
    const eastGate = a > 350 || a < 20;
    const westGate = a > 160 && a < 200;
    if (southGate || eastGate || westGate) continue;
    s.fill(x, y - 6, z, x, y + 3, z, STONE);
    if (a % 10 === 0) s.set(x, y + 4, z, COBBLE_WALL);
    if (a % 28 === 0) s.set(x, y + 4, z, LANTERN);
  }
  // South broken gate (main transition)
  const gx = 2;
  const gz = 12;
  s.fill(gx - 4, y - 2, gz - 1, gx - 2, y + 5, gz + 1, STONE);
  s.fill(gx + 2, y - 2, gz - 1, gx + 4, y + 5, gz + 1, STONE);
  s.fill(gx - 2, y + 5, gz - 1, gx + 2, y + 5, gz + 1, STONE); // lintel remnant
  s.set(gx - 3, y + 6, gz, LANTERN);
  s.set(gx + 3, y + 6, gz, LANTERN);
  // broken gate debris
  s.set(gx - 1, y, gz + 2, COBBLESTONE);
  s.set(gx + 1, y, gz + 2, COBBLESTONE);
  s.set(gx, y, gz + 3, GRAVEL);

  // Descending road into the basin — continues until flood street level.
  const targetY = SEA_LEVEL - 2;
  const steps = Math.max(14, (y - targetY) * 2);
  for (let i = 0; i <= steps; i++) {
    const z = gz - i;
    const hy = Math.max(targetY, y - Math.floor(i / 2));
    s.fill(gx - 1, hy + 1, z, gx + 1, hy + 5, z, AIR);
    if (i % 2 === 0) s.set(gx, hy, z, STAIRS_COBBLE, packState(FACING.S, 0));
    else s.set(gx, hy, z, COBBLESTONE);
    s.set(gx - 1, hy, z, COBBLESTONE);
    s.set(gx + 1, hy, z, COBBLESTONE);
    s.fill(gx, hy - 1, z, gx, hy - 4, z, STONE);
  }
  // material shift: older mossy paving as you enter the lost streets
  for (let i = 0; i < 6; i++) {
    const z = gz - steps - i;
    s.set(gx, targetY, z, hash2(gx, z, 0x188) < 0.4 ? MUD : COBBLESTONE);
    s.set(gx - 1, targetY, z, STONE);
    s.set(gx + 1, targetY, z, STONE);
    s.fill(gx - 1, targetY + 1, z, gx + 1, targetY + 4, z, AIR);
  }
}

// ── Lost village ───────────────────────────────────────────────────────────────────────────────

function buildLostVillage(s: CitadelStamp): void {
  const waterY = SEA_LEVEL; // 62
  const streetY = SEA_LEVEL - 2; // 60 — partially submerged

  // flooded square around bell tower
  pavePath(s, -8, -14, 8, 2, streetY, COBBLESTONE);
  // ensure water sits above some street sections
  for (let x = -8; x <= 8; x++) {
    for (let z = -14; z <= 2; z++) {
      if (hash2(x, z, 0x201) < 0.35) s.set(x, streetY, z, MUD);
      // shallow water layer where terrain is low
      if (hash2(x, z, 0x202) < 0.5) s.set(x, waterY - 1, z, WATER);
    }
  }

  // ruined houses — older architecture (exposed stone, dark timber)
  const ruins: Array<[number, number, number, number, Facing4]> = [
    [-16, -8, -10, -2, 'E'],
    [10, -10, 16, -4, 'W'],
    [-14, 2, -8, 8, 'S'],
    [8, 2, 14, 8, 'S'],
    [-20, -16, -14, -10, 'E'],
    [12, -18, 18, -12, 'W'],
    [-8, -22, -2, -16, 'N'],
    [2, -22, 8, -16, 'N'],
    [-18, 6, -12, 12, 'E'],
    [10, 6, 16, 12, 'W'],
  ];
  for (const [x0, z0, x1, z1, door] of ruins) {
    const opts: HouseOpts = {
      wall: STONE,
      timber: DEEPSLATE,
      roofStair: STAIRS_STONE,
      roofCube: DEEPSLATE,
      height: 4,
      door,
      ruined: true,
      mossy: true,
      foundation: DEEPSLATE,
    };
    if (hash2(x0, z0, 0x210) < 0.5) opts.gable = 'x';
    house(s, x0, z0, x1, z1, streetY, opts);
  }

  // broken bridges across flooded lanes
  s.fill(-4, waterY, -4, 4, waterY, -4, AIR);
  for (let x = -3; x <= 3; x++) {
    if (x === 0) continue; // gap
    s.set(x, waterY, -4, PLANKS);
  }
  s.set(-2, waterY + 1, -4, OAK_FENCE);
  s.set(2, waterY + 1, -4, OAK_FENCE);

  // collapsed bridge remnant
  s.set(6, waterY, 0, PLANKS);
  s.set(7, waterY, 0, PLANKS);
  s.set(8, waterY - 1, 0, WOOD);

  // trees growing through ruins
  for (const [tx, tz] of [
    [-12, 4],
    [12, -8],
    [-6, -18],
    [4, 6],
  ] as const) {
    s.fill(tx, streetY, tz, tx, streetY + 5, tz, WOOD);
    s.fill(tx - 2, streetY + 4, tz - 2, tx + 2, streetY + 7, tz + 2, LEAVES);
  }

  // moss / overgrowth scatter
  for (let x = -22; x <= 18; x += 2) {
    for (let z = -24; z <= 12; z += 2) {
      if (hash2(x, z, 0x220) < 0.12) s.set(x, streetY + 1, z, LEAVES);
      if (hash2(x, z, 0x221) < 0.08) s.set(x, streetY + 1, z, TALL_GRASS);
    }
  }

  // old road remnants
  roadSegment(s, 2, 10, 2, -2, streetY, 2);
  roadSegment(s, -10, -6, 10, -6, streetY, 2);

  // leaning wall fragments
  s.fill(-22, streetY, 0, -22, streetY + 4, 4, STONE);
  s.fill(18, streetY, -2, 18, streetY + 3, 2, STONE);
}

// ── Drowned Bell Tower ─────────────────────────────────────────────────────────────────────────

function buildBellTower(s: CitadelStamp): void {
  const H = HOLLOWMERE;
  const cx = H.bell.cx;
  const cz = H.bell.cz;
  const baseY = SEA_LEVEL - 3; // 59 — feet in water
  const floorY = SEA_LEVEL; // entry above shallow flood

  // stone island / foundation rising from flood
  s.fill(cx - 5, baseY - 8, cz - 5, cx + 5, floorY - 1, cz + 5, DEEPSLATE);
  s.fill(cx - 4, floorY - 1, cz - 4, cx + 4, floorY - 1, cz + 4, STONE);

  // clear air for tower shaft
  s.fill(cx - 4, floorY, cz - 4, cx + 4, floorY + 28, cz + 4, AIR);

  // outer tower walls — human-scale, weathered, not a skyscraper
  const wallTop = floorY + 18;
  s.walls(cx - 3, floorY, cz - 3, cx + 3, wallTop, cz + 3, STONE);
  // buttress corners
  for (const [dx, dz] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as const) {
    s.fill(cx + dx, floorY, cz + dz, cx + dx, wallTop, cz + dz, DEEPSLATE);
  }

  // arched entrance south (from market approach)
  s.fill(cx - 1, floorY, cz + 3, cx + 1, floorY + 3, cz + 3, AIR);
  s.set(cx - 1, floorY + 3, cz + 3, STAIRS_STONE, packState(FACING.S, 0));
  s.set(cx + 1, floorY + 3, cz + 3, STAIRS_STONE, packState(FACING.S, 0));
  s.set(cx, floorY + 4, cz + 3, STONE);

  // narrow windows
  for (const y of [floorY + 6, floorY + 10, floorY + 14]) {
    s.set(cx, y, cz - 3, AIR);
    s.set(cx, y, cz + 3, AIR);
    s.set(cx - 3, y, cz, AIR);
    s.set(cx + 3, y, cz, AIR);
  }

  // floors with stair shaft
  for (const fy of [floorY + 5, floorY + 10, floorY + 15]) {
    s.slab(cx - 2, cz - 2, cx + 2, cz + 2, fy, PLANKS);
    s.fill(cx - 1, fy, cz - 1, cx + 1, fy, cz + 1, AIR); // stair hole
    s.set(cx + 2, fy + 1, cz, LANTERN);
  }

  // spiral climb
  spiralStair(s, cx, cz, floorY, wallTop - 1, STAIRS_COBBLE, WOOD);

  // bell chamber (open arches)
  const bellY = wallTop + 1;
  s.walls(cx - 2, bellY, cz - 2, cx + 2, bellY + 4, cz + 2, STONE);
  // open bell openings on four faces
  for (const [dx, dz] of [
    [0, -2],
    [0, 2],
    [-2, 0],
    [2, 0],
  ] as const) {
    s.fill(cx + dx, bellY + 1, cz + dz, cx + dx, bellY + 3, cz + dz, AIR);
  }
  // the bell
  s.set(cx, bellY + 2, cz, DEEPSLATE);
  s.set(cx, bellY + 3, cz, DEEPSLATE);
  s.set(cx - 1, bellY + 3, cz, STONE_SLAB);
  s.set(cx + 1, bellY + 3, cz, STONE_SLAB);
  s.set(cx, bellY + 3, cz - 1, STONE_SLAB);
  s.set(cx, bellY + 3, cz + 1, STONE_SLAB);
  s.set(cx, bellY + 4, cz, GLOWSTONE); // soft glint, not a beacon spire

  // pyramidal roof cap
  hipRoof(s, cx - 3, cz - 3, cx + 3, cz + 3, bellY + 5, STAIRS_STONE, DEEPSLATE);
  s.set(cx, bellY + 9, cz, STONE); // finial

  // approach stepping stones from south gate path
  for (let z = 8; z >= 0; z -= 2) {
    s.set(cx, SEA_LEVEL - 1, z, COBBLESTONE);
    s.set(cx, SEA_LEVEL, z, AIR);
  }
  // broken approach bridge
  for (let z = -1; z >= -3; z--) {
    if (z === -2) continue; // gap — wade or jump
    s.set(cx, SEA_LEVEL, z, PLANKS);
  }

  // neighboring collapsed structures framing the tower
  s.fill(cx - 10, SEA_LEVEL - 3, cz - 2, cx - 7, SEA_LEVEL + 2, cz + 2, STONE);
  s.fill(cx - 9, SEA_LEVEL, cz - 1, cx - 8, SEA_LEVEL + 3, cz + 1, AIR);
  s.fill(cx + 7, SEA_LEVEL - 3, cz - 3, cx + 10, SEA_LEVEL + 1, cz + 1, STONE);
  // water around base
  for (let x = cx - 6; x <= cx + 6; x++) {
    for (let z = cz - 6; z <= cz + 6; z++) {
      const d = Math.abs(x - cx) + Math.abs(z - cz);
      if (d > 4 && d < 9 && hash2(x, z, 0x300) < 0.7) {
        s.set(x, SEA_LEVEL - 1, z, WATER);
      }
    }
  }
}

// ── Volcanic foothills route ───────────────────────────────────────────────────────────────────

function buildFoothillRoute(s: CitadelStamp): void {
  // Old pilgrimage path north from west loop toward foothills
  for (let z = -20; z >= -90; z -= 1) {
    const x = -8 + Math.round(Math.sin(z * 0.08) * 4);
    const y = hollowmereSurfaceAt(1337 as WorldSeed, x, z);
    // only stamp path blocks; height varies with terrain
    s.set(x, y, z, GRAVEL);
    if (z % 12 === 0) {
      s.set(x + 1, y + 1, z, COBBLE_WALL);
      if (z % 24 === 0) s.set(x + 1, y + 2, z, LANTERN);
    }
  }
  // abandoned watch post
  const wx = -6;
  const wz = -78;
  const wy = HOLLOWMERE.livingY + 10;
  s.fill(wx - 2, wy - 6, wz - 2, wx + 2, wy, wz + 2, STONE);
  s.walls(wx - 2, wy + 1, wz - 2, wx + 2, wy + 5, wz + 2, COBBLESTONE);
  s.fill(wx, wy + 1, wz + 2, wx, wy + 2, wz + 2, AIR);
  s.set(wx, wy + 4, wz, LANTERN);
  // hot spring pools (geothermal)
  for (const [px, pz] of [
    [8, -88],
    [14, -94],
    [2, -92],
  ] as const) {
    s.fill(px - 1, SEA_LEVEL - 2, pz - 1, px + 1, SEA_LEVEL - 1, pz + 1, TERRACOTTA);
    s.set(px, SEA_LEVEL - 1, pz, WATER);
    s.set(px, SEA_LEVEL - 2, pz, WATER);
    if (hash2(px, pz, 0x400) < 0.5) s.set(px + 2, SEA_LEVEL, pz, GRAVEL);
  }
  // shrine at path start
  const ly = HOLLOWMERE.livingY;
  s.fill(-10, ly - 1, -24, -8, ly, -22, STONE);
  s.fill(-9, ly + 1, -23, -9, ly + 3, -23, STONE);
  s.set(-9, ly + 4, -23, LANTERN);
  s.set(-10, ly + 1, -23, FLOWER);
}

// ── Forest edge dressing ───────────────────────────────────────────────────────────────────────

function buildForestDressing(s: CitadelStamp): void {
  // Authored trees framing the arrival corridor (road itself kept clear).
  const trees: Array<[number, number, number]> = [
    [-6, 71, 118],
    [14, 71, 116],
    [-8, 71, 110],
    [16, 70, 108],
    [-10, 70, 100],
    [18, 70, 98],
    [-12, 70, 92],
    [14, 69, 90],
    [0, 70, 128],
    [12, 70, 126],
  ];
  for (const [tx, ty, tz] of trees) {
    s.fill(tx, ty, tz, tx, ty + 4, tz, WOOD);
    s.fill(tx - 2, ty + 3, tz - 2, tx + 2, ty + 6, tz + 2, LEAVES);
  }
  // Clear random canopy from the main road corridor so arrival stays walkable.
  for (let z = 130; z >= 48; z--) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = HOLLOWMERE.roadX + dx;
      for (let y = HOLLOWMERE.livingY; y < HOLLOWMERE.livingY + 14; y++) {
        const id = s.get(x, y, z);
        if (id === LEAVES || id === WOOD) s.set(x, y, z, AIR);
      }
    }
  }
}

/**
 * Hollowmere site overlay — living village, transition, lost village, bell tower,
 * watermill, farms, hillside, and foothill pilgrimage path. All stamps clip per chunk.
 */
export function hollowmereSite(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);
    buildArrivalPath(s);
    buildForestDressing(s);
    buildCoveredBridge(s);
    buildArrivalHamlet(s);
    buildMainRoads(s);
    buildMarketSquare(s);
    buildLivingStreets(s);
    buildHillside(s);
    buildFarms(s);
    buildWatermill(s);
    buildInnerWall(s);
    buildLostVillage(s);
    buildBellTower(s);
    buildFoothillRoute(s);
  };
}
