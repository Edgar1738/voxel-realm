import type { Vec3 } from '../core/types';
import { lookDirectionFromYawPitch } from '../render/CameraRig';

export { lookDirectionFromYawPitch };

/** A ray to raycast block interactions along: origin at the player's eye, direction from the look. */
export interface InteractionRay {
  origin: Vec3;
  dir: Vec3;
}

/**
 * Interaction ray for break/place/toggle/builder aim. The origin is the player's eye (never the
 * render camera, which may be pulled back in third-person) and the direction is yaw/pitch-derived,
 * so reach and targeting stay anchored to where the player is looking in either camera mode.
 */
export function interactionRay(eye: Vec3, yaw: number, pitch: number): InteractionRay {
  return { origin: eye, dir: lookDirectionFromYawPitch(yaw, pitch) };
}

/**
 * Distance the third-person camera may trail behind the eye before it would clip into geometry.
 * Marches back along `dirBack` (the −look vector) in small steps and stops just short of the first
 * solid voxel, so the camera never ends up inside a wall. Returns `maxDist` when the path is clear.
 */
export function clipCameraDistance(
  isSolid: (x: number, y: number, z: number) => boolean,
  eye: Vec3,
  dirBack: Vec3,
  maxDist: number,
  step = 0.25,
  margin = 0.3,
): number {
  for (let d = step; d <= maxDist; d += step) {
    const x = Math.floor(eye.x + dirBack.x * d);
    const y = Math.floor(eye.y + dirBack.y * d);
    const z = Math.floor(eye.z + dirBack.z * d);
    if (isSolid(x, y, z)) return Math.max(0.4, d - margin);
  }
  return maxDist;
}
