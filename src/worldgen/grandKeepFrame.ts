import { GRAND_KEEP } from './GrandKeepGenerator';

/**
 * Shared world-space frame for The Grand Keep.
 *
 * Vertical programme (WORLD_HEIGHT = 192):
 * - 1 dungeon level
 * - 10 above-ground storeys + walkable roof
 * - Crown / Watch towers above the roof (capped under y=191)
 */
export const G = GRAND_KEEP.groundY; // 72
export const CX = GRAND_KEEP.centerX; // 8
export const CZ = GRAND_KEEP.centerZ; // 20

// ── Outer curtain walls (Chebyshev half-extent 62 → 124×124) ───────────────────────────────
export const OUTER_HW = 62;
export const X0 = CX - OUTER_HW; // -54
export const X1 = CX + OUTER_HW; // 70
export const Z0 = CZ - OUTER_HW; // -42  south (approach / gate)
export const Z1 = CZ + OUTER_HW; // 82   north
export const WT = 4;
export const IN_X0 = X0 + WT;
export const IN_X1 = X1 - WT;
export const IN_Z0 = Z0 + WT;
export const IN_Z1 = Z1 - WT;

export const WALL_Y0 = G + 1;
export const WALK_Y = G + 12;
export const MERLON_Y = WALK_Y + 1;

export const GATE_HALF = 4;
export const GATE_TOP = G + 7;
export const GATEHOUSE_DEPTH = 14;

// ── Main keep ──────────────────────────────────────────────────────────────────────────────
export const KX0 = CX - 48; // -40
export const KX1 = CX + 48; // 56
export const KZ0 = CZ + 2; // 22
export const KZ1 = CZ + 62; // 82
export const KCX = (KX0 + KX1) >> 1; // 8
export const KCZ = (KZ0 + KZ1) >> 1; // 52

/** Blocks between storey floor surfaces (two stair flights of 5). */
export const STOREY_RISE = 10;

/**
 * Named floors. Great Hall (ground) is double-height up into the gallery underside.
 * Order is bottom → top for stacking.
 */
export const FLOOR = {
  dungeon: G - 12, // 60
  ground: G + 1, // 73  Great Hall
  gallery: G + 1 + STOREY_RISE, // 83  upper gallery / mezzanine
  throne: G + 1 + STOREY_RISE * 2, // 93
  state: G + 1 + STOREY_RISE * 3, // 103  ceremonial apartments
  residential: G + 1 + STOREY_RISE * 4, // 113
  guest: G + 1 + STOREY_RISE * 5, // 123  guest wing
  library: G + 1 + STOREY_RISE * 6, // 133
  high: G + 1 + STOREY_RISE * 7, // 143  war / high castle
  barracks: G + 1 + STOREY_RISE * 8, // 153
  observatory: G + 1 + STOREY_RISE * 9, // 163
  roof: G + 1 + STOREY_RISE * 10, // 173
} as const;

/**
 * Every walkable keep floor from ground up through roof (for stairs, wells, windows, corridors).
 */
export const STACK: readonly number[] = [
  FLOOR.ground,
  FLOOR.gallery,
  FLOOR.throne,
  FLOOR.state,
  FLOOR.residential,
  FLOOR.guest,
  FLOOR.library,
  FLOOR.high,
  FLOOR.barracks,
  FLOOR.observatory,
  FLOOR.roof,
];

/** Interior storeys only (excludes roof) — room/corridor programs. */
export const INTERIOR_STACK: readonly number[] = STACK.filter((y) => y !== FLOOR.roof);

/** @deprecated use STACK — kept as alias for older call sites */
export const STOREYS: readonly number[] = STACK;

/** Ceiling clearance under the floor above. */
export const STOREY_CLEAR = STOREY_RISE - 1;

// Grand stair well — east wing
export const STAIR_X0 = KX1 - 12; // 44
export const STAIR_X1 = KX1 - 3; // 53
export const STAIR_WIDTH = 5;
export const STAIR_Z0 = KZ0 + 4; // 26
export const STAIR_Z1 = KZ0 + 36; // 58

// Secondary stair — west wing
export const SEC_X0 = KX0 + 3;
export const SEC_X1 = KX0 + 10;
export const SEC_Z0 = KZ0 + 4;
export const SEC_Z1 = KZ0 + 16;

// Major towers — stay under WORLD_HEIGHT 192
export const CROWN = { cx: KX1 - 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 16 } as const; // 189
export const WATCH = { cx: KX0 + 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 14 } as const; // 187

export const DUNGEON_FLOOR = FLOOR.dungeon;
export const DUNGEON_CEIL = G - 2;
export const DUNGEON_SHAFT = { x: KCX - 20, z: KCZ } as const;

/** Half-rise mid-landing height between two floors. */
export function midLanding(floorY: number): number {
  return floorY + STOREY_RISE / 2;
}
