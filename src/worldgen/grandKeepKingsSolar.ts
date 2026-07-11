/**
 * The King's Solar — a multi-storey open royal apartment spanning the full keep footprint.
 *
 * Placement rationale
 * -------------------
 * STACK[10]–[14] sits above the throne/state sequence (public power) and below the library/war
 * floors (work of rule). That matches the medieval *solar* / great chamber: private royal living
 * above the ceremonial rooms, still deep in the keep hierarchy.
 *
 * Inspiration (external)
 * ----------------------
 * - Medieval **solar**: private upper living/bedchamber of the lord (castles & manor houses)
 * - English **great chamber**: combined reception + sleeping grandeur
 * - Versailles **King's State Apartment**: parade sequence — here collapsed into one open volume
 * - Palace **grand staircases**: visible, ceremonial climbs (e.g. Buckingham Grand Staircase)
 * - Atrium / double-height halls: open ceiling so the room reads as a vertical palace within a palace
 *
 * Programme
 * ---------
 * - Full keep plan (minus stair shafts) hollowed for ~5 storeys
 * - Open atrium with skylight roof
 * - Perimeter galleries at intermediate levels (walkable, railed, looking into the void)
 * - Twin freestanding monumental stairs (visible from everywhere in the room)
 * - Royal bed dais, audience platform, hearths, columns, hanging lights, tall window walls
 */
import {
  AIR,
  STONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  LANTERN,
  GLOWSTONE,
  GOLD_ORE,
  CRYSTAL,
  EMERALD_ORE,
  FURNACE,
  OAK_FENCE,
  COBBLE_WALL,
  TERRACOTTA,
  DEEPSLATE,
  STAIRS_STONE,
  STAIRS_PLANK,
  STAIRS_BRICK,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp } from './CitadelStamp';
import {
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  KCZ,
  FLOOR,
  KING_GALLERIES,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  STAIR_Z1,
  SEC_X0,
  SEC_X1,
  SEC_Z0,
  SEC_Z1,
} from './grandKeepFrame';
import { NORTH_STAIR, MID_STAIR } from './grandKeepInteriors';
import { stairFlightZ } from './grandKeepPrimitives';

const Y0 = () => FLOOR.king;
const YTOP = () => FLOOR.kingTop;

/** True if world (x,z) is reserved for a vertical stair shaft we must not fill solid. */
function inStairShaft(x: number, z: number): boolean {
  if (x >= STAIR_X0 && x <= STAIR_X1 && z >= STAIR_Z0 && z <= STAIR_Z1) return true;
  if (x >= SEC_X0 && x <= SEC_X1 && z >= SEC_Z0 && z <= SEC_Z1) return true;
  if (x >= NORTH_STAIR.x0 && x <= NORTH_STAIR.x1 && z >= NORTH_STAIR.z0 && z <= NORTH_STAIR.z1)
    return true;
  if (x >= MID_STAIR.x0 && x <= MID_STAIR.x1 && z >= MID_STAIR.z0 && z <= MID_STAIR.z1) return true;
  return false;
}

/** Hollow the full multi-storey volume (preserve stair shafts). */
function hollowAtrium(s: CitadelStamp): void {
  const y0 = Y0();
  const y1 = YTOP();
  const ax = Math.max(KX0 + 2, s.wx0);
  const bx = Math.min(KX1 - 2, s.wx1);
  const az = Math.max(KZ0 + 2, s.wz0);
  const bz = Math.min(KZ1 - 2, s.wz1);
  for (let wy = y0; wy <= y1; wy++) {
    for (let wz = az; wz <= bz; wz++) {
      for (let wx = ax; wx <= bx; wx++) {
        if (inStairShaft(wx, wz)) continue;
        // Keep outer shell walls of the keep (already built) — only clear interior
        if (wx <= KX0 + 1 || wx >= KX1 - 1 || wz <= KZ0 + 1 || wz >= KZ1 - 1) continue;
        s.set(wx, wy, wz, AIR);
      }
    }
  }
  // Solid royal floor
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      if (inStairShaft(wx, wz)) continue;
      if (wx <= KX0 + 1 || wx >= KX1 - 1 || wz <= KZ0 + 1 || wz >= KZ1 - 1) continue;
      // Carpet axis + stone field
      if (Math.abs(wx - KCX) <= 3) s.set(wx, y0, wz, TERRACOTTA);
      else s.set(wx, y0, wz, STONE);
    }
  }
}

