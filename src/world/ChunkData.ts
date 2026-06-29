import { CHUNK_VOLUME } from '../core/constants';
import { voxelIndex, inChunkBounds } from '../core/coords';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** Flat voxel storage for one chunk column (16 x WORLD_HEIGHT x 16). */
export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;
  /** Baked per-voxel light (0..15), filled by the lighting pass before meshing. */
  readonly skyLight = new Uint8Array(CHUNK_VOLUME);
  readonly blockLight = new Uint8Array(CHUNK_VOLUME);
  /** Per-voxel orientation state (0 = unoriented). See VoxelState. */
  readonly state = new Uint8Array(CHUNK_VOLUME);

  constructor(cx: number, cz: number, data?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.data = data ?? new Uint8Array(CHUNK_VOLUME); // Uint8Array defaults to 0 = AIR
  }

  /** Baked skylight at a local voxel (caller ensures in-bounds). */
  getSkyLight(x: number, y: number, z: number): number {
    return this.skyLight[voxelIndex(x, y, z)];
  }

  /** Baked block light at a local voxel (caller ensures in-bounds). */
  getBlockLight(x: number, y: number, z: number): number {
    return this.blockLight[voxelIndex(x, y, z)];
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

  /** Reads a voxel's orientation state; out-of-bounds returns 0. */
  getState(x: number, y: number, z: number): number {
    if (!inChunkBounds(x, y, z)) return 0;
    return this.state[voxelIndex(x, y, z)];
  }

  setState(x: number, y: number, z: number, s: number): void {
    if (!inChunkBounds(x, y, z)) {
      throw new RangeError(`ChunkData.setState out of bounds: (${x}, ${y}, ${z})`);
    }
    this.state[voxelIndex(x, y, z)] = s & 0xff;
  }
}
