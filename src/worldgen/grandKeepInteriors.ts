/**
 * Deep interior circulation for The Grand Keep — corridors, room chains, and extra stairs
 * so the player can walk a long time without leaving the building.
 */
import {
  AIR,
  BRICK,
  PLANKS,
  STONE,
  GLASS,
  LANTERN,
  GLOWSTONE,
  BOOKSHELF,
  FURNACE,
  COBBLESTONE,
  STAIRS_STONE,
  CRYSTAL,
  COBBLE_WALL,
} from '../blocks/blocks';
import { CitadelStamp, spiralStair, floorWithStairHole } from './CitadelStamp';
import {
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  KCZ,
  FLOOR,
  STACK,
  INTERIOR_STACK,
  STOREY_RISE,
  STAIR_X0,
  STAIR_Z0,
  STAIR_Z1,
  SEC_X0,
  SEC_X1,
  SEC_Z0,
  SEC_Z1,
  CROWN,
  WATCH,
  DUNGEON_SHAFT,
} from './grandKeepFrame';
import { stairFlightZ } from './grandKeepPrimitives';

// ── Third major stair (north service) + mid gallery stair ──────────────────────────────────

/** North-west service spiral: ground → roof (alternate route to battlements). */
export const NORTH_STAIR = {
  x0: KX0 + 4,
  x1: KX0 + 11,
  z0: KZ1 - 18,
  z1: KZ1 - 11,
} as const;

/** Mid-keep gallery stair (compact switchback) east of center: ground → high. */
export const MID_STAIR = {
  x0: KCX + 14,
  x1: KCX + 21,
  z0: KCZ - 4,
  z1: KCZ + 4,
} as const;

function room(
  s: CitadelStamp,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  yTop: number,
  z1: number,
  door: 'n' | 's' | 'e' | 'w' = 's',
): void {
  s.fill(x0, y + 1, z0, x0, yTop, z1, BRICK);
  s.fill(x1, y + 1, z0, x1, yTop, z1, BRICK);
  s.fill(x0, y + 1, z0, x1, yTop, z0, BRICK);
  s.fill(x0, y + 1, z1, x1, yTop, z1, BRICK);
  s.fill(x0 + 1, y + 1, z0 + 1, x1 - 1, yTop - 1, z1 - 1, AIR);
  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (door === 's') s.fill(mx - 1, y + 1, z0, mx + 1, y + 3, z0, AIR);
  else if (door === 'n') s.fill(mx - 1, y + 1, z1, mx + 1, y + 3, z1, AIR);
  else if (door === 'e') s.fill(x1, y + 1, mz - 1, x1, y + 3, mz + 1, AIR);
  else s.fill(x0, y + 1, mz - 1, x0, y + 3, mz + 1, AIR);
  s.set(x0 + 1, y + 1, z0 + 1, LANTERN);
  // Window opposite door when possible
  if (door === 's') {
    s.set(mx, y + 3, z1, GLASS);
    s.set(mx, y + 4, z1, GLASS);
  } else if (door === 'n') {
    s.set(mx, y + 3, z0, GLASS);
    s.set(mx, y + 4, z0, GLASS);
  } else if (door === 'e') {
    s.set(x0, y + 3, mz, GLASS);
    s.set(x0, y + 4, mz, GLASS);
  } else {
    s.set(x1, y + 3, mz, GLASS);
    s.set(x1, y + 4, mz, GLASS);
  }
}

/** 3–4 block wide corridor with lanterns. */
function corridorEW(
  s: CitadelStamp,
  x0: number,
  x1: number,
  z: number,
  y: number,
  halfW = 1,
  height = 4,
): void {
  s.fill(x0, y + 1, z - halfW, x1, y + height, z + halfW, AIR);
  for (let x = x0 + 2; x < x1; x += 6) {
    s.set(x, y + 1, z - halfW, LANTERN);
    // Floor stripe for wayfinding
    s.set(x, y, z, STONE);
  }
}

