/**
 * Milestone 2 — interior dressing + courtyard wayfinding for The Grand Keep.
 * Furniture is deliberate but not exhaustive: key rooms get a clear material language.
 */
import {
  AIR,
  BRICK,
  PLANKS,
  WOOD,
  STONE,
  GLASS,
  LANTERN,
  GLOWSTONE,
  BOOKSHELF,
  FURNACE,
  OAK_FENCE,
  COBBLE_WALL,
  CRYSTAL,
  GOLD_ORE,
  TERRACOTTA,
  DEEPSLATE,
  STAIRS_PLANK,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp } from './CitadelStamp';
import { well, lampPost } from './prefabs';
import {
  G,
  CX,
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  KCZ,
  FLOOR,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  STAIR_Z1,
  IN_Z0,
} from './grandKeepFrame';
import type { Prefab } from '../core/Prefab';

function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    const state = b.length === 5 ? b[4]! : 0;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, state);
  }
}

/** Vertical banner post with cloth (brick) hang. */
function banner(s: CitadelStamp, x: number, y: number, z: number, height = 5): void {
  s.fill(x, y, z, x, y + height - 1, z, WOOD);
  s.set(x, y + height - 1, z + 1, BRICK);
  s.set(x, y + height - 2, z + 1, BRICK);
  s.set(x, y + height - 1, z - 1, BRICK);
}

/** Long feast table with benches. */
function feastTable(s: CitadelStamp, x0: number, y: number, z: number, x1: number): void {
  s.fill(x0, y, z, x1, y, z, PLANKS);
  s.fill(x0, y, z - 2, x1, y, z - 2, PLANKS); // bench N
  s.fill(x0, y, z + 2, x1, y, z + 2, PLANKS); // bench S
  // Candles / plates
  for (let x = x0 + 1; x < x1; x += 3) {
    s.set(x, y + 1, z, LANTERN);
  }
}

/** Simple bed: planks + headboard + lantern. */
function bed(
  s: CitadelStamp,
  x: number,
  y: number,
  z: number,
  facing: 'n' | 's' | 'e' | 'w',
): void {
  if (facing === 'n' || facing === 's') {
    const dz = facing === 'n' ? -1 : 1;
    s.set(x, y, z, PLANKS);
    s.set(x, y, z + dz, PLANKS);
    s.set(x, y + 1, z - dz, WOOD); // headboard
  } else {
    const dx = facing === 'w' ? -1 : 1;
    s.set(x, y, z, PLANKS);
    s.set(x + dx, y, z, PLANKS);
    s.set(x - dx, y + 1, z, WOOD);
  }
  s.set(x, y + 1, z, LANTERN);
}

// ── Courtyard wayfinding ───────────────────────────────────────────────────────────────────

export function dressCourtyard(s: CitadelStamp): void {
  // Central fountain (well prefab) on plaza
  stampPrefab(s, well(), CX - 1, G + 1, KZ0 - 11);

  // Processional banners flanking the path to the keep
  for (const z of [KZ0 - 28, KZ0 - 20, KZ0 - 14]) {
    banner(s, CX - 6, G + 1, z, 6);
    banner(s, CX + 6, G + 1, z, 6);
  }

  // Keep door surround — brick arch frame + braziers
  s.fill(KCX - 6, G + 1, KZ0 - 1, KCX - 5, G + 7, KZ0 - 1, BRICK);
  s.fill(KCX + 5, G + 1, KZ0 - 1, KCX + 6, G + 7, KZ0 - 1, BRICK);
  s.fill(KCX - 6, G + 7, KZ0 - 1, KCX + 6, G + 8, KZ0 - 1, BRICK);
  for (const bx of [KCX - 7, KCX + 7]) {
    s.fill(bx, G + 1, KZ0 - 2, bx, G + 3, KZ0 - 2, COBBLE_WALL);
    s.set(bx, G + 4, KZ0 - 2, GLOWSTONE);
  }

  // Path markers toward wall-access towers
  stampPrefab(s, lampPost(), CX - 18, G + 1, KZ0 - 16);
  stampPrefab(s, lampPost(), CX + 18, G + 1, KZ0 - 16);
  stampPrefab(s, lampPost(), CX - 18, G + 1, IN_Z0 + 8);
  stampPrefab(s, lampPost(), CX + 18, G + 1, IN_Z0 + 8);

  // Side path paving to wall stairs (visual destinations)
  for (let z = IN_Z0 + 2; z <= KZ0 - 4; z++) {
    for (const x of [CX - 12, CX + 12]) {
      s.set(x, G, z, STONE);
      s.set(x - 1, G, z, STONE);
      s.set(x + 1, G, z, STONE);
    }
  }
}

// ── Great Hall ─────────────────────────────────────────────────────────────────────────────

