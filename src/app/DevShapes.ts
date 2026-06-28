import type { BlockId } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';

/**
 * Pure voxel-geometry generators — no renderer, no edit service, no side effects.
 * Compute a list of SetVoxel positions from parameters and return them.
 * Imported by DevControls (dev-only) and directly testable in isolation.
 */

/**
 * Bresenham-style 3-D line: returns voxels between (x1,y1,z1) and (x2,y2,z2) inclusive,
 * stepping in the dominant axis. Deduplicates coincident samples.
 */
export function lineVoxels(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  id: BlockId,
): SetVoxel[] {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
  const out: SetVoxel[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    const z = Math.round(z1 + (z2 - z1) * t);
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, z, id });
  }
  return out;
}

/**
 * Solid upright cylinder centred at (cx,cy,cz) with the given radius and height (layers).
 * Fills all voxels where dx²+dz² ≤ radius².
 */
export function cylinderVoxels(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  id: BlockId,
): SetVoxel[] {
  const out: SetVoxel[] = [];
  const r2 = radius * radius;
  for (let h = 0; h < height; h++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dz * dz <= r2) out.push({ x: cx + dx, y: cy + h, z: cz + dz, id });
  return out;
}

/**
 * Square pyramid centred at (cx,cy,cz): baseRadius gives the half-width at y=cy; each layer
 * above reduces the half-width by 1 until the apex at y = cy + baseRadius.
 */
export function pyramidVoxels(
  cx: number,
  cy: number,
  cz: number,
  baseRadius: number,
  id: BlockId,
): SetVoxel[] {
  const out: SetVoxel[] = [];
  for (let level = 0; level <= baseRadius; level++) {
    const r = baseRadius - level;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) out.push({ x: cx + dx, y: cy + level, z: cz + dz, id });
  }
  return out;
}

/**
 * Hollow axis-aligned box (shell only — faces, not interior) between two corners.
 * Corner order is arbitrary; the function normalises min/max internally.
 */
export function hollowBoxVoxels(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  id: BlockId,
): SetVoxel[] {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
  const out: SetVoxel[] = [];
  for (let y = ay; y <= by; y++)
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++)
        if (x === ax || x === bx || y === ay || y === by || z === az || z === bz)
          out.push({ x, y, z, id });
  return out;
}
