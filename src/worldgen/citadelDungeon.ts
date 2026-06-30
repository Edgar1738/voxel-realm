import {
  AIR,
  STONE,
  COBBLESTONE,
  BRICK,
  WATER,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  GOLD_ORE,
  EMERALD_ORE,
  OAK_FENCE,
} from '../blocks/blocks';
import { CITADEL } from './CitadelGenerator';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import type { WorldSeed } from '../core/types';
import type { BlockId } from '../core/types';

const C = CITADEL;
const G = C.groundY; // 80
const CX = C.centerX; // 8
const CZ = C.centerZ; // 8

const L1_FLOOR = 72; // upper dungeon floor
const L1_CEIL = 77;
const L2_FLOOR = 64; // crypt level floor
const L2_CEIL = 70;

/** Carve a room: solid floor + ceiling with a hollow air interior; surrounding plateau = walls. */
function carveRoom(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  ceilY: number,
  floor: BlockId = COBBLESTONE,
  ceil: BlockId = COBBLESTONE,
): void {
  s.fill(x0, floorY, z0, x1, floorY, z1, floor);
  s.fill(x0, floorY + 1, z0, x1, ceilY - 1, z1, AIR);
  s.fill(x0, ceilY, z0, x1, ceilY, z1, ceil);
}

/** Sparse deterministic lanterns on a room floor so corridors and chambers stay navigable. */
function lightFloor(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  salt: number,
): void {
  const ax = Math.max(Math.min(x0, x1), s.wx0);
  const bx = Math.min(Math.max(x0, x1), s.wx1);
  const az = Math.max(Math.min(z0, z1), s.wz0);
  const bz = Math.min(Math.max(z0, z1), s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      if (hash2(wx, wz, salt) < 0.04) s.set(wx, floorY + 1, wz, LANTERN);
    }
  }
}

// ── Layout anchors ──────────────────────────────────────────────────────────────────────────
const HUT_X0 = CX + 8; // 16
const HUT_X1 = CX + 12; // 20
const HUT_Z0 = CZ - 2; // 6
const HUT_Z1 = CZ + 2; // 10
const SHAFT_X = CX + 10; // 18 (3x3 shaft centre)
const SHAFT_Z = CZ; // 8
const L2_STAIR_X = CX - 20; // -12
const L2_STAIR_Z = CZ; // 8

/** The visible courtyard entrance: a small crypt-house with a spiral stair down to level 1. */
function buildEntrance(s: CitadelStamp): void {
  // Hut shell on the courtyard.
  s.walls(HUT_X0, G + 1, HUT_Z0, HUT_X1, G + 4, HUT_Z1, COBBLESTONE);
  s.slab(HUT_X0, HUT_Z0, HUT_X1, HUT_Z1, G + 5, COBBLESTONE);
  s.fill(SHAFT_X - 1, G + 1, HUT_Z1, SHAFT_X + 1, G + 3, HUT_Z1, AIR); // south doorway
  s.set(HUT_X0 + 1, G + 4, HUT_Z0 + 1, GLOWSTONE); // a light inside

  // Vertical shaft + descending spiral from the courtyard cap down to level 1.
  s.fill(SHAFT_X - 1, L1_FLOOR + 1, SHAFT_Z - 1, SHAFT_X + 1, G, SHAFT_Z + 1, AIR);
  spiralStair(s, SHAFT_X, SHAFT_Z, L1_FLOOR, G, COBBLESTONE, COBBLESTONE);
}