/** Perimeter galleries at intermediate levels — walkable rings looking into the atrium. */
function buildGalleries(s: CitadelStamp): void {
  const depth = 5; // gallery walk depth from outer wall
  for (const gy of KING_GALLERIES) {
    // South gallery
    for (let x = KX0 + 3; x <= KX1 - 3; x++) {
      for (let d = 2; d <= depth; d++) {
        const z = KZ0 + d;
        if (inStairShaft(x, z)) continue;
        s.set(x, gy, z, PLANKS);
      }
      s.set(x, gy + 1, KZ0 + depth, COBBLE_WALL); // rail toward void
    }
    // North gallery
    for (let x = KX0 + 3; x <= KX1 - 3; x++) {
      for (let d = 2; d <= depth; d++) {
        const z = KZ1 - d;
        if (inStairShaft(x, z)) continue;
        s.set(x, gy, z, PLANKS);
      }
      s.set(x, gy + 1, KZ1 - depth, COBBLE_WALL);
    }
    // West gallery
    for (let z = KZ0 + 3; z <= KZ1 - 3; z++) {
      for (let d = 2; d <= depth; d++) {
        const x = KX0 + d;
        if (inStairShaft(x, z)) continue;
        s.set(x, gy, z, PLANKS);
      }
      if (!inStairShaft(KX0 + depth, z)) s.set(KX0 + depth, gy + 1, z, COBBLE_WALL);
    }
    // East gallery (stop before grand stair well)
    for (let z = KZ0 + 3; z <= KZ1 - 3; z++) {
      for (let d = 2; d <= depth; d++) {
        const x = STAIR_X0 - d;
        if (x <= KCX) continue;
        if (inStairShaft(x, z)) continue;
        s.set(x, gy, z, PLANKS);
      }
      const railX = STAIR_X0 - depth;
      if (railX > KCX && !inStairShaft(railX, z)) s.set(railX, gy + 1, z, COBBLE_WALL);
    }
    // Gallery lanterns
    for (let x = KX0 + 8; x < KX1 - 8; x += 10) {
      s.set(x, gy + 1, KZ0 + 3, LANTERN);
      s.set(x, gy + 1, KZ1 - 3, LANTERN);
    }
    // Access from east grand stair well into galleries
    s.fill(STAIR_X0, gy + 1, STAIR_Z0 + 4, STAIR_X0, gy + 3, STAIR_Z0 + 8, AIR);
  }
}

/**
 * Twin freestanding monumental stairs rising through the open atrium.
 * West stair climbs south→north; east stair climbs north→south (counter-processional drama).
 */
