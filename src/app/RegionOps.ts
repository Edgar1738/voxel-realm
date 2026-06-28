import type { Prefab } from '../core/Prefab';
import type { BlockId } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';

export interface Box {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
}

/** Voxels inside `box` whose current id equals `fromId`, retargeted to `toId`. */
export function replaceVoxels(
  read: (x: number, y: number, z: number) => BlockId,
  box: Box,
  fromId: BlockId,
  toId: BlockId,
): SetVoxel[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out: SetVoxel[] = [];
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++) if (read(x, y, z) === fromId) out.push({ x, y, z, id: toId });
  return out;
}

/** Stamp a prefab's non-air blocks at a paste origin. */
export function prefabToVoxels(p: Prefab, ox: number, oy: number, oz: number): SetVoxel[] {
  return p.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id }));
}
