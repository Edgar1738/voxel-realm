import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { voxelIndex, inChunkBounds } from '../core/coords';
import { AIR } from '../blocks/blocks';
import { allocChunkArrays, chunkArraysOver } from './chunkBuffers';
import type { BlockId } from '../core/types';

/** Flat voxel storage for one chunk column (16 x WORLD_HEIGHT x 16). */
export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  /**
   * The single buffer backing all five arrays below (P6). A SharedArrayBuffer when shared
   * chunk buffers are enabled (worker meshing reads it zero-copy), else a plain ArrayBuffer.
   */
  readonly buffer: ArrayBufferLike;
  readonly data: Uint8Array;
  /** Baked per-voxel light (0..15), filled by the lighting pass before meshing. */
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  /** Per-voxel orientation state (0 = unoriented). See VoxelState. */
  readonly state: Uint8Array;
  /** Per-column biome ordinal (0 = Plains). Regenerated, NOT serialized. */
  readonly biomeData: Uint8Array;
  /**
   * Whether this chunk contains any shaped (non-cube) voxel — slab/stair/fence/wall/gate/cross.
   * Set by ChunkManager after generation/edits (P3) so meshing can skip the shaped pass for
   * the common all-cube chunk. Monotonic: only ever set true (a stale true just costs one scan).
   */
  hasShaped = false;
  /**
   * Highest y that holds a non-AIR voxel, or -1 for an all-air chunk. Maintained in set():
   * O(1) on placement (raise), and on removal it stays put unless the topmost slice is emptied,
   * in which case it rescans downward from that slice to find the new top. Keeping this tight
   * matters because it caps BOTH meshing height (never sweep empty air) and the lighting
   * recompute — so an aerial edit that is later removed must not leave the cap stuck high.
   */
  maxSolidY = -1;

  constructor(cx: number, cz: number, data?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    const { buffer, arrays } = allocChunkArrays();
    this.buffer = buffer;
    this.data = arrays.data; // zero-initialized = AIR
    this.skyLight = arrays.skyLight;
    this.blockLight = arrays.blockLight;
    this.state = arrays.state;
    this.biomeData = arrays.biomeData;
    if (data) this.data.set(data);
  }

  /**
   * Reconstructs a ChunkData as VIEWS over an existing chunk buffer (no copy) — how a mesh
   * worker sees a main-thread chunk through shared memory (P6).
   */
  static overBuffer(
    cx: number,
    cz: number,
    buffer: ArrayBufferLike,
    meta: { hasShaped: boolean; maxSolidY: number },
  ): ChunkData {
    const chunk: ChunkData = Object.create(ChunkData.prototype) as ChunkData;
    const arrays = chunkArraysOver(buffer);
    Object.assign(chunk, {
      cx,
      cz,
      buffer,
      data: arrays.data,
      skyLight: arrays.skyLight,
      blockLight: arrays.blockLight,
      state: arrays.state,
      biomeData: arrays.biomeData,
      hasShaped: meta.hasShaped,
      maxSolidY: meta.maxSolidY,
    });
    return chunk;
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
    if (id !== AIR) {
      if (y > this.maxSolidY) this.maxSolidY = y;
    } else if (y === this.maxSolidY) {
      // Cleared a voxel on the current top slice — it may now be empty. Rescan from here
      // down (cheap in the common case; the emptied slice is usually still occupied elsewhere).
      this.recomputeMaxSolidY(y);
    }
  }

  /**
   * Recomputes the exact maxSolidY by scanning voxels top-down from `fromY` (default: the world
   * ceiling). Used for bulk writes that bypass set(), and by set() when the top slice is cleared.
   */
  recomputeMaxSolidY(fromY: number = WORLD_HEIGHT - 1): void {
    for (let y = fromY; y >= 0; y--) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          if (this.data[voxelIndex(x, y, z)] !== AIR) {
            this.maxSolidY = y;
            return;
          }
        }
      }
    }
    this.maxSolidY = -1;
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

  /** Biome ordinal for a column; 0 (Plains) out of bounds. */
  getBiome(x: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_X) return 0;
    return this.biomeData[x + CHUNK_SIZE_X * z];
  }

  setBiome(x: number, z: number, biome: number): void {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_X) {
      throw new RangeError(`ChunkData.setBiome out of bounds: (${x}, ${z})`);
    }
    this.biomeData[x + CHUNK_SIZE_X * z] = biome & 0xff;
  }
}
