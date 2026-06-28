import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { mulberry32 } from '../core/math';
import { AIR } from '../blocks/blocks';
import type { ChunkData } from '../world/ChunkData';
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
  /** One spawning candidate per `cellSize` x `cellSize` world region. */
  cellSize: number;
  /** Deterministic ground height for a world column (same fn the generator uses → no drift). */
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number;
  /** Chance in [0,1] that a cell spawns anything. Default 0.5. */
  density?: number;
  /** Keeps independent scatters (e.g. houses vs. ruins) from aligning. Default 0. */
  salt?: number;
  /** Structures placed per spawning cell — >1 yields little hamlets. Default 1. */
  clusterCount?: number;
  /** Max offset (blocks) of cluster members from the village center. Default cellSize/6. */
  clusterRadius?: number;
  /** Clear each structure's bounding box of intersecting terrain/foliage before stamping. */
  clearFootprint?: boolean;
}

/** A resolved structure placement: which prefab, and its min-corner world position. */
export interface Placement {
  structure: Structure;
  ox: number;
  oy: number;
  oz: number;
}

/**
 * Deterministic placements for a single grid cell, independent of which chunk asks — this is what
 * makes cross-chunk stamping consistent. Returns [] when the cell rolls empty; otherwise up to
 * `clusterCount` structures jittered within the cell (a hamlet).
 */
export function placementsAt(
  structures: Structure[],
  opts: ScatterOptions,
  seed: WorldSeed,
  cellX: number,
  cellZ: number,
): Placement[] {
  const { cellSize, surfaceAt, density = 0.5, salt = 0, clusterCount = 1 } = opts;
  if (structures.length === 0) return [];
  const rng = mulberry32(
    ((cellX * 73856093) ^ (cellZ * 19349663) ^ (seed * 83492791) ^ (salt * 2654435761)) >>> 0,
  );
  if (rng() > density) return [];
  const count = Math.max(1, Math.floor(clusterCount));
  const radius = Math.max(0, Math.floor(opts.clusterRadius ?? cellSize / 6));
  const margin = Math.min(radius, Math.floor(cellSize / 2));
  // village center, kept inside the cell with margin so the hamlet doesn't spill across cells
  const centerX =
    cellX * cellSize + margin + Math.floor(rng() * Math.max(1, cellSize - 2 * margin));
  const centerZ =
    cellZ * cellSize + margin + Math.floor(rng() * Math.max(1, cellSize - 2 * margin));
  const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
  const placements: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const structure =
      structures[Math.min(structures.length - 1, Math.floor(rng() * structures.length))];
    const maxX = cellX * cellSize + Math.max(0, cellSize - structure.dims[0]);
    const maxZ = cellZ * cellSize + Math.max(0, cellSize - structure.dims[2]);
    const ox = clamp(centerX + Math.round((rng() * 2 - 1) * radius), cellX * cellSize, maxX);
    const oz = clamp(centerZ + Math.round((rng() * 2 - 1) * radius), cellZ * cellSize, maxZ);
    const oy = Math.round(surfaceAt(seed, ox, oz));
    placements.push({ structure, ox, oy, oz });
  }
  return placements;
}

/** Convenience: the first placement for a cell (or null). Kept for single-structure callers. */
export function placementAt(
  structures: Structure[],
  opts: ScatterOptions,
  seed: WorldSeed,
  cellX: number,
  cellZ: number,
): Placement | null {
  return placementsAt(structures, opts, seed, cellX, cellZ)[0] ?? null;
}

function stampPlacement(
  chunk: ChunkData,
  baseX: number,
  baseZ: number,
  p: Placement,
  clearFootprint: boolean,
): void {
  if (clearFootprint) {
    const [sx, sy, sz] = p.structure.dims;
    for (let dy = 0; dy < sy; dy++) {
      const wy = p.oy + dy;
      if (wy < 0 || wy >= WORLD_HEIGHT) continue;
      for (let dz = 0; dz < sz; dz++) {
        for (let dx = 0; dx < sx; dx++) {
          const lx = p.ox + dx - baseX;
          const lz = p.oz + dz - baseZ;
          if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue;
          chunk.set(lx, wy, lz, AIR);
        }
      }
    }
  }
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

/**
 * An Overlay that scatters prefab structures (optionally in clusters) across the world, snapped to
 * the terrain surface. Each chunk independently resolves the candidates whose footprint could reach
 * it and stamps only the voxels that fall inside the chunk, so structures straddling chunk borders
 * stay seamless.
 */
export function scatterStructures(structures: Structure[], opts: ScatterOptions): Overlay {
  const { cellSize, clearFootprint = false } = opts;
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
        for (const p of placementsAt(structures, opts, seed, cellX, cellZ)) {
          stampPlacement(chunk, baseX, baseZ, p, clearFootprint);
        }
      }
    }
  };
}
