import type { Vec3 } from '../core/types';

/** Queries whether the voxel at integer world coords is solid (blocks the player). */
export interface SoliditySampler {
  isSolid(x: number, y: number, z: number): boolean;
  /** Collision footprint of a voxel; defaults (when absent) to 'full' if isSolid else 'none'. */
  solidBox?(x: number, y: number, z: number): 'none' | 'full' | 'lowerHalf';
}

export interface CollisionResult {
  center: Vec3;
  grounded: boolean;
}

const STEP = 0.4; // max substep distance (< 1 voxel) to avoid tunneling
const EPS = 1e-3;

type Box = 'none' | 'full' | 'lowerHalf';

/** The collision box at a voxel, falling back to isSolid when no solidBox is provided. */
function boxAt(sampler: SoliditySampler, x: number, y: number, z: number): Box {
  if (sampler.solidBox) return sampler.solidBox(x, y, z);
  return sampler.isSolid(x, y, z) ? 'full' : 'none';
}

/** The top surface height of a voxel's solid region (its base is the voxel floor `y`). */
function boxTop(box: Box, y: number): number {
  return box === 'lowerHalf' ? y + 0.5 : y + 1; // 'full' → y+1
}

/** True if the AABB [center±half] overlaps any solid voxel's solid sub-box. */
function overlapsSolid(sampler: SoliditySampler, center: Vec3, half: Vec3): boolean {
  const x0 = Math.floor(center.x - half.x);
  const x1 = Math.floor(center.x + half.x);
  const y0 = Math.floor(center.y - half.y);
  const y1 = Math.floor(center.y + half.y);
  const z0 = Math.floor(center.z - half.z);
  const z1 = Math.floor(center.z + half.z);
  const aabbMinY = center.y - half.y;
  const aabbMaxY = center.y + half.y;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(sampler, x, y, z);
        if (box === 'none') continue;
        if (box === 'full') return true; // any full voxel in the floored range overlaps
        // lowerHalf: solid region is [y, y+0.5] — overlap only if the AABB dips into it.
        if (aabbMinY < y + 0.5 && aabbMaxY > y) return true;
      }
  return false;
}

/**
 * Highest solid surface under the footprint at or below the player's feet, scanning the band the
 * feet pass through. Used to rest the player on the actual surface (slab top = y+0.5, full = y+1).
 * Returns -Infinity if nothing solid is hit.
 */
function highestSupport(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  feet0: number,
  feetTarget: number,
): number {
  const x0 = Math.floor(center.x - half.x);
  const x1 = Math.floor(center.x + half.x);
  const z0 = Math.floor(center.z - half.z);
  const z1 = Math.floor(center.z + half.z);
  const yLo = Math.floor(feetTarget - EPS);
  const yHi = Math.floor(feet0 + EPS);
  let best = -Infinity;
  for (let y = yLo; y <= yHi; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(sampler, x, y, z);
        if (box === 'none') continue;
        const top = boxTop(box, y);
        if (top <= feet0 + EPS && top > best) best = top;
      }
  return best;
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
 * Attempts a step-up for a blocked horizontal move: shifts the player up by 1 voxel and
 * retries the horizontal axis. Returns the new {x, y, z} if the stepped position is clear,
 * or `null` if it is still blocked (wall taller than 1, ceiling in the way, etc.).
 */
function tryStepUp(
  sampler: SoliditySampler,
  pos: Vec3,
  half: Vec3,
  axis: 'x' | 'z',
  d: number,
): { x: number; y: number; z: number } | null {
  // Raise by 1 + EPS to ensure floating-point boundaries don't keep the bottom face
  // inside the voxel we are stepping over (e.g. 1.9 - 0.9 = 0.999... which floors to 0).
  const raised: Vec3 = { ...pos, y: pos.y + 1 + EPS };
  // Check that the raised position itself is clear before trying to move.
  if (overlapsSolid(sampler, raised, half)) return null;
  // Try the horizontal move from the raised position.
  const result = sweepAxis(sampler, raised, half, axis, d);
  if (result.hit) return null; // still blocked even raised — wall is taller than 1 block
  return { ...raised, [axis]: result.value };
}

/**
 * Resolves an AABB move against the solidity sampler. Substeps the delta to stay under
 * one voxel per step, resolving X, Z, then Y so the player slides along walls and rests
 * cleanly on floors. `grounded` is true when a downward move was blocked.
 *
 * Step-up: when a horizontal (X or Z) move is blocked and there is no vertical delta
 * in this substep (walk mode, not flying), the resolver tries shifting the player up by
 * 1 voxel and retrying the move. If that path is clear the step-up is accepted.
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
    // Track y at the start of this substep to cap net vertical gain from step-ups.
    const substepStartY = pos.y;

    // --- X axis ---
    const xResult = sweepAxis(sampler, pos, half, 'x', sd.x);
    let steppedUp = false;
    if (xResult.hit && sd.y === 0 && sd.x !== 0) {
      // Horizontal move blocked with no vertical component — attempt step-up.
      const stepped = tryStepUp(sampler, pos, half, 'x', sd.x);
      if (stepped !== null) {
        pos.x = stepped.x;
        pos.y = stepped.y;
        steppedUp = true;
      } else {
        pos.x = xResult.value;
      }
    } else {
      pos.x = xResult.value;
    }

    // --- Z axis ---
    const zResult = sweepAxis(sampler, pos, half, 'z', sd.z);
    if (zResult.hit && sd.y === 0 && sd.z !== 0) {
      // Only attempt step-up if we haven't already stepped up in this substep;
      // a second step-up would over-pop the player into an inside corner.
      const stepped = !steppedUp ? tryStepUp(sampler, pos, half, 'z', sd.z) : null;
      if (stepped !== null) {
        pos.z = stepped.z;
        pos.y = stepped.y;
      } else {
        pos.z = zResult.value;
      }
    } else {
      pos.z = zResult.value;
    }

    // Cap the net vertical gain from step-up(s) in this substep to 1 voxel.
    // Use +EPS (matching tryStepUp's raise amount) so the clamped position reliably
    // places the player's feet above the ledge top, preventing a redundant step-up
    // on the very next substep due to floating-point floor precision.
    if (pos.y - substepStartY > 1.0) {
      pos.y = substepStartY + 1.0 + EPS;
    }

    // --- Y axis ---
    if (sd.y < 0) {
      const feet0 = pos.y - half.y;
      const movedDown: Vec3 = { ...pos, y: pos.y + sd.y };
      if (overlapsSolid(sampler, movedDown, half)) {
        const support = highestSupport(sampler, pos, half, feet0, feet0 + sd.y);
        pos.y = support + half.y;
        grounded = true;
      } else {
        pos.y += sd.y;
      }
    } else {
      const y = sweepAxis(sampler, pos, half, 'y', sd.y);
      pos.y = y.value;
    }
  }

  return { center: pos, grounded };
}
