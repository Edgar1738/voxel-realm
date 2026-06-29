import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';
import type { ChunkData } from './ChunkData';

/** Looks up a horizontal neighbor chunk by its offset (each in -1..1). */
export type NeighborLookup = (dcx: number, dcz: number) => ChunkData | undefined;

/**
 * Voxel accessor spanning a chunk and its 8 horizontal neighbors. Coordinates x/z
 * may range one voxel outside the chunk (for border culling + AO). Out-of-vertical
 * range and missing neighbors both read as AIR (the spec's border-meshing rule).
 */
export class VoxelView {
  constructor(
    private readonly center: ChunkData,
    private readonly neighbor: NeighborLookup,
  ) {}

  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;

    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = x - dcx * CHUNK_SIZE_X;
    const lz = z - dcz * CHUNK_SIZE_Z;

    if (dcx === 0 && dcz === 0) return this.center.get(lx, y, lz);

    const nb = this.neighbor(dcx, dcz);
    return nb ? nb.get(lx, y, lz) : AIR;
  }

  /** Orientation state at a local voxel; 0 outside the center chunk or out of range. */
  getState(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    if (dcx !== 0 || dcz !== 0) return 0;
    return this.center.getState(x, y, z);
  }

  /** Baked skylight at a (possibly neighbor/out-of-range) voxel. Open sky above world / at
   * unloaded borders reads 15 so surfaces never darken at a seam; below the world reads 0. */
  skyLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return 15;
    if (y < 0) return 0;
    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = x - dcx * CHUNK_SIZE_X;
    const lz = z - dcz * CHUNK_SIZE_Z;
    if (dcx === 0 && dcz === 0) return this.center.getSkyLight(lx, y, lz);
    const nb = this.neighbor(dcx, dcz);
    return nb ? nb.getSkyLight(lx, y, lz) : 15;
  }

  /** Baked block light at a (possibly neighbor/out-of-range) voxel; 0 outside the world or at
   * unloaded borders. */
  blockLight(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = x - dcx * CHUNK_SIZE_X;
    const lz = z - dcz * CHUNK_SIZE_Z;
    if (dcx === 0 && dcz === 0) return this.center.getBlockLight(lx, y, lz);
    const nb = this.neighbor(dcx, dcz);
    return nb ? nb.getBlockLight(lx, y, lz) : 0;
  }
}