function buildVisibleStairs(s: CitadelStamp): void {
  const y0 = Y0();
  const yTop = YTOP();
  const rise = yTop - y0; // ~40
  const flight = 5;
  const westX0 = KCX - 22;
  const westX1 = KCX - 16; // 7 wide
  const eastX0 = KCX + 16;
  const eastX1 = KCX + 22;

  // Clear shafts for freestanding stairs (air already clear)
  // Build stacked switchbacks up the full atrium height
  let y = y0;
  let goingPosZ = true;
  let safety = 0;
  while (y < yTop - 1 && safety < 40) {
    safety++;
    const steps = Math.min(flight, yTop - y);
    if (goingPosZ) {
      stairFlightZ(s, westX0, westX1, KZ0 + 10, y, steps, 1, STAIRS_STONE);
      stairFlightZ(s, eastX0, eastX1, KZ1 - 10, y, steps, -1, STAIRS_STONE);
      const landY = y + steps;
      if (landY < yTop) {
        s.fill(westX0 - 1, landY, KZ0 + 10 + steps, westX1 + 1, landY, KZ0 + 14 + steps, PLANKS);
        s.fill(eastX0 - 1, landY, KZ1 - 14 - steps, eastX1 + 1, landY, KZ1 - 10 - steps, PLANKS);
        s.set(westX0, landY + 1, KZ0 + 12 + steps, LANTERN);
        s.set(eastX1, landY + 1, KZ1 - 12 - steps, LANTERN);
      }
    } else {
      stairFlightZ(s, westX0, westX1, KZ1 - 10, y, steps, -1, STAIRS_STONE);
      stairFlightZ(s, eastX0, eastX1, KZ0 + 10, y, steps, 1, STAIRS_STONE);
      const landY = y + steps;
      if (landY < yTop) {
        s.fill(westX0 - 1, landY, KZ1 - 14 - steps, westX1 + 1, landY, KZ1 - 10 - steps, PLANKS);
        s.fill(eastX0 - 1, landY, KZ0 + 10 + steps, eastX1 + 1, landY, KZ0 + 14 + steps, PLANKS);
      }
    }
    // Support piers under landings (architectural legs — keep stairs "visible" but grounded)
    for (const x of [westX0, westX1, eastX0, eastX1]) {
      s.fill(x, y0, KCZ, x, Math.min(y + steps, yTop - 1), KCZ, STONE);
    }
    y += steps;
    goingPosZ = !goingPosZ;
  }

  // Connect landings into perimeter galleries where they meet
  for (const gy of KING_GALLERIES) {
    s.fill(westX0, gy, KZ0 + 4, westX1, gy, KZ0 + 6, PLANKS);
    s.fill(eastX0, gy, KZ0 + 4, eastX1, gy, KZ0 + 6, PLANKS);
    s.fill(westX0, gy, KZ1 - 6, westX1, gy, KZ1 - 4, PLANKS);
    s.fill(eastX0, gy, KZ1 - 6, eastX1, gy, KZ1 - 4, PLANKS);
  }

  void rise;
}

/** Structural columns — sparse rhythm so the room stays open. */
function buildColumns(s: CitadelStamp): void {
  const y0 = Y0();
  const y1 = YTOP() - 1;
  const cols: Array<[number, number]> = [
    [KCX - 28, KCZ - 12],
    [KCX - 28, KCZ + 12],
    [KCX + 28, KCZ - 12],
    [KCX + 28, KCZ + 12],
    [KCX - 12, KCZ - 18],
    [KCX + 12, KCZ - 18],
    [KCX - 12, KCZ + 18],
    [KCX + 12, KCZ + 18],
  ];
  for (const [x, z] of cols) {
    if (inStairShaft(x, z)) continue;
    s.fill(x, y0 + 1, z, x, y1, z, STONE);
    s.set(x, y0 + 8, z, LANTERN);
    s.set(x, y0 + 20, z, LANTERN);
    s.set(x, y1, z, BRICK); // capital
  }
}

/**
 * King's Chamber focal zone — monumental red-draped four-poster, treasure vault flanks,
 * audience dais, hearths, and council table. Red read uses BRICK (deep red) + TERRACOTTA accents.
 */