function corridorNS(
  s: CitadelStamp,
  z0: number,
  z1: number,
  x: number,
  y: number,
  halfW = 1,
  height = 4,
): void {
  s.fill(x - halfW, y + 1, z0, x + halfW, y + height, z1, AIR);
  for (let z = z0 + 2; z < z1; z += 6) {
    s.set(x - halfW, y + 1, z, LANTERN);
    s.set(x, y, z, STONE);
  }
}

/** Punch stair wells through every storey for north + mid stairs. */
export function punchExtraStairWells(s: CitadelStamp): void {
  for (const fy of STACK) {
    if (fy === FLOOR.ground) continue;
    s.fill(NORTH_STAIR.x0, fy, NORTH_STAIR.z0, NORTH_STAIR.x1, fy, NORTH_STAIR.z1, AIR);
    s.fill(MID_STAIR.x0, fy, MID_STAIR.z0, MID_STAIR.x1, fy, MID_STAIR.z1, AIR);
  }
}

export function buildNorthServiceStair(s: CitadelStamp): void {
  const { x0, x1, z0, z1 } = NORTH_STAIR;
  s.walls(x0, FLOOR.ground, z0, x1, FLOOR.roof, z1, STONE);
  s.fill(x0 + 1, FLOOR.ground, z0 + 1, x1 - 1, FLOOR.roof - 1, z1 - 1, AIR);
  const cx = (x0 + x1) >> 1;
  const cz = (z0 + z1) >> 1;
  spiralStair(s, cx, cz, FLOOR.ground, FLOOR.roof, COBBLESTONE, STONE);
  for (const fy of STACK) {
    s.fill(cx - 1, fy + 1, z0, cx + 1, fy + 3, z0, AIR);
    s.set(x0 + 1, fy + 1, z0 + 1, LANTERN);
  }
}

/** Mid-keep switchback from ground all the way to roof. */
export function buildMidGalleryStair(s: CitadelStamp): void {
  const { x0, x1, z0, z1 } = MID_STAIR;
  s.walls(x0, FLOOR.ground, z0, x1, FLOOR.roof, z1, BRICK);
  s.fill(x0 + 1, FLOOR.ground, z0 + 1, x1 - 1, FLOOR.roof - 1, z1 - 1, AIR);
  const stepX0 = x0 + 2;
  const stepX1 = x0 + 5;
  const flight = STOREY_RISE / 2;
  for (let i = 0; i < STACK.length - 1; i++) {
    const y0 = STACK[i];
    const mid = y0 + flight;
    stairFlightZ(s, stepX0, stepX1, z0 + 1, y0, flight, 1, STAIRS_STONE);
    s.fill(x0 + 1, mid, z0 + 1, x1 - 1, mid, z1 - 1, PLANKS);
    stairFlightZ(s, stepX0, stepX1, z1 - 1, mid, flight, -1, STAIRS_STONE);
    s.fill(x0, y0 + 1, (z0 + z1) >> 1, x0, y0 + 3, (z0 + z1) >> 1, AIR);
    s.fill(x1, y0 + 1, (z0 + z1) >> 1, x1, y0 + 3, (z0 + z1) >> 1, AIR);
    s.set(x0 + 1, mid + 1, z0 + 2, LANTERN);
  }
}

/** Secondary stair already runs ground→roof in keep module; ensure roof hole + door. */
export function extendSecondaryToRoof(s: CitadelStamp): void {
  s.fill(SEC_X0, FLOOR.roof, SEC_Z0, SEC_X1, FLOOR.roof, SEC_Z1, AIR);
  const cz = (SEC_Z0 + SEC_Z1) >> 1;
  s.fill(SEC_X1, FLOOR.roof + 1, cz - 1, SEC_X1, FLOOR.roof + 3, cz + 1, AIR);
}

// ── Ground floor deep interiors ────────────────────────────────────────────────────────────

