import type { Vec3 } from '../core/types';
import type { AABB } from '../blocks/shapeBoxes';

/** Supplies the world-space collision boxes occupying an integer voxel cell. */
export interface SoliditySampler {
  collisionBoxes(x: number, y: number, z: number): AABB[];
}

export interface CollisionResult {
  center: Vec3;
  grounded: boolean;
}

const STEP = 0.4; // max substep distance (< the 0.5 smallest feature) to avoid tunneling
const EPS = 1e-3;

/**
 * Calls `fn` for every world AABB near the player AABB [pMin..pMax]. Scans one voxel below the
 * floored Y range so a box taller than its voxel (fence = 1.5; overhang 0.5 < 1) is considered.
 */
function forEachBoxNear(
  sampler: SoliditySampler,
  pMinX: number,
  pMinY: number,
  pMinZ: number,
  pMaxX: number,
  pMaxY: number,
  pMaxZ: number,
  fn: (b: AABB) => void,
): void {
  const x0 = Math.floor(pMinX);
  const x1 = Math.floor(pMaxX);
  const y0 = Math.floor(pMinY) - 1;
  const y1 = Math.floor(pMaxY);
  const z0 = Math.floor(pMinZ);
  const z1 = Math.floor(pMaxZ);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) for (const b of sampler.collisionBoxes(x, y, z)) fn(b);
}

/** Strict overlap of [aMin,aMax] and [bMin,bMax] with an EPS margin (resting contact ≠ overlap). */
function axisOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax - EPS && aMax > bMin + EPS;
}

/** True if the player AABB (center ± half) overlaps any solid box. */
function overlapsSolid(sampler: SoliditySampler, center: Vec3, half: Vec3): boolean {
  const pMinX = center.x - half.x;
  const pMaxX = center.x + half.x;
  const pMinY = center.y - half.y;
  const pMaxY = center.y + half.y;
  const pMinZ = center.z - half.z;
  const pMaxZ = center.z + half.z;
  let hit = false;
  forEachBoxNear(sampler, pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ, (b) => {
    if (hit) return;
    if (
      axisOverlap(pMinX, pMaxX, b[0], b[3]) &&
      axisOverlap(pMinY, pMaxY, b[1], b[4]) &&
      axisOverlap(pMinZ, pMaxZ, b[2], b[5])
    )
      hit = true;
  });
  return hit;
}

/**
 * Highest box top at or below the player's feet whose horizontal extent overlaps the footprint.
 * Used to rest the player on the actual surface (slab top = y+0.5, cube/stair-step = y+1).
 */
function highestSupport(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  feet0: number,
  feetTarget: number,
): number {
  const pMinX = center.x - half.x;
  const pMaxX = center.x + half.x;
  const pMinZ = center.z - half.z;
  const pMaxZ = center.z + half.z;
  const yLo = Math.floor(feetTarget - EPS) - 1;
  const yHi = Math.floor(feet0 + EPS);
  let best = -Infinity;
  for (let y = yLo; y <= yHi; y++)
    for (let z = Math.floor(pMinZ); z <= Math.floor(pMaxZ); z++)
      for (let x = Math.floor(pMinX); x <= Math.floor(pMaxX); x++)
        for (const b of sampler.collisionBoxes(x, y, z)) {
          if (axisOverlap(pMinX, pMaxX, b[0], b[3]) && axisOverlap(pMinZ, pMaxZ, b[2], b[5])) {
            const top = b[4];
            if (top <= feet0 + EPS && top > best) best = top;
          }
        }
  return best;
}

/** Moves one axis by `d`, snapping the leading face to the nearest blocking AABB face. */
function sweepAxis(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  axis: 'x' | 'y' | 'z',
  d: number,
): { value: number; hit: boolean } {
  if (d === 0) return { value: center[axis], hit: false };
  const moved: Vec3 = { ...center, [axis]: center[axis] + d };
  const pMinX = moved.x - half.x;
  const pMaxX = moved.x + half.x;
  const pMinY = moved.y - half.y;
  const pMaxY = moved.y + half.y;
  const pMinZ = moved.z - half.z;
  const pMaxZ = moved.z + half.z;
  const loIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const hiIdx = loIdx + 3;
  const startLo = center[axis] - half[axis];
  const startHi = center[axis] + half[axis];
  let hit = false;
  let limit = d > 0 ? Infinity : -Infinity;
  forEachBoxNear(sampler, pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ, (b) => {
    if (
      axisOverlap(pMinX, pMaxX, b[0], b[3]) &&
      axisOverlap(pMinY, pMaxY, b[1], b[4]) &&
      axisOverlap(pMinZ, pMaxZ, b[2], b[5]) &&
      // A box already overlapping the start interval on this axis was penetrated BEFORE the
      // move (the other axes don't change during a single-axis sweep, so it overlapped the
      // whole start AABB). Snapping to its near face would teleport the player backward —
      // the embedded-start tunneling bug — so it never blocks; it can only be exited.
      !axisOverlap(startLo, startHi, b[loIdx], b[hiIdx])
    ) {
      hit = true;
      limit = d > 0 ? Math.min(limit, b[loIdx]) : Math.max(limit, b[hiIdx]);
    }
  });
  if (!hit) return { value: moved[axis], hit: false };
  const h = half[axis];
  const value = d > 0 ? limit - h - EPS : limit + h + EPS;
  return { value, hit: true };
}

