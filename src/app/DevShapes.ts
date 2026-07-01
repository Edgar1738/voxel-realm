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

/**
 * Octagon membership in the XZ plane at radius `r`: chebyshev ≤ r AND manhattan ≤ r + floor(r/2)
 * (the manhattan cap bevels the corners). r=5 → the classic 11-wide octagon with ~5-wide faces.
 */
export function inOctagon(dx: number, dz: number, r: number): boolean {
  return (
    Math.max(Math.abs(dx), Math.abs(dz)) <= r &&
    Math.abs(dx) + Math.abs(dz) <= r + Math.floor(r / 2)
  );
}

/** True when (dx,dz) is on the octagon perimeter (in-octagon with a non-octagon 4-neighbour). */
function octagonEdge(dx: number, dz: number, r: number): boolean {
  return (
    inOctagon(dx, dz, r) &&
    !(
      inOctagon(dx + 1, dz, r) &&
      inOctagon(dx - 1, dz, r) &&
      inOctagon(dx, dz + 1, r) &&
      inOctagon(dx, dz - 1, r)
    )
  );
}

/**
 * Upright octagonal prism centred on (cx,cy,cz): an octagon of the given radius extruded `height`
 * layers upward (y = cy .. cy+height-1). `hollow` keeps only the wall ring (perimeter cells).
 */
export function octagonVoxels(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  id: BlockId,
  opts: { hollow?: boolean } = {},
): SetVoxel[] {
  const hollow = opts.hollow ?? false;
  const out: SetVoxel[] = [];
  for (let h = 0; h < height; h++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (hollow ? !octagonEdge(dx, dz, radius) : !inOctagon(dx, dz, radius)) continue;
        out.push({ x: cx + dx, y: cy + h, z: cz + dz, id });
      }
  return out;
}

/**
 * Single-layer boundary ring at (cx,cy,cz). `shape`: 'octagon' (default), 'circle' (rounded),
 * or 'square' (chebyshev). Handy for rune circles, coping, and decorative bands.
 */
export function ringVoxels(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  id: BlockId,
  opts: { shape?: 'octagon' | 'circle' | 'square' } = {},
): SetVoxel[] {
  const shape = opts.shape ?? 'octagon';
  const out: SetVoxel[] = [];
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      let on: boolean;
      if (shape === 'square') on = Math.max(Math.abs(dx), Math.abs(dz)) === radius;
      else if (shape === 'circle') on = Math.round(Math.hypot(dx, dz)) === radius;
      else on = octagonEdge(dx, dz, radius);
      if (on) out.push({ x: cx + dx, y: cy, z: cz + dz, id });
    }
  return out;
}

/**
 * Tapering cone/spire: a stack of octagon (default) or square disks shrinking from `baseRadius`
 * at (cx,cy,cz) to a single point at y = cy + baseRadius. `solid` fills each layer (default),
 * else emits rings only (a hollow shell). Ideal for wizard-hat roofs and turret caps.
 */
export function coneVoxels(
  cx: number,
  cy: number,
  cz: number,
  baseRadius: number,
  id: BlockId,
  opts: { shape?: 'octagon' | 'square'; solid?: boolean } = {},
): SetVoxel[] {
  const shape = opts.shape ?? 'octagon';
  const solid = opts.solid ?? true;
  const out: SetVoxel[] = [];
  for (let level = 0; level <= baseRadius; level++) {
    const r = baseRadius - level;
    const y = cy + level;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const inside =
          shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dz)) <= r : inOctagon(dx, dz, r);
        if (!inside) continue;
        if (!solid) {
          const edge =
            shape === 'square'
              ? Math.max(Math.abs(dx), Math.abs(dz)) === r
              : octagonEdge(dx, dz, r);
          if (!edge) continue;
        }
        out.push({ x: cx + dx, y, z: cz + dz, id });
      }
  }
  return out;
}

/**
 * Hollow upright cylinder (a 1-thick tube): cells with (r-1)² < dx²+dz² ≤ r², extruded `height`
 * layers upward. The round-tower counterpart to {@link octagonVoxels} with `hollow: true`.
 */
export function hollowCylinderVoxels(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  id: BlockId,
): SetVoxel[] {
  const r2 = radius * radius;
  const ri2 = (radius - 1) * (radius - 1);
  const out: SetVoxel[] = [];
  for (let h = 0; h < height; h++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2 && d2 > ri2) out.push({ x: cx + dx, y: cy + h, z: cz + dz, id });
      }
  return out;
}
