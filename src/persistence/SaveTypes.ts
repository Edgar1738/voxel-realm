import type { BlockId } from '../core/types';

/** Bump when WORLD_HEIGHT, the voxel-index convention, block ids, or base worldgen change. */
export const SAVE_VERSION = 1;

export interface WorldMeta {
  seed: number;
  version: number;
}

/** A chunk's edits: voxelIndex -> blockId. */
export type ChunkDeltaRecord = Record<number, BlockId>;

/** All chunks' edits, keyed by chunk key ("cx,cz"). */
export type SerializedDeltas = Record<string, ChunkDeltaRecord>;