export function buildGroundFloorNetwork(s: CitadelStamp): void {
  const y = FLOOR.ground;

  // West service corridor (N-S) full keep depth
  corridorNS(s, KZ0 + 6, KZ1 - 8, KX0 + 14, y, 2, 5);
  // East gallery corridor (N-S) toward grand stair
  corridorNS(s, KZ0 + 6, KZ1 - 8, STAIR_X0 - 6, y, 2, 5);
  // Cross corridor mid keep (E-W)
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KCZ, y, 2, 5);
  // South cross corridor behind entrance
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ0 + 10, y, 2, 5);
  // North cross corridor
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ1 - 12, y, 2, 5);

  // Kitchen block (SW)
  room(s, KX0 + 4, y, KZ0 + 6, KX0 + 16, y + 7, KZ0 + 16, 'e');
  s.set(KX0 + 6, y + 1, KZ0 + 8, FURNACE);
  s.set(KX0 + 8, y + 1, KZ0 + 8, FURNACE);
  s.fill(KX0 + 6, y + 1, KZ0 + 12, KX0 + 12, y + 1, KZ0 + 12, PLANKS);
  room(s, KX0 + 4, y, KZ0 + 18, KX0 + 16, y + 7, KZ0 + 28, 'e'); // pantry
  s.fill(KX0 + 6, y + 1, KZ0 + 20, KX0 + 6, y + 3, KZ0 + 26, PLANKS);
  room(s, KX0 + 4, y, KZ0 + 30, KX0 + 16, y + 7, KZ0 + 40, 'e'); // servants' hall
  s.fill(KX0 + 6, y + 1, KZ0 + 34, KX0 + 14, y + 1, KZ0 + 34, PLANKS);

  // Guard room + barracks (SE near stair)
  room(s, STAIR_X0 - 16, y, KZ0 + 6, STAIR_X0 - 4, y + 7, KZ0 + 16, 'w');
  room(s, STAIR_X0 - 16, y, KZ0 + 18, STAIR_X0 - 4, y + 7, KZ0 + 28, 'w');
  for (const z of [KZ0 + 10, KZ0 + 14, KZ0 + 22, KZ0 + 26]) {
    s.fill(STAIR_X0 - 14, y + 1, z, STAIR_X0 - 10, y + 1, z, PLANKS); // bunks
  }

  // Chapel chain (south-central interior, behind entrance bay)
  room(s, KCX - 12, y, KZ0 + 4, KCX - 4, y + 8, KZ0 + 14, 'e');
  room(s, KCX + 4, y, KZ0 + 4, KCX + 12, y + 8, KZ0 + 14, 'w');
  // Connecting ambulatory
  corridorEW(s, KCX - 12, KCX + 12, KZ0 + 8, y, 1, 5);

  // Cloister loop rooms NW
  room(s, KX0 + 4, y, KZ1 - 28, KX0 + 16, y + 7, KZ1 - 18, 'e');
  room(s, KX0 + 4, y, KZ1 - 40, KX0 + 16, y + 7, KZ1 - 30, 'e');
  room(s, KX0 + 18, y, KZ1 - 28, KX0 + 30, y + 7, KZ1 - 18, 's');

  // Archive / scriptorium NE of hall
  room(s, STAIR_X0 - 16, y, KZ1 - 28, STAIR_X0 - 4, y + 7, KZ1 - 18, 'w');
  s.fill(STAIR_X0 - 14, y + 1, KZ1 - 26, STAIR_X0 - 6, y + 3, KZ1 - 26, BOOKSHELF);
  room(s, STAIR_X0 - 16, y, KZ1 - 40, STAIR_X0 - 4, y + 7, KZ1 - 30, 'w');

  // Crypt access lobby (near dungeon shaft)
  const sx = DUNGEON_SHAFT.x;
  const sz = DUNGEON_SHAFT.z;
  corridorEW(s, sx - 8, sx + 8, sz + 6, y, 1, 4);
  corridorNS(s, sz - 6, sz + 8, sx - 6, y, 1, 4);

  // Connect west corridor to secondary stair
  corridorEW(s, SEC_X1, KX0 + 14, (SEC_Z0 + SEC_Z1) >> 1, y, 1, 4);
}