function dressRoyalFocus(s: CitadelStamp): void {
  const y0 = Y0();

  // ── King's Chamber dais (north third of the solar) ──────────────────────
  const bedZ = KZ1 - 16;
  // Wide raised marble/stone plinth
  s.fill(KCX - 14, y0, bedZ - 6, KCX + 14, y0, bedZ + 4, DEEPSLATE);
  s.fill(KCX - 12, y0 + 1, bedZ - 5, KCX + 12, y0 + 1, bedZ + 3, STONE);
  // Red carpet runner up onto the dais
  for (let z = KCZ + 4; z <= bedZ + 3; z++) {
    for (let x = KCX - 3; x <= KCX + 3; x++) s.set(x, y0, z, BRICK);
  }
  s.fill(KCX - 10, y0 + 1, bedZ - 4, KCX + 10, y0 + 1, bedZ + 2, BRICK); // red rug under bed

  // ── Monumental king bed (about 11×6 footprint) ─────────────────────────
  // Gold-trimmed wooden frame
  s.fill(KCX - 5, y0 + 2, bedZ - 3, KCX + 5, y0 + 2, bedZ + 2, WOOD);
  s.fill(KCX - 5, y0 + 2, bedZ - 3, KCX + 5, y0 + 3, bedZ - 3, GOLD_ORE); // headboard gold bar
  s.fill(KCX - 5, y0 + 2, bedZ + 2, KCX + 5, y0 + 3, bedZ + 2, GOLD_ORE); // footboard gold
  // Thick layered mattress (red bedding)
  s.fill(KCX - 4, y0 + 3, bedZ - 2, KCX + 4, y0 + 3, bedZ + 1, BRICK); // lower red
  s.fill(KCX - 4, y0 + 4, bedZ - 2, KCX + 4, y0 + 4, bedZ + 1, TERRACOTTA); // upper coverlet
  // Pillows at head (north)
  s.fill(KCX - 3, y0 + 5, bedZ - 2, KCX - 1, y0 + 5, bedZ - 1, BRICK);
  s.fill(KCX + 1, y0 + 5, bedZ - 2, KCX + 3, y0 + 5, bedZ - 1, BRICK);
  s.set(KCX - 2, y0 + 6, bedZ - 2, TERRACOTTA);
  s.set(KCX + 2, y0 + 6, bedZ - 2, TERRACOTTA);
  // Folded foot blanket
  s.fill(KCX - 4, y0 + 5, bedZ + 1, KCX + 4, y0 + 5, bedZ + 1, BRICK);
  s.fill(KCX - 3, y0 + 5, bedZ, KCX + 3, y0 + 5, bedZ, TERRACOTTA);

  // Four-poster posts (tall) with gold finials
  for (const [px, pz] of [
    [KCX - 5, bedZ - 3],
    [KCX + 5, bedZ - 3],
    [KCX - 5, bedZ + 2],
    [KCX + 5, bedZ + 2],
  ] as const) {
    s.fill(px, y0 + 2, pz, px, y0 + 14, pz, WOOD);
    s.set(px, y0 + 15, pz, GOLD_ORE);
    s.set(px, y0 + 16, pz, CRYSTAL);
  }
  // Canopy roof — red underside + wood top
  s.fill(KCX - 5, y0 + 13, bedZ - 3, KCX + 5, y0 + 13, bedZ + 2, BRICK);
  s.fill(KCX - 5, y0 + 14, bedZ - 3, KCX + 5, y0 + 14, bedZ + 2, WOOD);
  s.set(KCX, y0 + 15, bedZ, GLOWSTONE);
  s.fill(KCX - 1, y0 + 15, bedZ, KCX + 1, y0 + 15, bedZ, GOLD_ORE);

  // Heavy red bed curtains (brick hangs) on all four sides, open at foot center
  for (let y = y0 + 5; y <= y0 + 12; y++) {
    for (const x of [KCX - 5, KCX + 5]) {
      s.set(x, y, bedZ - 2, BRICK);
      s.set(x, y, bedZ - 1, BRICK);
      s.set(x, y, bedZ, BRICK);
      s.set(x, y, bedZ + 1, BRICK);
    }
    // Head curtain wall
    for (let x = KCX - 4; x <= KCX + 4; x++) s.set(x, y, bedZ - 3, BRICK);
    // Foot curtains (leave center open to walk up)
    s.set(KCX - 4, y, bedZ + 2, BRICK);
    s.set(KCX - 3, y, bedZ + 2, BRICK);
    s.set(KCX + 3, y, bedZ + 2, BRICK);
    s.set(KCX + 4, y, bedZ + 2, BRICK);
  }

  // Nightstands
  for (const nx of [KCX - 7, KCX + 7]) {
    s.fill(nx, y0 + 2, bedZ - 1, nx, y0 + 3, bedZ, WOOD);
    s.set(nx, y0 + 4, bedZ, LANTERN);
    s.set(nx, y0 + 4, bedZ - 1, GOLD_ORE);
  }

  // ── Treasure vault flanks (open chests / pedestals) ────────────────────
  // West treasure alcove
  s.fill(KCX - 18, y0 + 1, bedZ - 4, KCX - 12, y0 + 1, bedZ + 2, DEEPSLATE);
  // Chest blocks (wood crates)
  s.fill(KCX - 17, y0 + 2, bedZ - 3, KCX - 15, y0 + 3, bedZ - 1, WOOD);
  s.fill(KCX - 17, y0 + 2, bedZ, KCX - 15, y0 + 3, bedZ + 1, WOOD);
  // Spilled treasure on and around chests
  s.set(KCX - 16, y0 + 4, bedZ - 2, GOLD_ORE);
  s.set(KCX - 15, y0 + 4, bedZ - 1, GOLD_ORE);
  s.set(KCX - 17, y0 + 4, bedZ, EMERALD_ORE);
  s.set(KCX - 16, y0 + 4, bedZ + 1, CRYSTAL);
  s.set(KCX - 14, y0 + 2, bedZ - 2, GOLD_ORE);
  s.set(KCX - 14, y0 + 2, bedZ, EMERALD_ORE);
  s.set(KCX - 13, y0 + 2, bedZ - 1, GOLD_ORE);
  s.set(KCX - 13, y0 + 2, bedZ + 1, CRYSTAL);
  // Pedestal with crown jewel
  s.fill(KCX - 18, y0 + 2, bedZ - 1, KCX - 18, y0 + 3, bedZ - 1, STONE);
  s.set(KCX - 18, y0 + 4, bedZ - 1, CRYSTAL);
  s.set(KCX - 18, y0 + 5, bedZ - 1, GOLD_ORE);

  // East treasure alcove (mirror)
  s.fill(KCX + 12, y0 + 1, bedZ - 4, KCX + 18, y0 + 1, bedZ + 2, DEEPSLATE);
  s.fill(KCX + 15, y0 + 2, bedZ - 3, KCX + 17, y0 + 3, bedZ - 1, WOOD);
  s.fill(KCX + 15, y0 + 2, bedZ, KCX + 17, y0 + 3, bedZ + 1, WOOD);
  s.set(KCX + 16, y0 + 4, bedZ - 2, GOLD_ORE);
  s.set(KCX + 15, y0 + 4, bedZ - 1, EMERALD_ORE);
  s.set(KCX + 17, y0 + 4, bedZ, GOLD_ORE);
  s.set(KCX + 16, y0 + 4, bedZ + 1, CRYSTAL);
  s.set(KCX + 14, y0 + 2, bedZ - 2, GOLD_ORE);
  s.set(KCX + 14, y0 + 2, bedZ, CRYSTAL);
  s.set(KCX + 13, y0 + 2, bedZ - 1, EMERALD_ORE);
  s.set(KCX + 13, y0 + 2, bedZ + 1, GOLD_ORE);
  s.fill(KCX + 18, y0 + 2, bedZ - 1, KCX + 18, y0 + 3, bedZ - 1, STONE);
  s.set(KCX + 18, y0 + 4, bedZ - 1, CRYSTAL);
  s.set(KCX + 18, y0 + 5, bedZ - 1, GOLD_ORE);

  // Coin scatter (gold ore) on red rug before the bed
  for (const [dx, dz] of [
    [-2, 3],
    [0, 4],
    [2, 3],
    [-1, 5],
    [1, 5],
    [-3, 4],
    [3, 4],
  ] as const) {
    s.set(KCX + dx, y0 + 2, bedZ + dz, GOLD_ORE);
  }

  // Red banner poles behind the bed (north wall)
  for (const bx of [KCX - 8, KCX - 3, KCX + 3, KCX + 8]) {
    s.fill(bx, y0 + 2, KZ1 - 3, bx, y0 + 12, KZ1 - 3, WOOD);
    s.fill(bx, y0 + 8, KZ1 - 4, bx, y0 + 11, KZ1 - 4, BRICK);
    s.set(bx, y0 + 12, KZ1 - 3, GOLD_ORE);
  }

  // ── Center-south: private audience dais ────────────────────────────────
  s.fill(KCX - 10, y0, KCZ - 8, KCX + 10, y0, KCZ - 2, STONE);
  s.fill(KCX - 6, y0 + 1, KCZ - 6, KCX + 6, y0 + 1, KCZ - 3, STONE);
  s.fill(KCX - 2, y0 + 2, KCZ - 5, KCX + 2, y0 + 2, KCZ - 4, PLANKS);
  s.set(KCX, y0 + 3, KCZ - 4, GOLD_ORE);
  s.set(KCX, y0 + 4, KCZ - 4, CRYSTAL);
  for (const bx of [KCX - 8, KCX + 8]) {
    s.fill(bx, y0 + 1, KCZ - 5, bx, y0 + 8, KCZ - 5, WOOD);
    s.set(bx, y0 + 7, KCZ - 4, BRICK);
  }

  // ── Twin hearths (east & west walls of the solar) ──────────────────────
  for (const hx of [KX0 + 8, STAIR_X0 - 10]) {
    s.fill(hx - 2, y0 + 1, KCZ - 2, hx + 2, y0 + 1, KCZ + 2, BRICK);
    s.fill(hx - 1, y0 + 2, KCZ - 1, hx + 1, y0 + 5, KCZ + 1, BRICK);
    s.set(hx, y0 + 2, KCZ, GLOWSTONE);
    s.set(hx, y0 + 3, KCZ, GLOWSTONE);
    s.set(hx - 1, y0 + 2, KCZ - 2, FURNACE);
  }

  // Long council table mid-room
  s.fill(KCX - 14, y0 + 1, KCZ + 6, KCX + 14, y0 + 1, KCZ + 8, PLANKS);
  for (let x = KCX - 12; x <= KCX + 12; x += 4) {
    s.set(x, y0 + 2, KCZ + 7, LANTERN);
    s.set(x, y0 + 1, KCZ + 5, STAIRS_PLANK, packState(FACING.S, 0));
    s.set(x, y0 + 1, KCZ + 9, STAIRS_PLANK, packState(FACING.N, 0));
  }

  // Red carpet spine + gold edge markers
  for (let z = KZ0 + 8; z < bedZ - 6; z++) {
    for (let x = KCX - 2; x <= KCX + 2; x++) s.set(x, y0, z, BRICK);
  }
  for (let z = KZ0 + 8; z < KZ1 - 10; z += 6) {
    s.set(KCX - 4, y0, z, GOLD_ORE);
    s.set(KCX + 4, y0, z, GOLD_ORE);
  }

  // Steps of brick onto the bed dais (visible approach)
  for (let i = 0; i < 2; i++) {
    for (let x = KCX - 6; x <= KCX + 6; x++) {
      s.set(x, y0 + 1 + i, bedZ + 4 - i, STAIRS_BRICK, packState(FACING.N, 0));
    }
  }
}

