import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from './constants';
import type { LocalCoord } from './types';

if (CHUNK_SIZE_X !== CHUNK_SIZE_Z)
  throw new Error('worldToChunkCoord/worldToLocal assume CHUNK_SIZE_X === CHUNK_SIZE_Z');

/**
 * THE voxel-index convention. Flat layout, x fastest then z then y:
 *   index = x + CHUNK_SIZE_X * (z + CHUNK_SIZE_Z * y)
 * Used everywhere; never duplicate this formula elsewhere.
 */
export function voxelIndex(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE_X * (z + CHUNK_SIZE_Z * y);
}

export function indexToLocal(index: number): LocalCoord {
  const x = index % CHUNK_SIZE_X;
  const rest = (index - x) / CHUNK_SIZE_X;
  const z = rest % CHUNK_SIZE_Z;
  const y = (rest - z) / CHUNK_SIZE_Z;
  return { x, y, z };
}

export function inChunkBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE_X && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < CHUNK_SIZE_Z;
}

/** Floor-divide a world coordinate to its chunk coordinate (handles negatives). Assumes CHUNK_SIZE_X === CHUNK_SIZE_Z. */
export function worldToChunkCoord(world: number): number {
  return Math.floor(world / CHUNK_SIZE_X);
}

/** Map a world coordinate to its non-negative local coordinate (handles negatives). Assumes CHUNK_SIZE_X === CHUNK_SIZE_Z. */
export function worldToLocal(world: number): number {
  return ((world % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
}

/** Stable string key for a chunk column. */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const comma = key.indexOf(',');
  return { cx: Number(key.slice(0, comma)), cz: Number(key.slice(comma + 1)) };
}