// ── Throne floor network ───────────────────────────────────────────────────────────────────

export function buildThroneFloorNetwork(s: CitadelStamp): void {
  const y = FLOOR.throne;

  // Full loop corridor
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ0 + 12, y, 2, 4); // south gallery
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KCZ, y, 2, 4);
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ1 - 10, y, 2, 4);
  corridorNS(s, KZ0 + 10, KZ1 - 8, KX0 + 12, y, 2, 4);
  corridorNS(s, KZ0 + 10, KZ1 - 8, STAIR_X0 - 6, y, 2, 4);
  corridorNS(s, KZ0 + 10, KCZ + 2, KCX, y, 1, 4); // axis toward throne

  // Room chain west
  for (let i = 0; i < 4; i++) {
    const z0 = KZ0 + 14 + i * 12;
    room(s, KX0 + 4, y, z0, KX0 + 14, y + 7, z0 + 10, 'e');
    s.fill(KX0 + 6, y + 1, z0 + 4, KX0 + 12, y + 1, z0 + 4, PLANKS);
  }
  // Room chain east (before stair)
  for (let i = 0; i < 3; i++) {
    const z0 = KZ0 + 34 + i * 10;
    room(s, STAIR_X0 - 14, y, z0, STAIR_X0 - 4, y + 7, z0 + 8, 'w');
  }

  // Antechambers south of throne
  room(s, KCX - 20, y, KCZ - 18, KCX - 10, y + 7, KCZ - 8, 'e');
  room(s, KCX + 10, y, KCZ - 18, KCX + 20, y + 7, KCZ - 8, 'w');
  // Waiting hall
  room(s, KCX - 8, y, KCZ - 18, KCX + 8, y + 7, KCZ - 10, 'n');
  s.fill(KCX - 4, y + 1, KCZ - 14, KCX + 4, y + 1, KCZ - 14, PLANKS);

  // Ambassador suites north-west / north-east
  room(s, KX0 + 16, y, KZ1 - 22, KX0 + 28, y + 7, KZ1 - 12, 's');
  room(s, STAIR_X0 - 28, y, KZ1 - 22, STAIR_X0 - 16, y + 7, KZ1 - 12, 's');

  // Link north stair
  corridorNS(s, KCZ, NORTH_STAIR.z0, (NORTH_STAIR.x0 + NORTH_STAIR.x1) >> 1, y, 1, 4);
  corridorEW(s, NORTH_STAIR.x1, KCX - 14, KZ1 - 14, y, 1, 4);

  // Link mid stair
  corridorEW(s, MID_STAIR.x0 - 4, MID_STAIR.x1 + 2, KCZ, y, 1, 4);
}

// ── Residential hotel wing ─────────────────────────────────────────────────────────────────

