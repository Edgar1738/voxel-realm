import type { BlockId } from './types';
import { rotateStateY, mirrorStateAcross } from '../world/VoxelState';

/** A non-air voxel offset from the prefab's min corner: [dx, dy, dz, id] or [dx, dy, dz, id, state]. */
export type PrefabVoxel =
  | [number, number, number, BlockId]
  | [number, number, number, BlockId, number];

const MAX_PREFAB_BLOCKS = 200000;

/** The orientation state of a prefab voxel, or undefined for a plain 4-tuple. */
function voxelStateOf(b: PrefabVoxel): number | undefined {
  return b.length === 5 ? b[4] : undefined;
}

/** Build a prefab voxel, including the state element only when defined. */
function prefabVoxel(dx: number, dy: number, dz: number, id: BlockId, state?: number): PrefabVoxel {
  return state === undefined ? [dx, dy, dz, id] : [dx, dy, dz, id, state];
}

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
    if (!Array.isArray(b) || (b.length !== 4 && b.length !== 5))
      return 'each block must be [dx,dy,dz,id] or [dx,dy,dz,id,state]';
    const [dx, dy, dz, id] = b as number[];
    if (![dx, dy, dz, id].every(Number.isInteger)) return 'block fields must be integers';
    if (dx < 0 || dy < 0 || dz < 0 || dx >= sx || dy >= sy || dz >= sz)
      return `block offset out of dims range`;
    if (id < 0 || id > 255) return `block id ${id} out of 0..255`;
    if (b.length === 5) {
      const state = (b as number[])[4];
      if (!Number.isInteger(state) || state < 0 || state > 255)
        return `block state ${state} out of 0..255`;
    }
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
  const blocks: PrefabVoxel[] = p.blocks.map((b) =>
    prefabVoxel(b[0] - minX, b[1] - minY, b[2] - minZ, b[3], voxelStateOf(b)),
  );
  return {
    dims: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
    blocks,
  };
}

/** Transform a voxel's state (facing rotation/flip), leaving stateless 4-tuples untouched. */
function mapState(b: PrefabVoxel, f: (state: number) => number): number | undefined {
  const state = voxelStateOf(b);
  return state === undefined ? undefined : f(state);
}

/**
 * Rotate about the Y axis in 90-degree steps (positive = clockwise viewed from +Y).
 * Oriented voxels (stairs/gates) rotate their facing bits along with their position.
 */
export function rotateY(p: Prefab, quarterTurns: number): Prefab {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return normalize(p);
  const [sx, , sz] = p.dims;
  let blocks: PrefabVoxel[] = p.blocks;
  let dimX = sx,
    dimZ = sz;
  for (let t = 0; t < turns; t++) {
    const maxX = dimX - 1;
    blocks = blocks.map((b) =>
      prefabVoxel(
        b[2],
        b[1],
        maxX - b[0],
        b[3],
        mapState(b, (s) => rotateStateY(s, 1)),
      ),
    );
    [dimX, dimZ] = [dimZ, dimX];
  }
  return normalize({ dims: [dimX, p.dims[1], dimZ], blocks });
}

/**
 * Reflect across the given horizontal axis. Oriented voxels flip their facing with the
 * reflection (x flips E↔W, z flips N↔S).
 */
export function mirror(p: Prefab, axis: 'x' | 'z'): Prefab {
  const [sx, , sz] = p.dims;
  const blocks: PrefabVoxel[] = p.blocks.map((b) =>
    axis === 'x'
      ? prefabVoxel(
          sx - 1 - b[0],
          b[1],
          b[2],
          b[3],
          mapState(b, (s) => mirrorStateAcross(s, 'x')),
        )
      : prefabVoxel(
          b[0],
          b[1],
          sz - 1 - b[2],
          b[3],
          mapState(b, (s) => mirrorStateAcross(s, 'z')),
        ),
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
  const MAX_REPEAT = 200000;
  if (nx * ny * nz * p.blocks.length > MAX_REPEAT)
    throw new Error(`repeat too large (>${MAX_REPEAT})`);
  const blocks: PrefabVoxel[] = [];
  for (let iz = 0; iz < nz; iz++)
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++)
        for (const b of p.blocks)
          blocks.push(
            prefabVoxel(
              b[0] + ix * stride[0],
              b[1] + iy * stride[1],
              b[2] + iz * stride[2],
              b[3],
              voxelStateOf(b),
            ),
          );
  return normalize({ dims: p.dims, blocks });
}
