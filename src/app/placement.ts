import { facingFromYaw, packState } from '../world/VoxelState';

/** Orientation state for a stair placed by a player looking along `yaw` (bottom half). */
export function stairStateFromYaw(yaw: number): number {
  return packState(facingFromYaw(yaw), 0);
}
