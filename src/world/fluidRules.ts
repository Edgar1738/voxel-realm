import { AIR, GRAVEL, SAND, WATER } from '../blocks/blocks';
import { WORLD_HEIGHT } from '../core/constants';
import type { SetVoxel } from '../edit/EditTypes';

/**
 * Water level lives in the low 3 bits of the voxel state byte: 0 = source (never
 * decays), 1..7 = flowing, one step weaker per horizontal block from its feed.
 * Water never uses the facing/half/open bits, so this doesn't collide with the
 * stair/gate/door state layout.
 */
export const MAX_FLOW_LEVEL = 7;

export function waterLevel(state: number): number {
  return state & 0b111;
}

/** The world slice the tick rules read. All coordinates are world-space. */
export interface SimSampler {
  getBlock(x: number, y: number, z: number): number;
  getState(x: number, y: number, z: number): number;
  /** Whether the chunk containing this column is loaded (rules stall at frontiers). */
  isLoaded(x: number, z: number): boolean;
}

const HORIZONTAL: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * One simulation step for the cell. Returns the edits this cell wants (possibly
 * touching neighbors), or [] when it is stable. Pure — the scheduler applies the
 * edits and re-enqueues whatever actually changed, so flows cascade tick by tick.
 */
export function tickCell(s: SimSampler, x: number, y: number, z: number): SetVoxel[] {
  const id = s.getBlock(x, y, z);
  if (id === SAND || id === GRAVEL) return tickGravity(s, x, y, z, id);
  if (id === WATER) return tickWater(s, x, y, z);
  return [];
}

/** Sand/gravel fall: unsupported blocks drop one cell per tick, displacing water. */
function tickGravity(s: SimSampler, x: number, y: number, z: number, id: number): SetVoxel[] {
  if (y - 1 < 0) return [];
  const below = s.getBlock(x, y - 1, z);
  if (below !== AIR && below !== WATER) return [];
  return [
    { x, y, z, id: AIR },
    { x, y: y - 1, z, id, state: 0 },
  ];
}

/**
 * Minecraft-style finite water:
 * - a column falls before it spreads (waterfalls take priority);
 * - on a floor, water spreads to horizontal air at level+1, stopping at level 7;
 * - flowing water must stay connected to something wetter (a level-1 neighbor or
 *   water overhead); orphaned flow re-levels upward until it evaporates.
 * Any neighbor in an unloaded chunk stalls the cell — never guess at frontiers.
 */
function tickWater(s: SimSampler, x: number, y: number, z: number): SetVoxel[] {
  for (const [dx, dz] of HORIZONTAL) {
    if (!s.isLoaded(x + dx, z + dz)) return [];
  }

  const level = waterLevel(s.getState(x, y, z));
  const fedFromAbove = y + 1 < WORLD_HEIGHT && s.getBlock(x, y + 1, z) === WATER;

  // Sustain: flowing water re-derives its level from its wettest neighbor.
  if (level > 0) {
    let expected: number;
    if (fedFromAbove) {
      expected = 1;
    } else {
      let wettest = Infinity;
      for (const [dx, dz] of HORIZONTAL) {
        if (s.getBlock(x + dx, y, z + dz) === WATER) {
          wettest = Math.min(wettest, waterLevel(s.getState(x + dx, y, z + dz)));
        }
      }
      expected = wettest + 1;
    }
    if (expected > MAX_FLOW_LEVEL) return [{ x, y, z, id: AIR }];
    if (expected !== level) return [{ x, y, z, id: WATER, state: expected }];
  }

  // Fall: air below turns into fresh flow; no sideways spread while falling.
  if (y - 1 >= 0 && s.getBlock(x, y - 1, z) === AIR) {
    return [{ x, y: y - 1, z, id: WATER, state: 1 }];
  }

  // Water resting on more water never spreads sideways (Minecraft rule): only the
  // cell that lands on a solid floor fans out. Otherwise every level of a waterfall
  // (and the waterfall's own source) would restart a full-range flood and one
  // column would wet the whole world.
  if (s.getBlock(x, y - 1, z) === WATER) return [];

  // Spread along the floor.
  if (level >= MAX_FLOW_LEVEL) return [];
  const out: SetVoxel[] = [];
  for (const [dx, dz] of HORIZONTAL) {
    if (s.getBlock(x + dx, y, z + dz) === AIR) {
      out.push({ x: x + dx, y, z: z + dz, id: WATER, state: level + 1 });
    }
  }
  return out;
}
