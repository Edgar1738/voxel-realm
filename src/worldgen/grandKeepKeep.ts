import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  LANTERN,
  GLOWSTONE,
  BOOKSHELF,
  FURNACE,
  OAK_FENCE,
  COBBLE_WALL,
  DEEPSLATE,
  STAIRS_STONE,
  CRYSTAL,
  GOLD_ORE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp } from './CitadelStamp';
import {
  G,
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
  STAIR_X1,
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
import {
  battlements,
  windowRow,
  column,
  placeholderTable,
  stairFlightZ,
  hollowTower,
  spiralStair,
} from './grandKeepPrimitives';

/** Hollow multi-storey keep shell with exterior massing. */
export function buildKeepShell(s: CitadelStamp): void {
  // Deep foundation
  s.fill(KX0, G - 2, KZ0, KX1, G, KZ1, DEEPSLATE);
  // Outer walls to roof
  s.walls(KX0, FLOOR.ground, KZ0, KX1, FLOOR.roof, KZ1, STONE);
  // Corner buttress piers for silhouette
  for (const [px, pz] of [
    [KX0, KZ0],
    [KX1, KZ0],
    [KX0, KZ1],
    [KX1, KZ1],
  ] as const) {
    s.fill(px - 1, FLOOR.ground, pz - 1, px + 1, FLOOR.roof + 2, pz + 1, BRICK);
  }
  // Upper setback band from high castle upward
  s.walls(KX0 + 1, FLOOR.high, KZ0 + 1, KX1 - 1, FLOOR.roof, KZ1 - 1, BRICK);
  // Extra stepped crown mass near the top for silhouette
  s.walls(KX0 + 2, FLOOR.barracks, KZ0 + 2, KX1 - 2, FLOOR.roof, KZ1 - 2, STONE);

  // Hollow entire interior volume (floors added separately)
  s.fill(KX0 + 1, FLOOR.ground, KZ0 + 1, KX1 - 1, FLOOR.roof - 1, KZ1 - 1, AIR);

  // Monumental south entrance into Great Hall
  s.fill(KCX - 4, FLOOR.ground, KZ0, KCX + 4, FLOOR.ground + 5, KZ0, AIR);
  // Arch-like lintel thickening
  s.fill(KCX - 5, FLOOR.ground + 5, KZ0, KCX + 5, FLOOR.ground + 6, KZ0, STONE);
  s.fill(KCX - 3, FLOOR.ground + 6, KZ0, KCX + 3, FLOOR.ground + 7, KZ0, STONE);

  // Windows on every interior storey
  for (const fy of INTERIOR_STACK) {
    windowRow(s, 'x', KX0, KX1, KZ0, fy + 3, 5, 2);
    windowRow(s, 'x', KX0, KX1, KZ1, fy + 3, 5, 2);
    windowRow(s, 'z', KZ0, KZ1, KX0, fy + 3, 5, 2);
    windowRow(s, 'z', KZ0, KZ1, KX1, fy + 3, 5, 2);
  }

  // Keep entrance steps from courtyard
  for (let i = 0; i < 2; i++) {
    for (let x = KCX - 5; x <= KCX + 5; x++) {
      s.set(x, G + i, KZ0 - 1 - i, STAIRS_STONE, packState(FACING.S, 0));
    }
  }
}

/** Lay every storey floor (gallery through roof) with holes for stair wells. */
export function buildKeepFloors(s: CitadelStamp): void {
  for (const fy of STACK) {
    if (fy === FLOOR.ground) continue; // paved separately at G
    const mat =
      fy === FLOOR.roof ? STONE : fy === FLOOR.throne || fy === FLOOR.gallery ? STONE : PLANKS;
    s.slab(KX0 + 1, KZ0 + 1, KX1 - 1, KZ1 - 1, fy, mat);
    // Grand stair well (east)
    s.fill(STAIR_X0, fy, STAIR_Z0, STAIR_X1, fy, STAIR_Z1, AIR);
    // Secondary stair well (west) through every floor including roof
    s.fill(SEC_X0, fy, SEC_Z0, SEC_X1, fy, SEC_Z1, AIR);
  }

  // Great Hall paving on foundation top
  s.slab(KX0 + 1, KZ0 + 1, KX1 - 1, KZ1 - 1, G, STONE);
}

/**
 * Wide ceremonial switchback stair on the east wing — every storey ground → roof.
 * Two flights of STOREY_RISE/2 per storey.
 */
export function buildGrandStaircase(s: CitadelStamp): void {
  const wall = STONE;
  s.fill(STAIR_X0, FLOOR.ground, STAIR_Z0, STAIR_X0, FLOOR.roof, STAIR_Z1, wall);
  s.fill(STAIR_X1, FLOOR.ground, STAIR_Z0, STAIR_X1, FLOOR.roof, STAIR_Z1, wall);
  s.fill(STAIR_X0, FLOOR.ground, STAIR_Z0, STAIR_X1, FLOOR.roof, STAIR_Z0, wall);
  s.fill(STAIR_X0, FLOOR.ground, STAIR_Z1, STAIR_X1, FLOOR.roof, STAIR_Z1, wall);
  s.fill(STAIR_X0 + 1, FLOOR.ground, STAIR_Z0 + 1, STAIR_X1 - 1, FLOOR.roof - 1, STAIR_Z1 - 1, AIR);

  const stepX0 = STAIR_X0 + 2;
  const stepX1 = stepX0 + 4; // 5-wide
  const flight = STOREY_RISE / 2; // 5

  for (let li = 0; li < STACK.length - 1; li++) {
    const y0 = STACK[li];
    const y1 = STACK[li + 1];
    const mid = y0 + flight;
    stairFlightZ(s, stepX0, stepX1, STAIR_Z0 + 2, y0, flight, 1, STAIRS_STONE);
    s.fill(STAIR_X0 + 1, mid, STAIR_Z0 + 8, STAIR_X1 - 1, mid, STAIR_Z1 - 2, PLANKS);
    s.set(STAIR_X0 + 2, mid + 1, STAIR_Z1 - 3, LANTERN);
    stairFlightZ(s, stepX0, stepX1, STAIR_Z1 - 2, mid, flight, -1, STAIRS_STONE);
    s.fill(STAIR_X0 + 1, y1, STAIR_Z0 + 2, STAIR_X1 - 1, y1, STAIR_Z0 + 5, PLANKS);
    s.fill(STAIR_X0, y0 + 1, STAIR_Z0 + 3, STAIR_X0, y0 + 3, STAIR_Z0 + 7, AIR);
    s.fill(STAIR_X0, y1 + 1, STAIR_Z0 + 3, STAIR_X0, y1 + 3, STAIR_Z0 + 7, AIR);
  }

  for (const z of [STAIR_Z0 + 4, STAIR_Z1 - 4]) {
    s.fill(STAIR_X0, FLOOR.ground, z, STAIR_X0, FLOOR.roof, z, BRICK);
  }
}

/** Compact service stair on the west wing — ground → roof on every storey. */
export function buildSecondaryStair(s: CitadelStamp): void {
  s.fill(SEC_X0, FLOOR.ground, SEC_Z0, SEC_X1, FLOOR.roof, SEC_Z0, STONE);
  s.fill(SEC_X0, FLOOR.ground, SEC_Z1, SEC_X1, FLOOR.roof, SEC_Z1, STONE);
  s.fill(SEC_X0, FLOOR.ground, SEC_Z0, SEC_X0, FLOOR.roof, SEC_Z1, STONE);
  s.fill(SEC_X1, FLOOR.ground, SEC_Z0, SEC_X1, FLOOR.roof, SEC_Z1, STONE);
  s.fill(SEC_X0 + 1, FLOOR.ground, SEC_Z0 + 1, SEC_X1 - 1, FLOOR.roof - 1, SEC_Z1 - 1, AIR);

  const cx = Math.floor((SEC_X0 + SEC_X1) / 2);
  const cz = Math.floor((SEC_Z0 + SEC_Z1) / 2);
  spiralStair(s, cx, cz, FLOOR.ground, FLOOR.roof, COBBLESTONE, STONE);

  for (const fy of STACK) {
    s.fill(SEC_X1, fy + 1, cz - 1, SEC_X1, fy + 3, cz + 1, AIR);
  }
}

// ── Room volumes (Milestone 1: volumes + anchors, light furniture) ──────────────────────────

export function buildGreatHall(s: CitadelStamp): void {
  const y0 = FLOOR.ground;
  const yCeil = FLOOR.gallery - 1; // double-height into gallery underside

  // Ensure double-height: no mid-floor in central hall (already hollow)
  // Columns along the nave
  for (const x of [KCX - 16, KCX - 8, KCX + 8, KCX + 16]) {
    for (const z of [KZ0 + 12, KZ0 + 22, KZ0 + 32]) {
      // Skip if inside stair wells
      if (x >= STAIR_X0 && x <= STAIR_X1) continue;
      if (x >= SEC_X0 && x <= SEC_X1 && z >= SEC_Z0 && z <= SEC_Z1) continue;
      column(s, x, z, y0, yCeil - 1, STONE);
      s.set(x, y0 + 4, z, LANTERN); // mid hang visual
    }
  }

  // Side aisle walls (partial) for rhythm without sealing
  s.fill(KX0 + 2, y0, KZ0 + 8, KX0 + 2, y0 + 6, KZ1 - 8, BRICK);
  s.fill(STAIR_X0 - 1, y0, KZ0 + 8, STAIR_X0 - 1, y0 + 6, KZ1 - 8, BRICK);

  // Open doorways through aisle walls into hall
  for (const z of [KZ0 + 14, KZ0 + 24, KZ0 + 34]) {
    s.fill(KX0 + 2, y0, z - 2, KX0 + 2, y0 + 4, z + 2, AIR);
    s.fill(STAIR_X0 - 1, y0, z - 2, STAIR_X0 - 1, y0 + 4, z + 2, AIR);
  }

  // Hearths on north end
  s.fill(KCX - 3, y0, KZ1 - 6, KCX + 3, y0, KZ1 - 4, BRICK);
  s.fill(KCX - 2, y0 + 1, KZ1 - 5, KCX + 2, y0 + 2, KZ1 - 5, BRICK);
  s.set(KCX, y0 + 1, KZ1 - 5, GLOWSTONE);
  s.set(KCX - 2, y0 + 1, KZ1 - 6, FURNACE);
  s.set(KCX + 2, y0 + 1, KZ1 - 6, FURNACE);

  // Raised dais (south of hearth / north hall)
  s.fill(KCX - 6, y0, KZ1 - 12, KCX + 6, y0, KZ1 - 8, STONE);
  s.fill(KCX - 4, y0 + 1, KZ1 - 11, KCX + 4, y0 + 1, KZ1 - 9, STONE);

  // Long tables (placeholders)
  for (const z of [KZ0 + 16, KZ0 + 22, KZ0 + 28]) {
    placeholderTable(s, KCX - 10, y0 + 1, z);
    placeholderTable(s, KCX + 10, y0 + 1, z);
  }

  // Chandelier-like glow at height
  for (const [lx, lz] of [
    [KCX, KZ0 + 18],
    [KCX, KZ0 + 28],
    [KCX - 12, KZ0 + 22],
    [KCX + 12, KZ0 + 22],
  ] as const) {
    s.set(lx, y0 + 8, lz, GLOWSTONE);
    s.set(lx, y0 + 7, lz, OAK_FENCE);
  }

  // Gallery openings into throne floor above (view down) — punch a central void strip
  // Leave throne floor solid but with a balcony rail overlooking hall along south third
  s.fill(KCX - 10, FLOOR.throne, KZ0 + 6, KCX + 10, FLOOR.throne, KZ0 + 16, AIR);
  // Balcony edge rails
  for (let x = KCX - 10; x <= KCX + 10; x++) {
    s.set(x, FLOOR.throne + 1, KZ0 + 16, COBBLE_WALL);
  }
  for (const z of [KZ0 + 6, KZ0 + 16]) {
    s.set(KCX - 10, FLOOR.throne + 1, z, COBBLE_WALL);
    s.set(KCX + 10, FLOOR.throne + 1, z, COBBLE_WALL);
  }
}

export function buildThroneFloor(s: CitadelStamp): void {
  const y = FLOOR.throne;

  // Throne room — axial chamber north-central
  const tx0 = KCX - 14;
  const tx1 = KCX + 14;
  const tz0 = KCZ - 8;
  const tz1 = KZ1 - 6;
  // Side walls for throne chamber
  s.fill(tx0, y + 1, tz0, tx0, y + 8, tz1, BRICK);
  s.fill(tx1, y + 1, tz0, tx1, y + 8, tz1, BRICK);
  s.fill(tx0, y + 1, tz1, tx1, y + 8, tz1, BRICK);
  // Grand doorway from south
  s.fill(KCX - 3, y + 1, tz0, KCX + 3, y + 5, tz0, AIR);
  // Open side doors to corridors
  s.fill(tx0, y + 1, KCZ - 1, tx0, y + 3, KCZ + 1, AIR);
  s.fill(tx1, y + 1, KCZ - 1, tx1, y + 3, KCZ + 1, AIR);

  // Throne dais on north wall
  s.fill(KCX - 4, y + 1, tz1 - 4, KCX + 4, y + 1, tz1 - 2, STONE);
  s.fill(KCX - 2, y + 2, tz1 - 3, KCX + 2, y + 2, tz1 - 2, STONE);
  s.set(KCX, y + 3, tz1 - 2, GOLD_ORE);
  s.set(KCX, y + 4, tz1 - 2, CRYSTAL);
  // Flanking banners (fence + wool substitute brick)
  for (const bx of [KCX - 5, KCX + 5]) {
    s.fill(bx, y + 1, tz1 - 1, bx, y + 6, tz1 - 1, WOOD);
    s.set(bx, y + 5, tz1 - 2, BRICK);
  }
  // Axis lanterns
  for (let z = tz0 + 3; z < tz1 - 4; z += 4) {
    s.set(KCX - 6, y + 1, z, LANTERN);
    s.set(KCX + 6, y + 1, z, LANTERN);
  }

  // Ceremonial side rooms (east/west of throne approach)
  roomShell(s, KX0 + 4, y, KZ0 + 20, KX0 + 18, y + 8, KZ0 + 32, 'state chamber');
  roomShell(s, KX1 - 18, y, KZ0 + 20, STAIR_X0 - 2, y + 8, KZ0 + 32, 'gallery');
}

export function buildResidentialFloor(s: CitadelStamp): void {
  const y = FLOOR.residential;
  // Corridor spine
  s.fill(KX0 + 4, y + 1, KCZ - 2, STAIR_X0 - 2, y + 4, KCZ + 2, AIR);
  // Bedchambers (volumes only)
  roomShell(s, KX0 + 4, y, KZ0 + 6, KX0 + 22, y + 7, KZ0 + 18, 'royal chamber');
  roomShell(s, KX0 + 4, y, KZ1 - 20, KX0 + 22, y + 7, KZ1 - 6, 'noble chamber');
  roomShell(s, KCX - 8, y, KZ0 + 6, KCX + 8, y + 7, KZ0 + 18, 'private hall');
  // Library
  roomShell(s, KCX + 10, y, KZ0 + 6, STAIR_X0 - 2, y + 7, KZ0 + 22, 'library');
  // Bookshelves
  s.fill(KCX + 11, y + 1, KZ0 + 7, STAIR_X0 - 3, y + 3, KZ0 + 7, BOOKSHELF);
  s.fill(KCX + 11, y + 1, KZ0 + 21, STAIR_X0 - 3, y + 3, KZ0 + 21, BOOKSHELF);
  // Corridor lanterns
  for (let x = KX0 + 8; x < STAIR_X0 - 2; x += 8) {
    s.set(x, y + 1, KCZ, LANTERN);
  }
}

export function buildHighCastleFloor(s: CitadelStamp): void {
  const y = FLOOR.high;
  // War room center
  roomShell(s, KCX - 12, y, KCZ - 10, KCX + 12, y + 8, KCZ + 10, 'war room');
  // Map table
  s.fill(KCX - 3, y + 1, KCZ - 2, KCX + 3, y + 1, KCZ + 2, PLANKS);
  s.set(KCX, y + 2, KCZ, GLOWSTONE);
  // Armory
  roomShell(s, KX0 + 4, y, KZ0 + 6, KX0 + 20, y + 7, KZ0 + 20, 'armory');
  for (const z of [KZ0 + 8, KZ0 + 12, KZ0 + 16]) {
    s.fill(KX0 + 6, y + 1, z, KX0 + 6, y + 3, z, OAK_FENCE);
  }
  // Guard quarters
  roomShell(s, KX0 + 4, y, KZ1 - 18, KX0 + 20, y + 7, KZ1 - 6, 'guard quarters');
  // Council room
  roomShell(s, KCX + 8, y, KZ0 + 6, STAIR_X0 - 2, y + 7, KZ0 + 20, 'council');
  // Access openings toward crown/watch towers (north wall)
  s.fill(CROWN.cx - 2, y + 1, KZ1, CROWN.cx + 2, y + 3, KZ1, AIR);
  s.fill(WATCH.cx - 2, y + 1, KZ1, WATCH.cx + 2, y + 3, KZ1, AIR);
}

export function buildRoof(s: CitadelStamp): void {
  const y = FLOOR.roof;
  // Walkable roof already floored; ensure solid except stair well
  s.slab(KX0 + 1, KZ0 + 1, KX1 - 1, KZ1 - 1, y, STONE);
  s.fill(STAIR_X0, y, STAIR_Z0, STAIR_X1, y, STAIR_Z1, AIR);
  // Pad around stair exit
  s.fill(STAIR_X0 + 1, y, STAIR_Z0 + 1, STAIR_X1 - 1, y, STAIR_Z0 + 4, PLANKS);

  battlements(s, KX0, KZ0, KX1, KZ1, y + 1, STONE);
  // Inner walk rails around stair well
  for (let x = STAIR_X0; x <= STAIR_X1; x++) {
    s.set(x, y + 1, STAIR_Z0, COBBLE_WALL);
    s.set(x, y + 1, STAIR_Z1, COBBLE_WALL);
  }
  for (let z = STAIR_Z0; z <= STAIR_Z1; z++) {
    s.set(STAIR_X0, y + 1, z, COBBLE_WALL);
    s.set(STAIR_X1, y + 1, z, COBBLE_WALL);
  }
  // Opening in rail at exit
  s.fill(STAIR_X0 + 2, y + 1, STAIR_Z0, STAIR_X1 - 2, y + 1, STAIR_Z0, AIR);

  // Roof path lanterns
  for (let x = KX0 + 6; x <= KX1 - 6; x += 10) {
    s.set(x, y + 1, KZ0 + 4, LANTERN);
    s.set(x, y + 1, KZ1 - 4, LANTERN);
  }

  // Beacon mast
  s.fill(KCX, y + 1, KCZ, KCX, y + 12, KCZ, WOOD);
  s.set(KCX, y + 13, KCZ, GLOWSTONE);
  s.fill(KCX - 1, y + 12, KCZ, KCX + 1, y + 12, KCZ, GLOWSTONE);
}

/** Major towers attached to keep — internal spiral routes to summit. */
export function buildMajorTowers(s: CitadelStamp): void {
  hollowTower(s, CROWN.cx, CROWN.cz, CROWN.half, FLOOR.ground, CROWN.topY, {
    wall: BRICK,
    floor: PLANKS,
    floorGap: 8,
    doorFace: 's',
  });
  hollowTower(s, WATCH.cx, WATCH.cz, WATCH.half, FLOOR.ground, WATCH.topY, {
    wall: STONE,
    floor: PLANKS,
    floorGap: 8,
    doorFace: 's',
  });

  // Connect towers at several heights including roof
  for (const fy of [FLOOR.ground, FLOOR.residential, FLOOR.high, FLOOR.observatory, FLOOR.roof]) {
    // Crown: doorway from keep into tower (south face of tower is inside keep north zone)
    s.fill(
      CROWN.cx - 2,
      fy + 1,
      CROWN.cz - CROWN.half,
      CROWN.cx + 2,
      fy + 3,
      CROWN.cz - CROWN.half,
      AIR,
    );
    s.fill(
      WATCH.cx - 2,
      fy + 1,
      WATCH.cz - WATCH.half,
      WATCH.cx + 2,
      fy + 3,
      WATCH.cz - WATCH.half,
      AIR,
    );
  }

  // Summit beacons already placed by hollowTower
}

/** Light room shell: four walls with doorway on south, lantern, optional label unused. */
function roomShell(
  s: CitadelStamp,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  yTop: number,
  z1: number,
  _name: string,
): void {
  s.fill(x0, y + 1, z0, x0, yTop, z1, BRICK);
  s.fill(x1, y + 1, z0, x1, yTop, z1, BRICK);
  s.fill(x0, y + 1, z0, x1, yTop, z0, BRICK);
  s.fill(x0, y + 1, z1, x1, yTop, z1, BRICK);
  // Door south
  const mx = (x0 + x1) >> 1;
  s.fill(mx - 1, y + 1, z0, mx + 1, y + 3, z0, AIR);
  s.set(x0 + 1, y + 1, z0 + 1, LANTERN);
  // Window north
  s.set(mx, y + 3, z1, GLASS);
  s.set(mx, y + 4, z1, GLASS);
}

/** Dungeon access stair from Great Hall (west-central) down to dungeon floor. */
export function buildDungeonAccess(s: CitadelStamp): void {
  const sx = DUNGEON_SHAFT.x;
  const sz = DUNGEON_SHAFT.z;
  // Crypt hut marker on ground floor
  s.fill(sx - 3, FLOOR.ground, sz - 3, sx + 3, FLOOR.ground + 4, sz + 3, STONE);
  s.fill(sx - 2, FLOOR.ground, sz - 2, sx + 2, FLOOR.ground + 3, sz + 2, AIR);
  s.fill(sx - 1, FLOOR.ground, sz + 3, sx + 1, FLOOR.ground + 2, sz + 3, AIR); // door south
  s.set(sx, FLOOR.ground + 1, sz - 2, LANTERN);

  // Shaft down
  s.fill(sx - 1, FLOOR.dungeon, sz - 1, sx + 1, G, sz + 1, AIR);
  spiralStair(s, sx, sz, FLOOR.dungeon, FLOOR.ground, COBBLESTONE, STONE);

  // Floor hole on Great Hall paving
  s.fill(sx - 1, G, sz - 1, sx + 1, G, sz + 1, AIR);
}