function buildLevel1(s: CitadelStamp): void {
  // Junction under the entrance shaft, then a main corridor running west.
  carveRoom(s, CX + 6, CZ - 2, CX + 12, CZ + 2, L1_FLOOR, L1_CEIL);
  carveRoom(s, CX - 18, CZ - 1, CX + 14, CZ + 1, L1_FLOOR, L1_CEIL); // main corridor (E–W)
  lightFloor(s, CX - 18, CZ - 1, CX + 14, CZ + 1, L1_FLOOR, 0x10c);

  // Prison block (north of the corridor) with barred cells.
  carveRoom(s, CX - 4, CZ - 12, CX + 4, CZ - 4, L1_FLOOR, L1_CEIL);
  carveRoom(s, CX, CZ - 4, CX + 1, CZ + 1, L1_FLOOR, L1_CEIL); // link to corridor
  for (let wx = CX - 3; wx <= CX + 3; wx += 3) {
    s.fill(wx, L1_FLOOR + 1, CZ - 12, wx, L1_CEIL - 1, CZ - 6, OAK_FENCE); // cell partitions
    s.set(wx, L1_FLOOR + 1, CZ - 8, AIR); // a gap = the cell door
  }
  s.set(CX - 3, L1_FLOOR + 1, CZ - 5, LANTERN);

  // Guardroom (south of the corridor) — furnace, and the concealed escape passage.
  carveRoom(s, CX - 4, CZ + 4, CX + 4, CZ + 12, L1_FLOOR, L1_CEIL);
  carveRoom(s, CX, CZ + 1, CX + 1, CZ + 4, L1_FLOOR, L1_CEIL); // link to corridor
  s.set(CX - 3, L1_FLOOR + 1, CZ + 11, FURNACE);
  s.set(CX + 3, L1_FLOOR + 1, CZ + 5, LANTERN);

  // Great crypt hall at the west end — pillars + glow, with the stair down to the crypt level.
  carveRoom(s, CX - 26, CZ - 6, CX - 14, CZ + 6, L1_FLOOR, L1_CEIL + 1, COBBLESTONE, COBBLESTONE);
  for (let px = CX - 23; px <= CX - 17; px += 3) {
    for (let pz = CZ - 3; pz <= CZ + 3; pz += 3) {
      s.fill(px, L1_FLOOR + 1, pz, px, L1_CEIL, pz, COBBLESTONE);
      s.set(px, L1_CEIL, pz, GLOWSTONE);
    }
  }
  lightFloor(s, CX - 26, CZ - 6, CX - 14, CZ + 6, L1_FLOOR, 0x20c);

  // Stair shaft down to level 2.
  s.fill(
    L2_STAIR_X - 1,
    L2_FLOOR + 1,
    L2_STAIR_Z - 1,
    L2_STAIR_X + 1,
    L1_FLOOR,
    L2_STAIR_Z + 1,
    AIR,
  );
  spiralStair(s, L2_STAIR_X, L2_STAIR_Z, L2_FLOOR, L1_FLOOR, COBBLESTONE, COBBLESTONE);
}

function buildLevel2(s: CitadelStamp): void {
  // The crypt chamber.
  carveRoom(s, CX - 26, CZ - 6, CX - 12, CZ + 10, L2_FLOOR, L2_CEIL, BRICK, COBBLESTONE);
  lightFloor(s, CX - 26, CZ - 6, CX - 12, CZ + 10, L2_FLOOR, 0x30c);

  // Central sarcophagus with a glowing head.
  s.fill(CX - 21, L2_FLOOR + 1, CZ, CX - 17, L2_FLOOR + 1, CZ + 2, BRICK);
  s.fill(CX - 21, L2_FLOOR + 2, CZ, CX - 21, L2_FLOOR + 2, CZ + 2, BRICK);
  s.set(CX - 19, L2_FLOOR + 2, CZ + 1, GLOWSTONE);

  // Corner pillars with crystal capitals.
  for (const [px, pz] of [
    [CX - 24, CZ - 4],
    [CX - 14, CZ - 4],
    [CX - 24, CZ + 8],
    [CX - 14, CZ + 8],
  ]) {
    s.fill(px, L2_FLOOR + 1, pz, px, L2_CEIL - 1, pz, COBBLESTONE);
    s.set(px, L2_CEIL - 1, pz, CRYSTAL);
  }

  // Fenced-off treasure vault in the NW corner (one gap is the gate).
  s.fill(CX - 22, L2_FLOOR + 1, CZ - 5, CX - 22, L2_CEIL - 1, CZ - 2, OAK_FENCE);
  s.fill(CX - 25, L2_FLOOR + 1, CZ - 2, CX - 22, L2_CEIL - 1, CZ - 2, OAK_FENCE);
  s.set(CX - 22, L2_FLOOR + 1, CZ - 3, AIR); // vault gate
  s.set(CX - 24, L2_FLOOR + 1, CZ - 5, GOLD_ORE);
  s.set(CX - 23, L2_FLOOR + 1, CZ - 5, EMERALD_ORE);
  s.set(CX - 25, L2_FLOOR + 1, CZ - 4, CRYSTAL);
  s.fill(CX - 25, L2_FLOOR + 1, CZ - 5, CX - 25, L2_FLOOR + 2, CZ - 5, BOOKSHELF);
  s.set(CX - 24, L2_CEIL - 1, CZ - 4, GLOWSTONE);

  // A deep well in the SE corner: an open shaft dropping toward the natural caves below.
  s.fill(CX - 15, 52, CZ + 7, CX - 13, L2_CEIL - 1, CZ + 9, AIR);
  s.fill(CX - 15, 50, CZ + 7, CX - 13, 51, CZ + 9, WATER);
  s.outline(CX - 16, CZ + 6, CX - 12, CZ + 10, L2_FLOOR, COBBLESTONE); // well rim
}

