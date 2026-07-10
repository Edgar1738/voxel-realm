import { GRAND_KEEP } from './GrandKeepGenerator';

/**
 * Shared world-space frame for The Grand Keep. All site modules import these constants so walls,
 * keep, towers, stairs, and dungeon stay locked together.
 *
 * Scale targets (Milestone 1):
 * - Outer curtain ~124×124 blocks
 * - Main keep shell ~96×60
 * - Four above-ground storeys + dungeon + walkable roof
 * - Crown + Watch towers above the roofline
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
export const WT = 4; // curtain thickness
export const IN_X0 = X0 + WT;
export const IN_X1 = X1 - WT;
export const IN_Z0 = Z0 + WT;
export const IN_Z1 = Z1 - WT;

export const WALL_Y0 = G + 1;
export const WALK_Y = G + 12; // wall-walk surface
export const MERLON_Y = WALK_Y + 1;

// Gatehouse (south wall): monumental opening
export const GATE_HALF = 4; // 9-wide passage
export const GATE_TOP = G + 7;
export const GATEHOUSE_DEPTH = 14; // how far the gatehouse projects inward

// ── Main keep (north of courtyard) ─────────────────────────────────────────────────────────
// Footprint ~96 × 60, north end of the bailey.
export const KX0 = CX - 48; // -40
export const KX1 = CX + 48; // 56
export const KZ0 = CZ + 2; // 22  south face of keep (courtyard side)
export const KZ1 = CZ + 62; // 82  north face (flush with outer wall north)
export const KCX = (KX0 + KX1) >> 1; // 8
export const KCZ = (KZ0 + KZ1) >> 1; // 52

/**
 * Vertical programme — storey floors are the solid floor surface the player stands on.
 * Great Hall has double-height volume (floor G+1, ceiling under L2).
 */
export const FLOOR = {
  dungeon: G - 12, // 60
  ground: G + 1, // 73  Great Hall
  throne: G + 13, // 85  (+12 storey rise — two stair flights of 6)
  residential: G + 25, // 97
  high: G + 37, // 109
  roof: G + 49, // 121
} as const;

export const STOREYS: readonly number[] = [
  FLOOR.ground,
  FLOOR.throne,
  FLOOR.residential,
  FLOOR.high,
  FLOOR.roof,
];

/** Ceiling clearance under the floor above (air volume height). */
export const STOREY_CLEAR = 11;

// Grand stair well — east wing, mid-south (keeps north free for Crown Tower)
export const STAIR_X0 = KX1 - 12; // 44
export const STAIR_X1 = KX1 - 3; // 53
export const STAIR_WIDTH = 5; // walkable steps
export const STAIR_Z0 = KZ0 + 4; // 26
export const STAIR_Z1 = KZ0 + 36; // 58 — short of north towers

// Secondary stair — west wing (south)
export const SEC_X0 = KX0 + 3;
export const SEC_X1 = KX0 + 10;
export const SEC_Z0 = KZ0 + 4;
export const SEC_Z1 = KZ0 + 16;

// Crown tower (NE) and Watch tower (NW) — clear of stair wells
export const CROWN = { cx: KX1 - 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 28 } as const;
export const WATCH = { cx: KX0 + 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 22 } as const;

// Dungeon
export const DUNGEON_FLOOR = FLOOR.dungeon;
export const DUNGEON_CEIL = G - 2;
export const DUNGEON_SHAFT = { x: KCX - 20, z: KCZ } as const;