export function buildResidentialNetwork(s: CitadelStamp): void {
  const y = FLOOR.residential;

  // Double corridor system (hotel layout)
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KCZ - 6, y, 2, 4);
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KCZ + 6, y, 2, 4);
  corridorNS(s, KZ0 + 6, KZ1 - 8, KX0 + 20, y, 2, 4);
  corridorNS(s, KZ0 + 6, KZ1 - 8, KCX - 12, y, 1, 4);
  corridorNS(s, KZ0 + 6, KZ1 - 8, KCX + 12, y, 1, 4);
  corridorNS(s, KZ0 + 6, KZ1 - 8, STAIR_X0 - 8, y, 2, 4);
  // End-loop north & south
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KZ0 + 10, y, 1, 4);
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KZ1 - 10, y, 1, 4);

  // Chamber row south of south corridor
  for (let i = 0; i < 5; i++) {
    const x0 = KX0 + 6 + i * 10;
    if (x0 + 8 >= STAIR_X0 - 2) break;
    room(s, x0, y, KZ0 + 6, x0 + 8, y + 6, KZ0 + 14, 'n');
    // Mini bed
    s.fill(x0 + 2, y + 1, KZ0 + 8, x0 + 4, y + 1, KZ0 + 9, PLANKS);
  }
  // Chamber row north
  for (let i = 0; i < 5; i++) {
    const x0 = KX0 + 6 + i * 10;
    if (x0 + 8 >= STAIR_X0 - 2) break;
    room(s, x0, y, KZ1 - 16, x0 + 8, y + 6, KZ1 - 8, 's');
    s.fill(x0 + 2, y + 1, KZ1 - 12, x0 + 4, y + 1, KZ1 - 11, PLANKS);
  }
  // Mid belt chambers between the two E-W corridors
  for (let i = 0; i < 4; i++) {
    const x0 = KX0 + 8 + i * 12;
    if (x0 + 10 >= STAIR_X0 - 4) break;
    room(s, x0, y, KCZ - 4, x0 + 10, y + 6, KCZ + 4, 's');
  }

  // Solar / family hall
  room(s, KCX - 10, y, KZ0 + 16, KCX + 10, y + 7, KZ0 + 28, 'n');
  s.fill(KCX - 6, y + 1, KZ0 + 20, KCX + 6, y + 1, KZ0 + 20, PLANKS);
  s.set(KCX, y + 2, KZ0 + 22, GLOWSTONE);

  // Nursery / study pair
  room(s, KCX + 14, y, KZ0 + 24, STAIR_X0 - 4, y + 6, KZ0 + 34, 'w');
  room(s, KCX + 14, y, KZ0 + 36, STAIR_X0 - 4, y + 6, KZ0 + 46, 'w');
  s.fill(KCX + 16, y + 1, KZ0 + 38, KCX + 16, y + 3, KZ0 + 44, BOOKSHELF);

  // Bath / wardrobe stubs
  room(s, KX0 + 4, y, KCZ + 10, KX0 + 14, y + 6, KCZ + 18, 'e');
  room(s, KX0 + 4, y, KCZ - 18, KX0 + 14, y + 6, KCZ - 10, 'e');

  // Links to stairs
  corridorNS(s, KCZ + 6, NORTH_STAIR.z0, (NORTH_STAIR.x0 + NORTH_STAIR.x1) >> 1, y, 1, 4);
  corridorEW(s, MID_STAIR.x0 - 6, MID_STAIR.x1, KCZ, y, 1, 4);
  corridorEW(s, SEC_X1, KX0 + 20, (SEC_Z0 + SEC_Z1) >> 1, y, 1, 4);
}

// ── High castle maze ───────────────────────────────────────────────────────────────────────

