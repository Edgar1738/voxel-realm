import type { Vec3 } from '../core/types';

/** Queries whether the voxel at integer world coords is solid (blocks the player). */
export interface SoliditySampler {
  isSolid(x: number, y: number, z: number): boolean;
}

export interface CollisionResult {
  center: Vec3;
  grounded: boolean;
}

const STEP = 0.4; // max substep distance (< 1 voxel) to avoid tunneling
const EPS = 1e-3;

/** True if the AABB [center±half] overlaps any solid voxel. */
function overlapsSolid(sampler: SoliditySampler, center: Vec3, half: Vec3): boolean {
  const x0 = Math.floor(center.x - half.x);
  const x1 = Math.floor(center.x + half.x);
  const y0 = Math.floor(center.y - half.y);
  const y1 = Math.floor(center.y + half.y);
  const z0 = Math.floor(center.z - half.z);
  const z1 = Math.floor(center.z + half.z);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (sampler.isSolid(x, y, z)) return true;
  return false;
}

/** Moves one axis by `d`, clamping to the contact plane if it would enter a solid. */
function sweepAxis(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  axis: 'x' | 'y' | 'z',
  d: number,
): { value: number; hit: boolean } {
  if (d === 0) return { value: center[axis], hit: false };
  const moved: Vec3 = { ...center, [axis]: center[axis] + d };
  if (!overlapsSolid(sampler, moved, half)) return { value: moved[axis], hit: false };
  // Collision: snap so the leading face touches the voxel boundary.
  const h = half[axis];
  const value =
    d > 0 ? Math.floor(moved[axis] + h) - h - EPS : Math.ceil(moved[axis] - h) + h + EPS;
  return { value, hit: true };
}

/**
 * Resolves an AABB move against the solidity sampler. Substeps the delta to stay under
 * one voxel per step, resolving X, Z, then Y so the player slides along walls and rests
 * cleanly on floors. `grounded` is true when a downward move was blocked.
 */
export function resolveCollision(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  delta: Vec3,
): CollisionResult {
  const pos: Vec3 = { ...center };
  let grounded = false;

  const maxComp = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = Math.max(1, Math.ceil(maxComp / STEP));
  const sd: Vec3 = { x: delta.x / steps, y: delta.y / steps, z: delta.z / steps };

  for (let s = 0; s < steps; s++) {
    pos.x = sweepAxis(sampler, pos, half, 'x', sd.x).value;
    pos.z = sweepAxis(sampler, pos, half, 'z', sd.z).value;
    const y = sweepAxis(sampler, pos, half, 'y', sd.y);
    pos.y = y.value;
    if (y.hit && sd.y < 0) grounded = true;
  }

  return { center: pos, grounded };
}