/** Tall multi-storey window walls — the open room drinks light. */
function tallWindows(s: CitadelStamp): void {
  const y0 = Y0();
  const y1 = YTOP() - 1;
  // South wall — huge window bays (courtyard view)
  for (let x = KX0 + 8; x < STAIR_X0 - 4; x += 8) {
    if (Math.abs(x - KCX) < 6) continue; // leave entrance bay
    s.fill(x, y0 + 3, KZ0, x + 3, y1 - 2, KZ0, GLASS);
  }
  // North wall high windows
  for (let x = KX0 + 10; x < KX1 - 10; x += 10) {
    s.fill(x, y0 + 4, KZ1, x + 2, y1 - 2, KZ1, GLASS);
  }
  // West wall
  for (let z = KZ0 + 12; z < KZ1 - 12; z += 10) {
    s.fill(KX0, y0 + 3, z, KX0, y1 - 2, z + 2, GLASS);
  }
}

/** Open skylight ceiling — stone ribs + glass panels. */
function skylight(s: CitadelStamp): void {
  const y = YTOP();
  // Rib frame
  for (let x = KX0 + 4; x <= KX1 - 4; x += 6) {
    for (let z = KZ0 + 4; z <= KZ1 - 4; z++) {
      if (inStairShaft(x, z)) continue;
      s.set(x, y, z, STONE);
    }
  }
  for (let z = KZ0 + 4; z <= KZ1 - 4; z += 6) {
    for (let x = KX0 + 4; x <= KX1 - 4; x++) {
      if (inStairShaft(x, z)) continue;
      s.set(x, y, z, STONE);
    }
  }
  // Glass panels between ribs
  for (let x = KX0 + 5; x < KX1 - 4; x++) {
    for (let z = KZ0 + 5; z < KZ1 - 4; z++) {
      if (inStairShaft(x, z)) continue;
      if (x % 6 === 0 || z % 6 === 0) continue;
      s.set(x, y, z, GLASS);
    }
  }
  // Hanging chandeliers from ribs
  for (const [lx, lz] of [
    [KCX, KCZ],
    [KCX - 16, KCZ - 10],
    [KCX + 16, KCZ - 10],
    [KCX - 16, KCZ + 10],
    [KCX + 16, KCZ + 10],
    [KCX, KZ0 + 16],
    [KCX, KZ1 - 16],
  ] as const) {
    if (inStairShaft(lx, lz)) continue;
    s.fill(lx, y - 8, lz, lx, y - 1, lz, OAK_FENCE);
    s.set(lx, y - 8, lz, GLOWSTONE);
    s.set(lx - 1, y - 8, lz, GLOWSTONE);
    s.set(lx + 1, y - 8, lz, GLOWSTONE);
    s.set(lx, y - 8, lz - 1, GLOWSTONE);
    s.set(lx, y - 8, lz + 1, GLOWSTONE);
  }
}