export function buildHighCastleNetwork(s: CitadelStamp): void {
  const y = FLOOR.high;

  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KCZ - 8, y, 2, 4);
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KCZ + 8, y, 2, 4);
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KZ0 + 12, y, 1, 4);
  corridorEW(s, KX0 + 4, STAIR_X0 - 2, KZ1 - 12, y, 1, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, KX0 + 16, y, 2, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, KCX, y, 2, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, STAIR_X0 - 8, y, 2, 4);

  // Signal / lookout rooms at corners of high floor
  room(s, KX0 + 4, y, KZ0 + 6, KX0 + 14, y + 7, KZ0 + 16, 'e');
  room(s, STAIR_X0 - 14, y, KZ0 + 6, STAIR_X0 - 4, y + 7, KZ0 + 16, 'w');
  room(s, KX0 + 4, y, KZ1 - 18, KX0 + 14, y + 7, KZ1 - 8, 'e');
  room(s, STAIR_X0 - 14, y, KZ1 - 18, STAIR_X0 - 4, y + 7, KZ1 - 8, 'w');

  // Map annex + archive
  room(s, KCX - 20, y, KCZ - 6, KCX - 10, y + 7, KCZ + 6, 'e');
  room(s, KCX + 10, y, KCZ - 6, KCX + 20, y + 7, KCZ + 6, 'w');
  s.fill(KCX + 12, y + 1, KCZ - 4, KCX + 12, y + 3, KCZ + 4, BOOKSHELF);

  // Barracks expansion
  for (let i = 0; i < 3; i++) {
    const z0 = KZ0 + 18 + i * 10;
    room(s, KX0 + 18, y, z0, KX0 + 30, y + 6, z0 + 8, 'w');
  }

  // Chapel loft
  room(s, KCX - 8, y, KZ0 + 6, KCX + 8, y + 8, KZ0 + 16, 'n');
  s.set(KCX, y + 1, KZ0 + 10, GLOWSTONE);
  s.set(KCX, y + 2, KZ0 + 10, CRYSTAL);

  // Links to towers and stairs
  corridorNS(s, KCZ + 8, KZ1 - 4, CROWN.cx, y, 1, 4);
  corridorNS(s, KCZ + 8, KZ1 - 4, WATCH.cx, y, 1, 4);
  corridorNS(s, KCZ + 8, NORTH_STAIR.z0, (NORTH_STAIR.x0 + NORTH_STAIR.x1) >> 1, y, 1, 4);
  corridorEW(s, MID_STAIR.x0 - 4, MID_STAIR.x1 + 2, KCZ, y, 1, 4);
}

// ── Mezzanine / wall passage ───────────────────────────────────────────────────────────────

/**
 * Narrow wall-walk style passage inside the outer keep walls on throne level —
 * a secret-feeling route around the perimeter.
 */
export function buildInnerWallPassage(s: CitadelStamp): void {
  const y = FLOOR.throne;
  const inset = 2;
  // Perimeter air channel just inside outer walls
  // South
  s.fill(KX0 + inset, y + 1, KZ0 + inset, KX1 - inset, y + 3, KZ0 + inset + 1, AIR);
  // North
  s.fill(KX0 + inset, y + 1, KZ1 - inset - 1, KX1 - inset, y + 3, KZ1 - inset, AIR);
  // West
  s.fill(KX0 + inset, y + 1, KZ0 + inset, KX0 + inset + 1, y + 3, KZ1 - inset, AIR);
  // East (skip grand stair solid mass)
  s.fill(KX1 - inset - 1, y + 1, KZ0 + inset, KX1 - inset, y + 3, STAIR_Z0 - 1, AIR);
  s.fill(KX1 - inset - 1, y + 1, STAIR_Z1 + 1, KX1 - inset, y + 3, KZ1 - inset, AIR);

  // Access doors from main corridors into wall passage
  s.fill(KX0 + 12, y + 1, KZ0 + inset + 1, KX0 + 14, y + 3, KZ0 + inset + 1, AIR);
  s.fill(STAIR_X0 - 8, y + 1, KZ0 + inset + 1, STAIR_X0 - 6, y + 3, KZ0 + inset + 1, AIR);
  s.fill(KX0 + inset + 1, y + 1, KCZ - 1, KX0 + inset + 1, y + 3, KCZ + 1, AIR);

  for (let x = KX0 + 8; x < KX1 - 8; x += 10) {
    s.set(x, y + 1, KZ0 + inset, LANTERN);
    s.set(x, y + 1, KZ1 - inset, LANTERN);
  }
}

// ── Connecting bridges between stair systems ───────────────────────────────────────────────