/**
 * A concealed escape passage from the guardroom that runs south, under the curtain wall, and
 * daylights on the mesa hillside well beyond the fortress — a hidden route in and out.
 */
function buildEscapeTunnel(s: CitadelStamp): void {
  const tx0 = CX; // 8 — two-wide passage
  const tx1 = CX + 1; // 9
  const zStart = CZ + 12; // leaves the guardroom's south wall
  const zEnd = CZ + 84; // 92 — far down the southern slope (surface has dropped away by here)
  // Hidden mouth out of the guardroom (a single inconspicuous gap).
  s.fill(tx0, L1_FLOOR + 1, CZ + 11, tx0, L1_FLOOR + 3, CZ + 12, AIR);
  // Flat passage; the roof stays below the courtyard cap, so it only opens where the hill falls away.
  carveRoom(s, tx0, zStart, tx1, zEnd, L1_FLOOR, L1_CEIL - 1, COBBLESTONE, STONE);
  for (let wz = zStart; wz <= zEnd; wz += 8) {
    s.set(tx0, L1_FLOOR + 1, wz, LANTERN);
  }
}

/** A catacomb branch off the prison's north wall: burial niches and a faint glow at the far end. */
function buildCatacomb(s: CitadelStamp): void {
  const x0 = CX - 4; // 4
  const x1 = CX + 4; // 12
  const z0 = CZ - 22; // -14
  const z1 = CZ - 14; // -6
  carveRoom(s, x0, z0, x1, z1, L1_FLOOR, L1_CEIL, BRICK, COBBLESTONE);
  carveRoom(s, CX, CZ - 6, CX + 1, CZ - 3, L1_FLOOR, L1_CEIL); // link north out of the prison
  for (let wz = z0 + 1; wz <= z1 - 1; wz += 2) {
    s.fill(x0, L1_FLOOR + 1, wz, x0, L1_FLOOR + 2, wz, BRICK); // tomb niches along both walls
    s.fill(x1, L1_FLOOR + 1, wz, x1, L1_FLOOR + 2, wz, BRICK);
  }
  s.set(CX, L1_FLOOR + 1, z0 + 1, GLOWSTONE);
  s.set(x1 - 1, L1_FLOOR + 1, z1 - 1, LANTERN);
}

/** Carves the full multi-level dungeon beneath the citadel. Deterministic; chunk-clipped. */
export function buildDungeon(s: CitadelStamp, _seed: WorldSeed): void {
  buildEntrance(s);
  buildLevel1(s);
  buildCatacomb(s);
  buildLevel2(s);
  buildEscapeTunnel(s);
}
