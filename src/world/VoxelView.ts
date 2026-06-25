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
}
