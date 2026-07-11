import { FACING, FACING_DIR } from '../world/VoxelState';

/** A local axis-aligned box within a voxel: [minX,minY,minZ, maxX,maxY,maxZ] (0..1, Y up to 1.5). */
export type AABB = readonly [number, number, number, number, number, number];

export const CUBE_BOX: AABB = [0, 0, 0, 1, 1, 1];
export const SLAB_BOX: AABB = [0, 0, 0, 1, 0.5, 1];
export const SLAB_TOP_BOX: AABB = [0, 0.5, 0, 1, 1, 1];
/** Full-footprint, 1.5 tall — closed gates, and the neighborless fence/wall fallback (unjumpable). */
export const TALL_BOX: AABB = [0, 0, 0, 1, 1.5, 1];

/** Post footprint (lo/hi on both horizontal axes) for connecting shapes. */
export const FENCE_POST = { lo: 0.375, hi: 0.625 } as const;
export const WALL_POST = { lo: 0.25, hi: 0.75 } as const;

/** Which horizontal neighbours a fence/wall connects to (+x, -x, +z, -z). */
export interface ConnFlags {
  px: boolean;
  nx: boolean;
  pz: boolean;
  nz: boolean;
}

/**
 * Fence/wall collision as a 1.5-tall central post plus a same-thickness arm toward each
 * connected neighbour — matching the rendered connections (Minecraft-style) instead of a
 * full chunky pillar.
 */
export function connectedBoxes(post: { lo: number; hi: number }, conns: ConnFlags): AABB[] {
  const { lo, hi } = post;
  const boxes: AABB[] = [[lo, 0, lo, hi, 1.5, hi]];
  if (conns.px) boxes.push([hi, 0, lo, 1, 1.5, hi]);
  if (conns.nx) boxes.push([0, 0, lo, lo, 1.5, hi]);
  if (conns.pz) boxes.push([lo, 0, hi, hi, 1.5, 1]);
  if (conns.nz) boxes.push([lo, 0, 0, hi, 1.5, lo]);
  return boxes;
}

/** Door panel thickness (≈ Minecraft's 3/16). */
export const DOOR_THICKNESS = 0.19;
/** Ladder plate thickness — thin enough to hug the wall, thick enough to read side-on. */
export const LADDER_THICKNESS = 0.08;
/** Doors collide 1.5 tall (unjumpable, same convention as fences/gates)… */
export const DOOR_COLLISION_HEIGHT = 1.5;
/** …but render 2 tall, filling a standard 2-high doorway. */
export const DOOR_RENDER_HEIGHT = 2;

/**
 * A thin slab flush against the cell edge BEHIND `facing` (the −FACING_DIR side): a ladder
 * plate hugs the wall it was clicked onto, a closed door panel sits at the edge nearest the
 * placer. Shared by rendering and collision so the two can't disagree.
 */
export function edgeSlabBox(facing: number, thickness: number, height: number): AABB {
  const [dx, dz] = FACING_DIR[facing & 0b11];
  if (dz === -1) return [0, 0, 1 - thickness, 1, height, 1]; // behind = +Z edge
  if (dz === 1) return [0, 0, 0, 1, height, thickness]; // behind = -Z edge
  if (dx === -1) return [1 - thickness, 0, 0, 1, height, 1]; // behind = +X edge
  return [0, 0, 0, thickness, height, 1]; // behind = -X edge
}

/**
 * The door panel box. Closed: flush at the edge behind the facing, spanning the passage.
 * Open: swung 90° clockwise onto the adjacent side edge (hinge at the shared corner), so
 * the doorway clears.
 */
export function doorBox(facing: number, open: boolean, height: number): AABB {
  return edgeSlabBox(open ? (facing + 1) % 4 : facing, DOOR_THICKNESS, height);
}

/**
 * The two boxes of a stair (local): a lower full half + an upper back-half. Mirrors the render
 * geometry in emitShaped so collision and rendering share one source. `half` 1 = top (upside-down).
 */
export function stairBoxes(facing: number, half: number): AABB[] {
  const yFullLo = half === 1 ? 0.5 : 0;
  const yFullHi = half === 1 ? 1 : 0.5;
  const yStepLo = half === 1 ? 0 : 0.5;
  const yStepHi = half === 1 ? 0.5 : 1;
  let sx0 = 0;
  let sx1 = 1;
  let sz0 = 0;
  let sz1 = 1;
  if (facing === FACING.N) sz0 = 0.5;
  else if (facing === FACING.S) sz1 = 0.5;
  else if (facing === FACING.E) sx1 = 0.5;
  else sx0 = 0.5;
  return [
    [0, yFullLo, 0, 1, yFullHi, 1],
    [sx0, yStepLo, sz0, sx1, yStepHi, sz1],
  ];
}
