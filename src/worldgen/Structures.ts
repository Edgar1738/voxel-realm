import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { mulberry32 } from '../core/math';
import { AIR } from '../blocks/blocks';
import type { ChunkData } from '../world/ChunkData';
import type { Overlay } from './Generator';
import type { WorldSeed } from '../core/types';
import type { Prefab } from '../core/Prefab';

/**
 * A portable, position-independent prefab: per-voxel [dx, dy, dz, id] offsets from the min corner
 * (non-air only). Identical shape to a dev-studio Blueprint, so a structure you `__vr.copy` and
 * save can be scattered by the generator.
 */
export type Structure = Prefab;

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
  /** If set, lay a surface path of this block connecting a cluster's members (a village street). */
  streetBlock?: BlockId;
  /** Skip cells whose center surface is below this height (e.g. keep ruins off ravine floors). */
  minSurfaceY?: number;
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
 * `clusterCount` structures clustered around a jittered village center (a hamlet).
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
    (Math.imul(cellX, 73856093) ^
      Math.imul(cellZ, 19349663) ^
      Math.imul(seed, 83492791) ^
      Math.imul(salt, 2654435761)) >>>
      0,
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
  if (opts.minSurfaceY !== undefined && surfaceAt(seed, centerX, centerZ) < opts.minSurfaceY) {
    return [];
  }
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

/** Integer points along a 2D line (Bresenham), inclusive of both ends. */
function linePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  let x = x0;
  let z = z0;
  for (;;) {
    points.push([x, z]);
    if (x === x1 && z === z1) break;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      z += sz;
    }
  }
  return points;
}

/** Surface-snapped path voxels connecting consecutive cluster members (a village street). */
export function streetVoxels(
  placements: Placement[],
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number,
  seed: WorldSeed,
): Array<[number, number, number]> {
  const center = (p: Placement): [number, number] => [
    p.ox + Math.floor(p.structure.dims[0] / 2),
    p.oz + Math.floor(p.structure.dims[2] / 2),
  ];
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 1 < placements.length; i++) {
    const [ax, az] = center(placements[i]);
    const [bx, bz] = center(placements[i + 1]);
    for (const [x, z] of linePoints(ax, az, bx, bz))
      out.push([x, Math.round(surfaceAt(seed, x, z)), z]);
  }
  return out;
}

function setLocal(
  chunk: ChunkData,
  baseX: number,
  baseZ: number,
  wx: number,
  wy: number,
  wz: number,
  id: BlockId,
): void {
  if (wy < 0 || wy >= WORLD_HEIGHT) return;
  const lx = wx - baseX;
  const lz = wz - baseZ;
  if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) return;
  chunk.set(lx, wy, lz, id);
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
    for (let dy = 0; dy < sy; dy++)
      for (let dz = 0; dz < sz; dz++)
        for (let dx = 0; dx < sx; dx++)
          setLocal(chunk, baseX, baseZ, p.ox + dx, p.oy + dy, p.oz + dz, AIR);
  }
  for (const [dx, dy, dz, id] of p.structure.blocks) {
    if (id === AIR) continue;
    setLocal(chunk, baseX, baseZ, p.ox + dx, p.oy + dy, p.oz + dz, id);
  }
}

/**
 * An Overlay that scatters prefab structures (optionally clustered into hamlets with streets) across
 * the world, snapped to the terrain surface. Each chunk independently resolves the candidates whose
 * cell overlaps it and stamps only the voxels inside the chunk, so a settlement straddling chunk
 * borders stays seamless.
 */
export function scatterStructures(structures: Structure[], opts: ScatterOptions): Overlay {
  const { cellSize, surfaceAt, clearFootprint = false, streetBlock } = opts;
  return (chunk, cx, cz, seed) => {
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;
    // a cell's content stays within [cell*cellSize, cell*cellSize + cellSize-1], so scan every cell
    // whose span overlaps this chunk.
    const minCellX = Math.floor((baseX - cellSize + 1) / cellSize);
    const maxCellX = Math.floor((baseX + CHUNK_SIZE_X - 1) / cellSize);
    const minCellZ = Math.floor((baseZ - cellSize + 1) / cellSize);
    const maxCellZ = Math.floor((baseZ + CHUNK_SIZE_Z - 1) / cellSize);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const placements = placementsAt(structures, opts, seed, cellX, cellZ);
        if (placements.length === 0) continue;
        if (streetBlock !== undefined && placements.length > 1) {
          for (const [wx, wy, wz] of streetVoxels(placements, surfaceAt, seed)) {
            setLocal(chunk, baseX, baseZ, wx, wy, wz, streetBlock);
          }
        }
        for (const p of placements) stampPlacement(chunk, baseX, baseZ, p, clearFootprint);
      }
    }
  };
}
