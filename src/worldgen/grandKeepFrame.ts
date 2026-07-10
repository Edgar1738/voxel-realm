import { GRAND_KEEP } from './GrandKeepGenerator';

/**
 * Shared world-space frame for The Grand Keep.
 *
 * Vertical programme (WORLD_HEIGHT = 512):
 * - 1 dungeon level
 * - 30 storey rises from Great Hall floor to roof (~3× the prior 10-rise stack)
 * - Crown / Watch towers above the roof
 */
export const G = GRAND_KEEP.groundY; // 72
export const CX = GRAND_KEEP.centerX; // 8
export const CZ = GRAND_KEEP.centerZ; // 20

// ── Outer curtain walls ────────────────────────────────────────────────────────────────────
export const OUTER_HW = 62;
export const X0 = CX - OUTER_HW;
export const X1 = CX + OUTER_HW;
export const Z0 = CZ - OUTER_HW;
export const Z1 = CZ + OUTER_HW;
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
export const KX0 = CX - 48;
export const KX1 = CX + 48;
export const KZ0 = CZ + 2;
export const KZ1 = CZ + 62;
export const KCX = (KX0 + KX1) >> 1;
export const KCZ = (KZ0 + KZ1) >> 1;

/** Blocks between storey floor surfaces (two stair flights of 5). */
export const STOREY_RISE = 10;

/**
 * Number of rises from ground floor up to the roof.
 * Was 10 (~100 blocks of keep height); now 30 (~300 blocks) — about 3× taller.
 */
export const STOREY_RISES = 30;

/** Build the full vertical stack: ground … roof (length = STOREY_RISES + 1). */
function buildStack(): number[] {
  const out: number[] = [];
  const ground = G + 1;
  for (let i = 0; i <= STOREY_RISES; i++) out.push(ground + i * STOREY_RISE);
  return out;
}

export const STACK: readonly number[] = buildStack();

/**
 * Named landmark floors (indices into STACK). Dressing/themed content hooks onto these;
 * every STACK level still gets floors, stairs, corridors, and balconies.
 */
export const FLOOR = {
  dungeon: G - 12,
  ground: STACK[0], // Great Hall
  gallery: STACK[1],
  throne: STACK[3],
  state: STACK[6],
  residential: STACK[10],
  guest: STACK[14],
  library: STACK[18],
  high: STACK[22],
  barracks: STACK[26],
  observatory: STACK[STOREY_RISES - 1],
  roof: STACK[STOREY_RISES],
} as const;

/** Interior storeys only (excludes roof). */
export const INTERIOR_STACK: readonly number[] = STACK.slice(0, -1);

/** @deprecated use STACK */
export const STOREYS: readonly number[] = STACK;

export const STOREY_CLEAR = STOREY_RISE - 1;

// Grand stair well — east wing
export const STAIR_X0 = KX1 - 12;
export const STAIR_X1 = KX1 - 3;
export const STAIR_WIDTH = 5;
export const STAIR_Z0 = KZ0 + 4;
export const STAIR_Z1 = KZ0 + 36;

// Secondary stair — west wing
export const SEC_X0 = KX0 + 3;
export const SEC_X1 = KX0 + 10;
export const SEC_Z0 = KZ0 + 4;
export const SEC_Z1 = KZ0 + 16;

// Towers — sit on roof, stay under WORLD_HEIGHT 512
export const CROWN = { cx: KX1 - 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 24 } as const;
export const WATCH = { cx: KX0 + 8, cz: KZ1 - 9, half: 6, topY: FLOOR.roof + 20 } as const;

export const DUNGEON_FLOOR = FLOOR.dungeon;
export const DUNGEON_CEIL = G - 2;
export const DUNGEON_SHAFT = { x: KCX - 20, z: KCZ } as const;

export function midLanding(floorY: number): number {
  return floorY + STOREY_RISE / 2;
}