/** Attempts a 1-voxel step-up for a blocked horizontal move; null if still blocked when raised. */
function tryStepUp(
  sampler: SoliditySampler,
  pos: Vec3,
  half: Vec3,
  axis: 'x' | 'z',
  d: number,
): { x: number; y: number; z: number } | null {
  const raised: Vec3 = { ...pos, y: pos.y + 1 + EPS };
  if (overlapsSolid(sampler, raised, half)) return null;
  const result = sweepAxis(sampler, raised, half, axis, d);
  if (result.hit) return null;
  return { ...raised, [axis]: result.value };
}

/**
 * Resolves an AABB move against the sampler. Substeps the delta to stay under one voxel/step,
 * resolving X, Z, then Y. Step-up: a blocked horizontal move with no vertical delta (or when
 * grounded with a small negative delta from gravity) retries raised by 1 voxel. `grounded` is
 * true when a downward move was blocked.
 *
 * Embedded starts (the AABB already overlaps solid — a teleport into geometry, or a block
 * placed on the player) are safe: boxes overlapped before a sweep never block it, so the
 * result always lies between the start and the target on every axis. The player holds (and
 * reads grounded) rather than sinking, and a 1-block-deep embed self-heals via step-up.
 *
 * @param grounded - Pass `true` when the player was on the ground last frame. This broadens the
 *   step-up gate to also fire when `sd.y < 0` (gravity contribution), allowing 1-block ledge
 *   climbing and stair walk-up during a normal grounded walk. Defaults to `false` (back-compat).
 */
export function resolveCollision(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  delta: Vec3,
  grounded = false,
): CollisionResult {
  const pos: Vec3 = { ...center };
  let isGrounded = false;

  const maxComp = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = Math.max(1, Math.ceil(maxComp / STEP));
  const sd: Vec3 = { x: delta.x / steps, y: delta.y / steps, z: delta.z / steps };

  for (let s = 0; s < steps; s++) {
    const substepStartY = pos.y;

    // Step-up fires when the horizontal move is blocked AND either:
    //   (a) sd.y === 0 — no vertical component at all, OR
    //   (b) grounded && sd.y < 0 — the caller says the player was grounded last frame;
    //       the small negative sd.y is just gravity, not a meaningful fall/jump.
    const canStepUp = sd.y === 0 || (grounded && sd.y < 0);

    // --- X axis ---
    const xResult = sweepAxis(sampler, pos, half, 'x', sd.x);
    let steppedUp = false;
    if (xResult.hit && canStepUp && sd.x !== 0) {
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
    if (zResult.hit && canStepUp && sd.z !== 0) {
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

    if (pos.y - substepStartY > 1.0) pos.y = substepStartY + 1.0 + EPS;

    // --- Y axis ---
    if (sd.y < 0) {
      const feet0 = pos.y - half.y;
      const movedDown: Vec3 = { ...pos, y: pos.y + sd.y };
      if (overlapsSolid(sampler, movedDown, half)) {
        const support = highestSupport(sampler, pos, half, feet0, feet0 + sd.y);
        if (support === -Infinity) {
          // No landable top in range means every blocking box was already overlapped before
          // the move (an embedded start — e.g. a teleport into geometry). Hold position and
          // report grounded instead of sinking through: step-up can then rescue the player,
          // and gravity can't accumulate into a tunnel-through.
          isGrounded = true;
        } else {
          pos.y = support + half.y;
          isGrounded = true;
        }
      } else {
        pos.y += sd.y;
      }
    } else {
      const y = sweepAxis(sampler, pos, half, 'y', sd.y);
      pos.y = y.value;
    }
  }

  return { center: pos, grounded: isGrounded };
}
