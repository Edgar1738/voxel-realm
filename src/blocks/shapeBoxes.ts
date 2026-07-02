import { FACING } from '../world/VoxelState';

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