export function dressGreatHall(s: CitadelStamp): void {
  const y = FLOOR.ground + 1;

  // Three long feast tables (heavier than M1 placeholders)
  for (const z of [KZ0 + 16, KZ0 + 22, KZ0 + 28]) {
    feastTable(s, KCX - 14, y, z, KCX - 6);
    feastTable(s, KCX + 6, y, z, KCX + 14);
  }

  // High table on dais
  s.fill(KCX - 5, y + 1, KZ1 - 10, KCX + 5, y + 1, KZ1 - 10, PLANKS);
  for (const x of [KCX - 4, KCX, KCX + 4]) s.set(x, y + 2, KZ1 - 10, LANTERN);

  // Side aisle rugs (terracotta strips)
  for (let z = KZ0 + 10; z < KZ1 - 14; z++) {
    s.set(KX0 + 4, G, z, TERRACOTTA);
    s.set(STAIR_X0 - 3, G, z, TERRACOTTA);
  }

  // Wall sconces along aisles
  for (let z = KZ0 + 12; z < KZ1 - 10; z += 6) {
    s.set(KX0 + 3, y + 3, z, LANTERN);
    s.set(STAIR_X0 - 2, y + 3, z, LANTERN);
  }

  // Grand stair entrance marker (glow arch on east aisle)
  s.fill(STAIR_X0 - 2, y, STAIR_Z0 + 4, STAIR_X0 - 2, y + 4, STAIR_Z0 + 8, AIR);
  s.set(STAIR_X0 - 2, y + 4, STAIR_Z0 + 5, GLOWSTONE);
  s.set(STAIR_X0 - 2, y + 4, STAIR_Z0 + 7, GLOWSTONE);
  banner(s, STAIR_X0 - 3, y, STAIR_Z0 + 3, 5);
  banner(s, STAIR_X0 - 3, y, STAIR_Z0 + 9, 5);
}

// ── Throne chamber ─────────────────────────────────────────────────────────────────────────

export function dressThroneFloor(s: CitadelStamp): void {
  const y = FLOOR.throne + 1;
  const tz1 = KZ1 - 6;

  // Carpet runner to throne
  for (let z = KCZ - 6; z <= tz1 - 5; z++) {
    for (let x = KCX - 2; x <= KCX + 2; x++) s.set(x, FLOOR.throne, z, TERRACOTTA);
  }

  // Throne seat refinement
  s.fill(KCX - 1, y + 1, tz1 - 3, KCX + 1, y + 1, tz1 - 2, PLANKS);
  s.set(KCX, y + 2, tz1 - 2, GOLD_ORE);
  s.set(KCX, y + 3, tz1 - 2, CRYSTAL);

  // Audience benches
  for (const z of [KCZ - 2, KCZ + 2, KCZ + 6]) {
    s.fill(KCX - 10, y, z, KCX - 5, y, z, PLANKS);
    s.fill(KCX + 5, y, z, KCX + 10, y, z, PLANKS);
  }

  // More wall banners along axis
  for (let z = KCZ - 4; z < tz1 - 6; z += 5) {
    banner(s, KCX - 13, y, z, 5);
    banner(s, KCX + 13, y, z, 5);
  }

  // Gallery (east of throne approach) — display pedestals
  for (const x of [KX1 - 14, KX1 - 10, KX1 - 6]) {
    s.set(x, y, KZ0 + 24, STONE);
    s.set(x, y + 1, KZ0 + 24, CRYSTAL);
  }

  // State chamber desk
  s.fill(KX0 + 8, y, KZ0 + 24, KX0 + 14, y, KZ0 + 24, PLANKS);
  s.set(KX0 + 11, y + 1, KZ0 + 24, LANTERN);
  s.set(KX0 + 6, y, KZ0 + 26, BOOKSHELF);
}

// ── Residential ────────────────────────────────────────────────────────────────────────────

