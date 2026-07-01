import { type Prefab, type PrefabVoxel } from '../core/Prefab';
import type { BlockId } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';
import { worldToChunkCoord, chunkKey } from '../core/coords';
import { AIR } from '../blocks/blocks';

export interface Box {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
}

/** Deduped chunk keys for chunk columns that overlap `box` and are not loaded. */
export function unloadedChunksInBox(
  isLoaded: (x: number, z: number) => boolean,
  box: Box,
): string[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out = new Set<string>();
  for (let x = ax; x <= bx; x += 1)
    for (let z = az; z <= bz; z += 1) {
      if (!isLoaded(x, z)) out.add(chunkKey(worldToChunkCoord(x), worldToChunkCoord(z)));
    }
  return [...out];
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
  if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
    throw new Error('replace box too large (>200000)');
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

/** Capture a region's non-air voxels into a Prefab (offsets from the box min corner; dims = box extents). */
export function captureRegion(
  read: (x: number, y: number, z: number) => BlockId,
  box: Box,
): Prefab {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
    throw new Error('capture region too large (>200000)');
  const blocks: PrefabVoxel[] = [];
  for (let y = ay; y <= by; y++)
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++) {
        const id = read(x, y, z);
        if (id !== AIR) blocks.push([x - ax, y - ay, z - az, id]);
      }
  return { dims: [bx - ax + 1, by - ay + 1, bz - az + 1], blocks };
}

/** Every voxel in the box set to `id` (sorted x→y→z, corners order-independent). */
export function fillBox(box: Box, id: BlockId): SetVoxel[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out: SetVoxel[] = [];
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++) out.push({ x, y, z, id });
  return out;
}

/** Every voxel in the box set to AIR. */
export function clearBox(box: Box): SetVoxel[] {
  return fillBox(box, AIR);
}