/** Monumental south entrance into the solar from lower floors / grand stair. */
function grandEntrance(s: CitadelStamp): void {
  const y0 = Y0();
  // 7-wide portal
  s.fill(KCX - 4, y0 + 1, KZ0, KCX + 4, y0 + 8, KZ0, AIR);
  // Arch thickening
  s.fill(KCX - 5, y0 + 8, KZ0, KCX + 5, y0 + 9, KZ0, STONE);
  s.fill(KCX - 3, y0 + 9, KZ0, KCX + 3, y0 + 10, KZ0, STONE);
  // Flanking columns
  for (const x of [KCX - 6, KCX + 6]) {
    s.fill(x, y0 + 1, KZ0 + 1, x, y0 + 12, KZ0 + 1, BRICK);
    s.set(x, y0 + 13, KZ0 + 1, GLOWSTONE);
  }
  // Steps up from south gallery approach (one block pride)
  for (let i = 0; i < 2; i++) {
    for (let x = KCX - 5; x <= KCX + 5; x++) {
      s.set(x, y0 - 1 + i, KZ0 - 1 - i, STAIRS_STONE, packState(FACING.S, 0));
    }
  }
  // Side access from grand stair at base
  s.fill(STAIR_X0, y0 + 1, STAIR_Z0 + 4, STAIR_X0, y0 + 4, STAIR_Z0 + 10, AIR);
  // Plaque / gold door surround
  s.set(KCX - 5, y0 + 5, KZ0, GOLD_ORE);
  s.set(KCX + 5, y0 + 5, KZ0, GOLD_ORE);
}

/**
 * Build the full King's Solar. Call after keep floors/interiors so this volume wins.
 */
export function buildKingsSolar(s: CitadelStamp): void {
  hollowAtrium(s);
  buildGalleries(s);
  buildVisibleStairs(s);
  buildColumns(s);
  tallWindows(s);
  skylight(s);
  dressRoyalFocus(s);
  grandEntrance(s);

  // Corner spiral accent (small decorative newel visible in SE of solar, not a shaft hog)
  // — skipped; freestanding stairs already dominate

  // Ensure vertical circulation shafts still open into the solar at each gallery
  const scz = (SEC_Z0 + SEC_Z1) >> 1;
  for (const gy of [Y0(), ...KING_GALLERIES, YTOP()]) {
    s.fill(STAIR_X0, gy + 1, STAIR_Z0 + 3, STAIR_X0, gy + 3, STAIR_Z0 + 8, AIR);
    s.fill(SEC_X1, gy + 1, scz - 1, SEC_X1, gy + 3, scz + 1, AIR);
  }
}
