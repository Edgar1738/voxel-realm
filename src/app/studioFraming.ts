import type { Vec3 } from '../core/types';

/** Default viewing direction from the box center toward the eye. */
const DEFAULT_DIR: Vec3 = { x: 1, y: 0.8, z: 1 };

/**
 * Compute a camera eye position and look-at target that frames an axis-aligned box.
 * @param min box minimum corner
 * @param max box maximum corner
 * @param fovDegrees vertical field of view in degrees (three.js PerspectiveCamera.fov)
 * @param aspect viewport aspect ratio (width / height)
 * @param dir optional viewing direction from the box center toward the eye (need not be normalized)
 * @param margin optional padding multiplier (default 1.2)
 */
export function frameBox(
  min: Vec3,
  max: Vec3,
  fovDegrees: number,
  aspect: number,
  dir?: Vec3,
  margin?: number,
): { eye: Vec3; target: Vec3 } {
  const pad = margin ?? 1.2;

  const target: Vec3 = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };

  const dx = max.x - min.x;
  const dy = max.y - min.y;
  const dz = max.z - min.z;
  const r = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);

  const vfov = (fovDegrees * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const limiting = Math.min(vfov, hfov);

  const distance = r === 0 ? pad : (r / Math.sin(limiting / 2)) * pad;

  const requested = dir ?? DEFAULT_DIR;
  const requestedLength = Math.sqrt(
    requested.x * requested.x + requested.y * requested.y + requested.z * requested.z,
  );
  // Fall back to the default direction when the requested one has zero length.
  const source = requestedLength === 0 ? DEFAULT_DIR : requested;
  const length = Math.sqrt(source.x * source.x + source.y * source.y + source.z * source.z);
  const normalized: Vec3 = {
    x: source.x / length,
    y: source.y / length,
    z: source.z / length,
  };

  const eye: Vec3 = {
    x: target.x + normalized.x * distance,
    y: target.y + normalized.y * distance,
    z: target.z + normalized.z * distance,
  };

  return { eye, target };
}