export function buildStairLinks(s: CitadelStamp): void {
  for (const y of INTERIOR_STACK) {
    corridorEW(s, MID_STAIR.x1, STAIR_X0, (STAIR_Z0 + STAIR_Z1) >> 1, y, 1, 4);
    corridorEW(s, SEC_X1, KX0 + 16, (SEC_Z0 + SEC_Z1) >> 1, y, 1, 4);
    corridorNS(s, KCZ, NORTH_STAIR.z0, KX0 + 14, y, 1, 4);
  }
  corridorEW(s, NORTH_STAIR.x1, STAIR_X0, (NORTH_STAIR.z0 + NORTH_STAIR.z1) >> 1, FLOOR.roof, 1, 3);
  corridorNS(s, NORTH_STAIR.z1, CROWN.cz - CROWN.half, CROWN.cx, FLOOR.roof, 1, 3);
}

// ── Extra mid towers (full-height interior cores) ──────────────────────────────────────────

export function buildInteriorStairTurrets(s: CitadelStamp): void {
  // SW spiral: ground → roof
  const tx = KX0 + 22;
  const tz = KZ0 + 20;
  s.walls(tx - 2, FLOOR.ground, tz - 2, tx + 2, FLOOR.roof, tz + 2, STONE);
  s.fill(tx - 1, FLOOR.ground, tz - 1, tx + 1, FLOOR.roof - 1, tz + 1, AIR);
  for (const fy of STACK) {
    if (fy !== FLOOR.ground) {
      floorWithStairHole(s, tx - 1, tz - 1, tx + 1, tz + 1, fy, tx, tz, PLANKS);
    }
    s.fill(tx - 1, fy + 1, tz + 2, tx + 1, fy + 3, tz + 2, AIR);
  }
  spiralStair(s, tx, tz, FLOOR.ground, FLOOR.roof, COBBLESTONE, STONE);

  // SE companion spiral near grand stair: ground → roof
  const ex = STAIR_X0 - 10;
  const ez = KZ0 + 22;
  s.walls(ex - 2, FLOOR.ground, ez - 2, ex + 2, FLOOR.roof, ez + 2, BRICK);
  s.fill(ex - 1, FLOOR.ground, ez - 1, ex + 1, FLOOR.roof - 1, ez + 1, AIR);
  spiralStair(s, ex, ez, FLOOR.ground, FLOOR.roof, COBBLESTONE, BRICK);
  for (const fy of STACK) {
    s.fill(ex + 2, fy + 1, ez - 1, ex + 2, fy + 3, ez + 1, AIR);
    if (fy !== FLOOR.ground) {
      floorWithStairHole(s, ex - 1, ez - 1, ex + 1, ez + 1, fy, ex, ez, PLANKS);
    }
  }
}

/**
 * Generic corridor + room ring for every storey that is not a special themed floor.
 * Applied to gallery, state, guest, library, barracks, observatory (and as densifier).
 */
export function buildGenericFloorNetwork(s: CitadelStamp, y: number): void {
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KCZ - 6, y, 2, 4);
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KCZ + 6, y, 2, 4);
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ0 + 12, y, 1, 4);
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ1 - 12, y, 1, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, KX0 + 14, y, 2, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, KCX, y, 1, 4);
  corridorNS(s, KZ0 + 8, KZ1 - 8, STAIR_X0 - 8, y, 2, 4);

  // Chamber rows
  for (let i = 0; i < 4; i++) {
    const x0 = KX0 + 6 + i * 12;
    if (x0 + 10 >= STAIR_X0 - 2) break;
    room(s, x0, y, KZ0 + 6, x0 + 10, y + 6, KZ0 + 14, 'n');
    room(s, x0, y, KZ1 - 16, x0 + 10, y + 6, KZ1 - 8, 's');
  }
  for (let i = 0; i < 3; i++) {
    const z0 = KZ0 + 18 + i * 14;
    room(s, KX0 + 4, y, z0, KX0 + 16, y + 6, z0 + 10, 'e');
    room(s, STAIR_X0 - 16, y, z0, STAIR_X0 - 4, y + 6, z0 + 10, 'w');
  }

  // Central salon
  room(s, KCX - 10, y, KCZ - 4, KCX + 10, y + 7, KCZ + 4, 's');
  s.set(KCX, y + 1, KCZ, LANTERN);
}

