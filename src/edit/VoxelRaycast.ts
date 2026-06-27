import { AIR } from '../blocks/blocks';
import type { Vec3, BlockId } from '../core/types';

export interface BlockSampler {
  getBlock(x: number, y: number, z: number): BlockId;
}

export interface VoxelRaycastHit {
  block: { x: number; y: number; z: number };
  adjacent: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  id: BlockId;
}

export function raycastVoxels(
  sampler: BlockSampler,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): VoxelRaycastHit | undefined {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  const dx = len === 0 ? 0 : direction.x / len;
  const dy = len === 0 ? 0 : direction.y / len;
  const dz = len === 0 ? -1 : direction.z / len;

  let vx = Math.floor(origin.x);
  let vy = Math.floor(origin.y);
  let vz = Math.floor(origin.z);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  // Distance to first voxel boundary along each axis (always positive — boundary is ahead).
  let tMaxX = dx !== 0 ? ((stepX > 0 ? vx + 1 : vx) - origin.x) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? vy + 1 : vy) - origin.y) / dy : Infinity;
  let tMaxZ = dz !== 0 ? ((stepZ > 0 ? vz + 1 : vz) - origin.z) / dz : Infinity;

  let adjacent = { x: vx, y: vy, z: vz };
  let normal = { x: 0, y: 0, z: 0 };
  let traveled = 0;

  while (traveled <= maxDistance) {
    const id = sampler.getBlock(vx, vy, vz);
    if (id !== AIR) {
      return { block: { x: vx, y: vy, z: vz }, adjacent, normal, id };
    }

    // Record last empty cell before stepping.
    adjacent = { x: vx, y: vy, z: vz };

    // Advance along the axis with the smallest tMax (x beats y beats z on ties).
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      vx += stepX;
      traveled = tMaxX;
      tMaxX += tDeltaX;
      normal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY <= tMaxZ) {
      vy += stepY;
      traveled = tMaxY;
      tMaxY += tDeltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      vz += stepZ;
      traveled = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
  }

  return undefined;
}
