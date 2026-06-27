import type { Vec3, BlockId } from '../core/types';

export interface RayHit {
  /** Integer coords of the solid voxel that was hit. */
  voxel: Vec3;
  /** Unit face normal of the face the ray entered through. */
  normal: Vec3;
  blockId: BlockId;
}

/**
 * Amanatides–Woo voxel DDA. Steps from `origin` along `dir` up to `maxDistance` world units,
 * returning the first voxel where `isSolid(getBlock(...))` plus the entry-face normal.
 */
export function raycastVoxel(
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => BlockId,
  isSolid: (id: BlockId) => boolean,
): RayHit | null {
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len === 0) return null;
  const dx = dir.x / len;
  const dy = dir.y / len;
  const dz = dir.z / len;

  let vx = Math.floor(origin.x);
  let vy = Math.floor(origin.y);
  let vz = Math.floor(origin.z);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  const boundary = (o: number, v: number, step: number): number => (step > 0 ? v + 1 - o : o - v);
  let tMaxX = dx !== 0 ? boundary(origin.x, vx, stepX) / Math.abs(dx) : Infinity;
  let tMaxY = dy !== 0 ? boundary(origin.y, vy, stepY) / Math.abs(dy) : Infinity;
  let tMaxZ = dz !== 0 ? boundary(origin.z, vz, stepZ) / Math.abs(dz) : Infinity;

  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  let t = 0;

  while (t <= maxDistance) {
    const id = getBlock(vx, vy, vz);
    if (isSolid(id)) return { voxel: { x: vx, y: vy, z: vz }, normal, blockId: id };

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      vx += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY <= tMaxZ) {
      vy += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      vz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
  }
  return null;
}
