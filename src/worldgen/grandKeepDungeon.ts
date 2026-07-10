import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  LANTERN,
  GLOWSTONE,
  IRON_ORE,
  GOLD_ORE,
  CRYSTAL,
  OAK_FENCE,
  DEEPSLATE,
} from '../blocks/blocks';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import {
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  KCZ,
  FLOOR,
  DUNGEON_FLOOR,
  DUNGEON_CEIL,
  DUNGEON_SHAFT,
} from './grandKeepFrame';

/**
 * Underground works beneath the keep: main corridor, cells, storage, and a central prison vault.
 * Connected to the Great Hall by the dungeon shaft spiral (built in grandKeepKeep).
 */
export function buildDungeon(s: CitadelStamp): void {
  const y0 = DUNGEON_FLOOR;
  const y1 = DUNGEON_CEIL; // headroom ~10 blocks

  // Seal a stone box under the keep footprint (floor, walls, ceiling) so caves cannot open the sides.
  s.fill(KX0 + 2, y0 - 1, KZ0 + 2, KX1 - 2, y0 - 1, KZ1 - 2, DEEPSLATE);
  s.fill(KX0 + 2, y0, KZ0 + 2, KX1 - 2, y1, KZ1 - 2, STONE); // solid shell
  s.fill(KX0 + 3, y0, KZ0 + 3, KX1 - 3, y1 - 1, KZ1 - 3, AIR); // hollow interior
  s.slab(KX0 + 3, KZ0 + 3, KX1 - 3, KZ1 - 3, y0, COBBLESTONE);
  s.slab(KX0 + 3, KZ0 + 3, KX1 - 3, KZ1 - 3, y1, STONE); // sealed ceiling

  // Structural columns
  for (let x = KX0 + 12; x < KX1 - 12; x += 12) {
    for (let z = KZ0 + 12; z < KZ1 - 12; z += 12) {
      s.fill(x, y0, z, x, y1, z, DEEPSLATE);
    }
  }

  // Main east-west corridor through center
  s.fill(KX0 + 4, y0 + 1, KCZ - 3, KX1 - 4, y0 + 5, KCZ + 3, AIR);
  for (let x = KX0 + 8; x < KX1 - 8; x += 6) {
    s.set(x, y0 + 1, KCZ - 3, LANTERN);
    s.set(x, y0 + 1, KCZ + 3, LANTERN);
  }

  // North-south corridor from shaft
  const sx = DUNGEON_SHAFT.x;
  const sz = DUNGEON_SHAFT.z;
  s.fill(sx - 2, y0 + 1, KZ0 + 4, sx + 2, y0 + 5, KZ1 - 4, AIR);

  // Cell block west
  buildCells(s, KX0 + 6, y0, KZ0 + 8, 4, 3);
  // Cell block east
  buildCells(s, KX1 - 30, y0, KZ0 + 8, 4, 3);

  // Storage rooms south
  room(s, KCX - 10, y0, KZ0 + 6, KCX - 2, y0 + 5, KZ0 + 14);
  room(s, KCX + 2, y0, KZ0 + 6, KCX + 10, y0 + 5, KZ0 + 14);
  s.set(KCX - 6, y0 + 1, KZ0 + 8, LANTERN);
  s.set(KCX + 6, y0 + 1, KZ0 + 8, LANTERN);

  // Central prison vault (focal point) — north of center
  const vx0 = KCX - 10;
  const vx1 = KCX + 10;
  const vz0 = KCZ + 8;
  const vz1 = KCZ + 22;
  s.walls(vx0, y0, vz0, vx1, y1, vz1, BRICK);
  s.fill(vx0 + 1, y0, vz0 + 1, vx1 - 1, y1 - 1, vz1 - 1, AIR);
  s.slab(vx0 + 1, vz0 + 1, vx1 - 1, vz1 - 1, y0, DEEPSLATE);
  // Pillars
  for (const [px, pz] of [
    [KCX - 5, KCZ + 12],
    [KCX + 5, KCZ + 12],
    [KCX - 5, KCZ + 18],
    [KCX + 5, KCZ + 18],
  ] as const) {
    s.fill(px, y0, pz, px, y1 - 1, pz, STONE);
  }
  // Central well / sealed vault ring
  s.fill(KCX - 2, y0, KCZ + 14, KCX + 2, y0, KCZ + 18, WATER_WELL_RING);
  s.fill(KCX - 1, y0 - 3, KCZ + 15, KCX + 1, y0 - 1, KCZ + 17, AIR); // dry well pit
  s.fill(KCX - 1, y0 - 4, KCZ + 15, KCX + 1, y0 - 4, KCZ + 17, DEEPSLATE);
  s.set(KCX, y0 + 1, KCZ + 16, GLOWSTONE);
  // Treasure nook
  s.set(KCX, y0 + 1, vz1 - 2, GOLD_ORE);
  s.set(KCX - 1, y0 + 1, vz1 - 2, CRYSTAL);
  s.set(KCX + 1, y0 + 1, vz1 - 2, IRON_ORE);
  // Vault doorway
  s.fill(KCX - 2, y0 + 1, vz0, KCX + 2, y0 + 4, vz0, AIR);
  s.set(KCX - 3, y0 + 1, vz0 + 1, LANTERN);
  s.set(KCX + 3, y0 + 1, vz0 + 1, LANTERN);

  // Lower works corridor to a forgotten dead-end chamber (returnable)
  s.fill(KX0 + 6, y0 + 1, KZ1 - 14, KX0 + 20, y0 + 4, KZ1 - 10, AIR);
  room(s, KX0 + 6, y0, KZ1 - 22, KX0 + 18, y0 + 5, KZ1 - 14);
  s.set(KX0 + 12, y0 + 1, KZ1 - 18, LANTERN);
  s.set(KX0 + 10, y0 + 1, KZ1 - 16, CRYSTAL);

  // Ensure shaft area clear and spiral intact (re-stamp spiral)
  spiralStair(s, sx, sz, y0, FLOOR.ground, COBBLESTONE, STONE);
  s.set(sx + 2, y0 + 1, sz, LANTERN);
}

