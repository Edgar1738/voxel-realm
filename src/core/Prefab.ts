import type { BlockId } from './types';

/** A non-air voxel offset from the prefab's min corner: [dx, dy, dz, id]. */
export type PrefabVoxel = [number, number, number, BlockId];

const MAX_PREFAB_BLOCKS = 200000;

/** Structural validation for an untrusted Prefab. Returns null if valid, else a reason. */
export function validatePrefab(p: unknown): string | null {
  if (typeof p !== 'object' || p === null) return 'prefab must be an object';
  const o = p as { dims?: unknown; blocks?: unknown };
  if (
    !Array.isArray(o.dims) ||
    o.dims.length !== 3 ||
    !o.dims.every((d) => Number.isInteger(d) && (d as number) > 0)
  ) {
    return 'dims must be three positive integers';
  }
  const [sx, sy, sz] = o.dims as number[];
  if (!Array.isArray(o.blocks)) return 'blocks must be an array';
  if (o.blocks.length > MAX_PREFAB_BLOCKS) return `too many blocks (>${MAX_PREFAB_BLOCKS})`;
  for (const b of o.blocks) {
    if (!Array.isArray(b) || b.length !== 4) return 'each block must be [dx,dy,dz,id]';
    const [dx, dy, dz, id] = b as number[];
    if (![dx, dy, dz, id].every(Number.isInteger)) return 'block fields must be integers';
    if (dx < 0 || dy < 0 || dz < 0 || dx >= sx || dy >= sy || dz >= sz)
      return `block offset out of dims range`;
    if (id < 0 || id > 255) return `block id ${id} out of 0..255`;
  }
  return null;
}

/** Portable, position-independent block group. Identical shape to a dev Blueprint. */
export interface Prefab {
  dims: [number, number, number];
  blocks: PrefabVoxel[];
}

/** Re-anchor so the min corner is the origin and dims tightly bound the blocks. */
export function normalize(p: Prefab): Prefab {
  if (p.blocks.length === 0) return { dims: [0, 0, 0], blocks: [] };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of p.blocks) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const blocks: PrefabVoxel[] = p.blocks.map(([x, y, z, id]) => [x - minX, y - minY, z - minZ, id]);
  return {
    dims: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
    blocks,
  };
}

/** Rotate about the Y axis in 90-degree steps (positive = clockwise viewed from +Y). */
export function rotateY(p: Prefab, quarterTurns: number): Prefab {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return normalize(p);
  const [sx, , sz] = p.dims;
  let blocks: PrefabVoxel[] = p.blocks;
  let dimX = sx,
    dimZ = sz;
  for (let t = 0; t < turns; t++) {
    const maxX = dimX - 1;
    blocks = blocks.map(([x, y, z, id]) => [z, y, maxX - x, id]);
    [dimX, dimZ] = [dimZ, dimX];
  }
  return normalize({ dims: [dimX, p.dims[1], dimZ], blocks });
}

/** Reflect across the given horizontal axis. */
export function mirror(p: Prefab, axis: 'x' | 'z'): Prefab {
  const [sx, , sz] = p.dims;
  const blocks: PrefabVoxel[] = p.blocks.map(([x, y, z, id]) =>
    axis === 'x' ? [sx - 1 - x, y, z, id] : [x, y, sz - 1 - z, id],
  );
  return normalize({ dims: p.dims, blocks });
}

/** Tile the prefab into an nx*ny*nz grid, each copy offset by `stride`. */
export function repeat(
  p: Prefab,
  nx: number,
  ny: number,
  nz: number,
  stride: [number, number, number],
): Prefab {
  const blocks: PrefabVoxel[] = [];
  for (let iz = 0; iz < nz; iz++)
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++)
        for (const [x, y, z, id] of p.blocks)
          blocks.push([x + ix * stride[0], y + iy * stride[1], z + iz * stride[2], id]);
  return normalize({ dims: p.dims, blocks });
}
