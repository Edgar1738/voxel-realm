import type { BlockId } from '../core/types';

/** Bump when WORLD_HEIGHT, the voxel-index convention, block ids, or base worldgen change. */
export const SAVE_VERSION = 1;

export interface WorldMeta {
  seed: number;
  version: number;
}

/** A chunk's edits as stable [voxelIndex, blockId] entries. */
export type ChunkDeltaEntries = ReadonlyArray<[number, BlockId]>;

/** All chunks' edits: chunk key ("cx,cz") -> (voxelIndex -> blockId). */
export type WorldDeltas = Map<string, Map<number, BlockId>>;
