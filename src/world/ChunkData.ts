import { CHUNK_VOLUME } from '../core/constants';
import { voxelIndex, inChunkBounds } from '../core/coords';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** Flat voxel storage for one chunk column (16 x WORLD_HEIGHT x 16). */
export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;

  constructor(cx: number, cz: number, data?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.data = data ?? new Uint8Array(CHUNK_VOLUME); // Uint8Array defaults to 0 = AIR
  }

  /** Reads a voxel; out-of-bounds returns AIR (callers rely on this for border meshing). */
  get(x: number, y: number, z: number): BlockId {
    if (!inChunkBounds(x, y, z)) return AIR;
    return this.data[voxelIndex(x, y, z)];
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    if (!inChunkBounds(x, y, z)) {
      throw new RangeError(`ChunkData.set out of bounds: (${x}, ${y}, ${z})`);
    }
    this.data[voxelIndex(x, y, z)] = id;
  }
}
