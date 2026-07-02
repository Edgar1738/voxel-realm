import { facingFromYaw, packState } from '../world/VoxelState';

/** The face + entry point of the placement ray, for Minecraft-style half selection. */
export interface PlacementHitInfo {
  normal: { x: number; y: number; z: number };
  point: { x: number; y: number; z: number };
}

/**
 * Which vertical half a placement targets: clicking a top face gives the bottom half, an
 * underside gives the top half, and a side face picks by where the ray crossed the face
 * (upper half of the face → top). Returns 0 = bottom, 1 = top.
 */
export function halfFromHit(hit: PlacementHitInfo): number {
  if (hit.normal.y > 0) return 0;
  if (hit.normal.y < 0) return 1;
  return hit.point.y - Math.floor(hit.point.y) >= 0.5 ? 1 : 0;
}

/**
 * Orientation state for a block being placed: stairs face the player's yaw and take the
 * hit-derived half (upside-down stairs from undersides/upper side faces), slabs take only
 * the half (top slabs), gates face the yaw. Every other shape is stateless (0).
 */
export function placementState(shape: string, yaw: number, hit?: PlacementHitInfo): number {
  const half = hit ? halfFromHit(hit) : 0;
  if (shape === 'stair') return packState(facingFromYaw(yaw), half);
  if (shape === 'gate') return packState(facingFromYaw(yaw), 0);
  if (shape === 'slab') return packState(0, half);
  return 0;
}
