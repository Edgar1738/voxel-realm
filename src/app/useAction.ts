import { toggleOpen } from '../world/VoxelState';
import type { SetVoxel, WorldVoxel } from '../edit/EditTypes';

/** The edit that toggles a gate's open bit in place (same id, same position, flipped open). */
export function gateToggleEdit(target: WorldVoxel, id: number, state: number): SetVoxel {
  return { x: target.x, y: target.y, z: target.z, id, state: toggleOpen(state) };
}