/** Gallery floor — open walkways overlooking Great Hall + side museums. */
export function buildGalleryFloor(s: CitadelStamp): void {
  const y = FLOOR.gallery;
  // Keep the central void over the hall (already punched in buildGreatHall)
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KZ0 + 20, y, 2, 4);
  corridorEW(s, KX0 + 6, STAIR_X0 - 2, KCZ, y, 2, 4);
  corridorNS(s, KZ0 + 10, KZ1 - 8, KX0 + 12, y, 2, 4);
  corridorNS(s, KZ0 + 10, KZ1 - 8, STAIR_X0 - 6, y, 2, 4);
  // Side galleries as rooms
  for (let i = 0; i < 3; i++) {
    const z0 = KZ0 + 24 + i * 12;
    room(s, KX0 + 4, y, z0, KX0 + 16, y + 6, z0 + 10, 'e');
    room(s, STAIR_X0 - 16, y, z0, STAIR_X0 - 4, y + 6, z0 + 10, 'w');
    s.fill(KX0 + 6, y + 1, z0 + 4, KX0 + 6, y + 3, z0 + 8, BOOKSHELF);
  }
  // Balcony rails denser around hall void
  for (let x = KCX - 12; x <= KCX + 12; x++) {
    s.set(x, y + 1, KZ0 + 16, COBBLE_WALL);
  }
}

/** Master entry: all deep-interior systems across the tall stack. */
export function buildDeepInteriors(s: CitadelStamp): void {
  punchExtraStairWells(s);
  buildNorthServiceStair(s);
  buildMidGalleryStair(s);
  extendSecondaryToRoof(s);
  buildInteriorStairTurrets(s);

  buildGroundFloorNetwork(s);
  buildGalleryFloor(s);
  buildThroneFloorNetwork(s);
  buildResidentialNetwork(s);
  buildHighCastleNetwork(s);

  // Extra themed / generic floors for the taller keep
  for (const y of [FLOOR.state, FLOOR.guest, FLOOR.library, FLOOR.barracks, FLOOR.observatory]) {
    buildGenericFloorNetwork(s, y);
  }
  // Library denser books
  {
    const y = FLOOR.library;
    s.fill(KCX - 8, y + 1, KCZ - 2, KCX - 8, y + 4, KCZ + 2, BOOKSHELF);
    s.fill(KCX + 8, y + 1, KCZ - 2, KCX + 8, y + 4, KCZ + 2, BOOKSHELF);
  }
  // Observatory glow chamber
  {
    const y = FLOOR.observatory;
    s.set(KCX, y + 1, KCZ, GLOWSTONE);
    s.set(KCX, y + 2, KCZ, CRYSTAL);
  }

  buildInnerWallPassage(s);
  // Wall passages also on residential + high for vertical labyrinth feel
  const ySave = FLOOR.throne;
  // re-run pattern at residential / high by temporarily using those floors
  for (const y of [FLOOR.residential, FLOOR.high, FLOOR.observatory]) {
    const inset = 2;
    s.fill(KX0 + inset, y + 1, KZ0 + inset, KX1 - inset, y + 3, KZ0 + inset + 1, AIR);
    s.fill(KX0 + inset, y + 1, KZ1 - inset - 1, KX1 - inset, y + 3, KZ1 - inset, AIR);
    s.fill(KX0 + inset, y + 1, KZ0 + inset, KX0 + inset + 1, y + 3, KZ1 - inset, AIR);
    s.fill(KX1 - inset - 1, y + 1, KZ0 + inset, KX1 - inset, y + 3, STAIR_Z0 - 1, AIR);
    s.fill(KX0 + 12, y + 1, KZ0 + inset + 1, KX0 + 14, y + 3, KZ0 + inset + 1, AIR);
  }
  void ySave;

  buildStairLinks(s);
}
