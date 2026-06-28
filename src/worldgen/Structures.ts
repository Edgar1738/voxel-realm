import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { mulberry32 } from '../core/math';
import { AIR } from '../blocks/blocks';
import type { Overlay } from './Generator';
import type { BlockId, WorldSeed } from '../core/types';

/**
 * A portable, position-independent prefab: per-voxel [dx, dy, dz, id] offsets from the min corner
 * (non-air only). Identical shape to a dev-studio Blueprint, so a structure you `__vr.copy` and
 * save can be scattered by the generator.
 */
export interface Structure {
  dims: [number, number, number];
  blocks: Array<[number, number, number, BlockId]>;
}

export interface ScatterOptions {
  /** One candidate structure per `cellSize` x `cellSize` world region. */
  cellSize: number;
  /** Deterministic ground height for a world column (same fn the generator uses → no drift). */
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number;
  /** Chance in [0,1] that a cell spawns a structure. Default 0.5. */
  density?: number;
  /** Keeps independent scatters (e.g. houses vs. ruins) from aligning. Default 0. */
  salt?: number;
}

/** A resolved structure placement: which prefab, and its min-corner world position. */
export interface Placement {
  structure: Structure;
  ox: number;
  oy: number;
  oz: number;
}

/**
 * Deterministic placement for a single grid cell, independent of which chunk asks — this is what
 * makes cross-chunk stamping consistent. Returns null when the cell rolls empty.
 */
export function placementAt(
  structures: Structure[],
  opts: ScatterOptions,
  seed: WorldSeed,
  cellX: number,
  cellZ: number,
): Placement | null {
  const { cellSize, surfaceAt, density = 0.5, salt = 0 } = opts;
  if (structures.length === 0) return null;
  const rng = mulberry32(
    ((cellX * 73856093) ^ (cellZ * 19349663) ^ (seed * 83492791) ^ (salt * 2654435761)) >>> 0,
  );
  if (rng() > density) return null;
  const structure =
    structures[Math.min(structures.length - 1, Math.floor(rng() * structures.length))];
  const spanX = Math.max(1, cellSize - structure.dims[0]);
  const spanZ = Math.max(1, cellSize - structure.dims[2]);
  const ox = cellX * cellSize + Math.floor(rng() * spanX);
  const oz = cellZ * cellSize + Math.floor(rng() * spanZ);
  const oy = Math.round(surfaceAt(seed, ox, oz));
  return { structure, ox, oy, oz };
}

/**
 * An Overlay that scatters prefab structures across the world, snapped to the terrain surface.
 * Each chunk independently resolves the candidates whose footprint could reach it and stamps only
 * the voxels that fall inside the chunk, so structures straddling chunk borders stay seamless.
 */
export function scatterStructures(structures: Structure[], opts: ScatterOptions): Overlay {
  const { cellSize } = opts;
  const reachX = structures.reduce((m, s) => Math.max(m, s.dims[0]), 1);
  const reachZ = structures.reduce((m, s) => Math.max(m, s.dims[2]), 1);
  return (chunk, cx, cz, seed) => {
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;
    const minCellX = Math.floor((baseX - reachX) / cellSize);
    const maxCellX = Math.floor((baseX + CHUNK_SIZE_X - 1) / cellSize);
    const minCellZ = Math.floor((baseZ - reachZ) / cellSize);
    const maxCellZ = Math.floor((baseZ + CHUNK_SIZE_Z - 1) / cellSize);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const p = placementAt(structures, opts, seed, cellX, cellZ);
        if (!p) continue;
        for (const [dx, dy, dz, id] of p.structure.blocks) {
          if (id === AIR) continue;
          const wy = p.oy + dy;
          if (wy < 0 || wy >= WORLD_HEIGHT) continue;
          const lx = p.ox + dx - baseX;
          const lz = p.oz + dz - baseZ;
          if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue;
          chunk.set(lx, wy, lz, id);
        }
      }
    }
  };
}