export function dressResidentialFloor(s: CitadelStamp): void {
  const y = FLOOR.residential + 1;

  // Royal chamber (SW)
  bed(s, KX0 + 8, y, KZ0 + 10, 's');
  bed(s, KX0 + 12, y, KZ0 + 10, 's');
  s.fill(KX0 + 6, y, KZ0 + 14, KX0 + 10, y, KZ0 + 14, PLANKS); // wardrobe line
  s.set(KX0 + 16, y, KZ0 + 12, FURNACE);
  s.set(KX0 + 8, y, KZ0 + 16, LANTERN);
  // Carpet
  for (let z = KZ0 + 10; z <= KZ0 + 15; z++) {
    for (let x = KX0 + 8; x <= KX0 + 14; x++) s.set(x, FLOOR.residential, z, TERRACOTTA);
  }

  // Noble chamber (NW)
  bed(s, KX0 + 10, y, KZ1 - 12, 'n');
  s.fill(KX0 + 8, y, KZ1 - 14, KX0 + 14, y, KZ1 - 14, PLANKS);
  s.set(KX0 + 12, y + 1, KZ1 - 14, LANTERN);

  // Private hall — seating ring
  s.fill(KCX - 4, y, KZ0 + 10, KCX + 4, y, KZ0 + 10, PLANKS);
  s.fill(KCX - 4, y, KZ0 + 14, KCX + 4, y, KZ0 + 14, PLANKS);
  s.set(KCX, y + 1, KZ0 + 12, GLOWSTONE);

  // Library reading tables
  s.fill(KCX + 14, y, KZ0 + 12, KCX + 18, y, KZ0 + 12, PLANKS);
  s.fill(KCX + 14, y, KZ0 + 16, KCX + 18, y, KZ0 + 16, PLANKS);
  s.set(KCX + 16, y + 1, KZ0 + 12, LANTERN);
  s.set(KCX + 16, y + 1, KZ0 + 16, LANTERN);
  // Extra shelf stacks
  s.fill(KCX + 12, y, KZ0 + 8, KCX + 12, y + 2, KZ0 + 18, BOOKSHELF);
}

// ── High castle / war room ─────────────────────────────────────────────────────────────────

export function dressHighCastleFloor(s: CitadelStamp): void {
  const y = FLOOR.high + 1;

  // War room: larger map table with border + chairs
  s.fill(KCX - 5, y, KCZ - 3, KCX + 5, y, KCZ + 3, PLANKS);
  s.fill(KCX - 5, y, KCZ - 3, KCX + 5, y, KCZ - 3, DEEPSLATE);
  s.fill(KCX - 5, y, KCZ + 3, KCX + 5, y, KCZ + 3, DEEPSLATE);
  s.set(KCX - 3, y + 1, KCZ, GOLD_ORE);
  s.set(KCX, y + 1, KCZ, CRYSTAL);
  s.set(KCX + 3, y + 1, KCZ, GOLD_ORE);
  s.set(KCX, y + 1, KCZ - 2, LANTERN);
  s.set(KCX, y + 1, KCZ + 2, LANTERN);

  // Perimeter chairs
  for (const [x, z] of [
    [KCX - 7, KCZ],
    [KCX + 7, KCZ],
    [KCX, KCZ - 5],
    [KCX, KCZ + 5],
  ] as const) {
    s.set(
      x,
      y,
      z,
      STAIRS_PLANK,
      packState(x < KCX ? FACING.E : x > KCX ? FACING.W : z < KCZ ? FACING.S : FACING.N, 0),
    );
  }

  // Armory weapon racks denser
  for (let z = KZ0 + 8; z <= KZ0 + 18; z += 2) {
    s.fill(KX0 + 6, y, z, KX0 + 6, y + 2, z, OAK_FENCE);
    s.set(KX0 + 7, y + 1, z, STONE); // "shield" placeholder
  }
  s.fill(KX0 + 10, y, KZ0 + 10, KX0 + 16, y, KZ0 + 10, PLANKS); // supply table

  // Guard quarters bunks
  bed(s, KX0 + 8, y, KZ1 - 14, 'e');
  bed(s, KX0 + 8, y, KZ1 - 10, 'e');
  bed(s, KX0 + 14, y, KZ1 - 14, 'w');
  bed(s, KX0 + 14, y, KZ1 - 10, 'w');

  // Council table
  s.fill(KCX + 12, y, KZ0 + 10, KCX + 18, y, KZ0 + 14, PLANKS);
  s.set(KCX + 15, y + 1, KZ0 + 12, LANTERN);
}

// ── Stair well lighting + hall overlook ────────────────────────────────────────────────────

export function polishGrandStair(s: CitadelStamp): void {
  // Wall lanterns every few blocks on both long walls of the well
  for (let y = FLOOR.ground + 2; y < FLOOR.roof; y += 3) {
    for (let z = STAIR_Z0 + 3; z <= STAIR_Z1 - 3; z += 4) {
      s.set(STAIR_X0 + 1, y, z, LANTERN);
      s.set(STAIR_X1 - 1, y, z, LANTERN);
    }
  }

  // Glowstone under mid-landings for readable flights
  const levels = [FLOOR.ground, FLOOR.throne, FLOOR.residential, FLOOR.high];
  for (const y0 of levels) {
    const mid = y0 + 6;
    s.set(STAIR_X0 + 3, mid - 1, STAIR_Z0 + 10, GLOWSTONE);
    s.set(STAIR_X0 + 5, mid - 1, STAIR_Z1 - 4, GLOWSTONE);
  }

  // Overlook windows from stair well into Great Hall (west wall openings with glass + air walk)
  for (const fy of [FLOOR.ground, FLOOR.throne, FLOOR.residential]) {
    // Wider viewing slit looking west into hall
    s.fill(STAIR_X0, fy + 3, STAIR_Z0 + 12, STAIR_X0, fy + 6, STAIR_Z0 + 18, AIR);
    for (let z = STAIR_Z0 + 12; z <= STAIR_Z0 + 18; z += 2) {
      s.set(STAIR_X0, fy + 5, z, GLASS);
    }
    // Rail on landing edge so overlook feels intentional
    for (let z = STAIR_Z0 + 12; z <= STAIR_Z0 + 18; z++) {
      s.set(STAIR_X0 + 1, fy + 1, z, COBBLE_WALL);
    }
    s.fill(STAIR_X0 + 1, fy + 1, STAIR_Z0 + 14, STAIR_X0 + 1, fy + 1, STAIR_Z0 + 16, AIR); // gap to step to rail
  }

  // Banner at ground-floor stair mouth (visible from hall)
  banner(s, STAIR_X0 - 1, FLOOR.ground + 1, STAIR_Z0 + 5, 6);
  banner(s, STAIR_X0 - 1, FLOOR.ground + 1, STAIR_Z0 + 9, 6);
}