// Use cobble for well ring — WATER would flood; dry pit is more navigable for M1.
const WATER_WELL_RING = COBBLESTONE;

function room(
  s: CitadelStamp,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  yTop: number,
  z1: number,
): void {
  s.walls(x0, y, z0, x1, yTop, z1, STONE);
  s.fill(x0 + 1, y, z0 + 1, x1 - 1, yTop - 1, z1 - 1, AIR);
  s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, y, COBBLESTONE);
  const mx = (x0 + x1) >> 1;
  s.fill(mx - 1, y + 1, z0, mx + 1, y + 3, z0, AIR);
}

function buildCells(
  s: CitadelStamp,
  originX: number,
  y: number,
  originZ: number,
  cols: number,
  rows: number,
): void {
  const cellW = 5;
  const cellD = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = originX + c * (cellW + 1);
      const z0 = originZ + r * (cellD + 1);
      const x1 = x0 + cellW;
      const z1 = z0 + cellD;
      s.walls(x0, y, z0, x1, y + 4, z1, COBBLESTONE);
      s.fill(x0 + 1, y, z0 + 1, x1 - 1, y + 3, z1 - 1, AIR);
      // Barred door opening
      s.fill(x0 + 2, y + 1, z0, x0 + 3, y + 3, z0, AIR);
      s.set(x0 + 2, y + 1, z0, OAK_FENCE);
      s.set(x0 + 3, y + 1, z0, OAK_FENCE);
      s.set(x0 + 2, y + 2, z0, OAK_FENCE);
      s.set(x0 + 3, y + 2, z0, OAK_FENCE);
      if (hash2(x0, z0, 0xc31) < 0.5) s.set(x0 + 2, y + 1, z0 + 2, LANTERN);
    }
  }
}
