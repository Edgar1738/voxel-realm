import { FACING } from '../world/VoxelState';

/** A local axis-aligned box within a voxel: [minX,minY,minZ, maxX,maxY,maxZ] (0..1, Y up to 1.5). */
export type AABB = readonly [number, number, number, number, number, number];

export const CUBE_BOX: AABB = [0, 0, 0, 1, 1, 1];
export const SLAB_BOX: AABB = [0, 0, 0, 1, 0.5, 1];
/** Full-footprint, 1.5 tall — fences, walls, closed gates (unjumpable). */
export const TALL_BOX: AABB = [0, 0, 0, 1, 1.5, 1];

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