// ── Exterior silhouette ────────────────────────────────────────────────────────────────────

export function polishExteriorSilhouette(s: CitadelStamp): void {
  // South keep chapel bay — shallow projection with taller windows
  const bayX0 = KCX - 10;
  const bayX1 = KCX + 10;
  const bayZ0 = KZ0 - 4;
  s.fill(bayX0, G, bayZ0, bayX1, G, KZ0 - 1, STONE);
  s.walls(bayX0, FLOOR.ground, bayZ0, bayX1, FLOOR.throne + 4, KZ0, STONE);
  s.fill(bayX0 + 1, FLOOR.ground, bayZ0 + 1, bayX1 - 1, FLOOR.throne + 3, KZ0 - 1, AIR);
  // Tall chapel windows
  for (let x = bayX0 + 3; x <= bayX1 - 3; x += 4) {
    s.fill(x, FLOOR.ground + 3, bayZ0, x, FLOOR.ground + 8, bayZ0, GLASS);
  }
  // Open into Great Hall
  s.fill(KCX - 4, FLOOR.ground, KZ0, KCX + 4, FLOOR.ground + 5, KZ0, AIR);
  // Chapel roof setback
  s.slab(bayX0, bayZ0, bayX1, KZ0, FLOOR.throne + 4, BRICK);
  for (let x = bayX0; x <= bayX1; x++) {
    if (((x + bayZ0) & 1) === 0) s.set(x, FLOOR.throne + 5, bayZ0, BRICK);
  }

  // East & west keep wing roof ridges (raised parapet strips)
  for (const x of [KX0 + 6, KX1 - 6]) {
    s.fill(x - 1, FLOOR.roof + 1, KZ0 + 8, x + 1, FLOOR.roof + 3, KZ1 - 8, BRICK);
  }

  // Taller gatehouse corner turrets (already hollow towers — add spire tops)
  // Handled in walls polish via extra fill if towers exist; add keep SE/SW shoulder towers
  const shoulderY = FLOOR.high + 6;
  for (const [cx, cz] of [
    [KX0 + 4, KZ0 + 4],
    [KX1 - 4, KZ0 + 4],
  ] as const) {
    s.walls(cx - 2, FLOOR.ground, cz - 2, cx + 2, shoulderY, cz + 2, BRICK);
    s.fill(cx - 1, FLOOR.ground, cz - 1, cx + 1, shoulderY - 1, cz + 1, AIR);
    s.slab(cx - 2, cz - 2, cx + 2, cz + 2, shoulderY, STONE);
    s.set(cx, shoulderY + 1, cz, GLOWSTONE);
  }

  // Gatehouse outer merlon height boost (decorative crenellation ridge)
  // Approach banners just south of moat bridge end
  for (const x of [CX - 5, CX + 5]) {
    banner(s, x, G + 1, KZ0 - 40, 7);
  }
}

// ── Dungeon atmosphere ─────────────────────────────────────────────────────────────────────

export function dressDungeon(s: CitadelStamp): void {
  const y = FLOOR.dungeon + 1;
  // Extra corridor lanterns
  for (let x = KX0 + 10; x < KX1 - 10; x += 5) {
    s.set(x, y, KCZ - 2, LANTERN);
  }
  // Torture / work bench props near vault door
  s.fill(KCX - 6, y, KCZ + 6, KCX - 3, y, KCZ + 6, PLANKS);
  s.set(KCX - 4, y + 1, KCZ + 6, FURNACE);
  // Barrel-like plank stacks in storage
  s.fill(KCX - 8, y, KZ0 + 8, KCX - 6, y + 1, KZ0 + 10, PLANKS);
  s.fill(KCX + 6, y, KZ0 + 8, KCX + 8, y + 1, KZ0 + 10, PLANKS);
}
