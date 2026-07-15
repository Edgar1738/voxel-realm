import { CLOUDSPIRE } from './CloudspireGenerator';

/**
 * Shared world-space frame for Cloudspire Citadel.
 * Vertical programme stays under WORLD_HEIGHT 512 with accessible crown ~y 410.
 */
export const G = CLOUDSPIRE.groundY; // 96 outer terrace
export const GP = CLOUDSPIRE.palaceY; // 112
export const GG = CLOUDSPIRE.gardenY; // 104
export const CX = CLOUDSPIRE.centerX; // 0
export const CZ = CLOUDSPIRE.centerZ; // 0

// Outer fortifications (~250 wide)
export const OUTER_HW = 125;
export const X0 = CX - OUTER_HW;
export const X1 = CX + OUTER_HW;
export const Z0 = CZ - OUTER_HW; // south approach / gate
export const Z1 = CZ + OUTER_HW;
export const WT = 5;
export const IN_X0 = X0 + WT;
export const IN_X1 = X1 - WT;
export const IN_Z0 = Z0 + WT;
export const IN_Z1 = Z1 - WT;

export const WALL_Y0 = G + 1;
export const WALK_Y = G + 16;
export const MERLON_Y = WALK_Y + 1;
export const GATE_HALF = 6;
export const GATE_TOP = G + 10;
export const GATEHOUSE_DEPTH = 18;

// Garden terrace ring
export const GARDEN_HW = 100;
export const GX0 = CX - GARDEN_HW;
export const GX1 = CX + GARDEN_HW;
export const GZ0 = CZ - GARDEN_HW;
export const GZ1 = CZ + GARDEN_HW;

// Palace terrace / inner court
export const PALACE_HW = 74;
export const PX0 = CX - PALACE_HW;
export const PX1 = CX + PALACE_HW;
export const PZ0 = CZ - PALACE_HW;
export const PZ1 = CZ + PALACE_HW;

// Cathedral (south of court, nave along +Z toward palace)
export const CATH = {
  x0: CX - 29,
  x1: CX + 29,
  z0: CZ - 62,
  z1: CZ - 8,
  floor: GP + 1,
  wallH: 28,
  ridgeH: 52,
  towerH: 78,
} as const;
export const CATH_CX = (CATH.x0 + CATH.x1) >> 1;
export const CATH_CZ = (CATH.z0 + CATH.z1) >> 1;

// Central palace footprint (north of cathedral)
export const KEEP = {
  x0: CX - 40,
  x1: CX + 40,
  z0: CZ - 4,
  z1: CZ + 52,
  floor: GP + 1,
} as const;
export const KCX = (KEEP.x0 + KEEP.x1) >> 1;
export const KCZ = (KEEP.z0 + KEEP.z1) >> 1;

/** Storey rise for palace floors. */
export const STOREY_RISE = 10;
export const STOREY_RISES = 12; // palace body before spire stages

function buildStack(base: number, rises: number, rise: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= rises; i++) out.push(base + i * rise);
  return out;
}

export const PALACE_STACK: readonly number[] = buildStack(KEEP.floor, STOREY_RISES, STOREY_RISE);

export const FLOOR = {
  ground: PALACE_STACK[0],
  hall: PALACE_STACK[0],
  gallery: PALACE_STACK[1],
  throne: PALACE_STACK[3],
  residential: PALACE_STACK[5],
  library: PALACE_STACK[7],
  high: PALACE_STACK[9],
  roof: PALACE_STACK[STOREY_RISES],
} as const;

// Main spire stages (above palace roof) — narrowing octagonal shells
// Peak kept near y≈430; accessible crown near y≈410 (WORLD_HEIGHT 512).
export const SPIRE = {
  baseY: FLOOR.roof,
  stages: [
    { half: 22, height: 36 }, // 0
    { half: 16, height: 40 }, // 1
    { half: 11, height: 42 }, // 2
    { half: 7, height: 40 }, // 3
    { half: 4, height: 28 }, // 4 accessible crown band
    { half: 2, height: 18 }, // 5 decorative peak
  ],
} as const;

/** Highest walkable balcony (top of stage 4). */
export function spireAccessibleY(): number {
  let y = SPIRE.baseY;
  for (let i = 0; i < 5; i++) y += SPIRE.stages[i].height;
  return y - 2;
}

/** Decorative peak (under WORLD_HEIGHT). */
export function spirePeakY(): number {
  let y = SPIRE.baseY;
  for (const st of SPIRE.stages) y += st.height;
  return Math.min(y + 8, 440);
}

// Grand stair well (east wing of palace)
export const STAIR_X0 = KEEP.x1 - 14;
export const STAIR_X1 = KEEP.x1 - 4;
export const STAIR_Z0 = KEEP.z0 + 6;
export const STAIR_Z1 = KEEP.z0 + 34;

// Spawn / arrival
export const SPAWN = { x: 0, y: 118.5, z: -210 } as const;
export const LOOK = { yaw: Math.PI, pitch: 0.5 } as const;

// Waterfall outlets (world coords)
export const FALLS = [
  { x: 70, z: -30, top: 138, bottom: G + 2 },
  { x: -75, z: 20, top: 136, bottom: G + 2 },
  { x: 40, z: 90, top: 130, bottom: G + 1 },
  { x: -30, z: -95, top: 125, bottom: GG },
] as const;
