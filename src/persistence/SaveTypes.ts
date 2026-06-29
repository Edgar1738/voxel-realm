/** Bump when WORLD_HEIGHT, the voxel-index convention, block ids, or base worldgen change. */
export const SAVE_VERSION = 1;

export interface WorldMeta {
  seed: number;
  version: number;
  /** Which world preset the saved edits belong to; a change discards them. */
  preset?: string;
}

/** A chunk's edits as stable [voxelIndex, blockId] or [voxelIndex, blockId, state] entries. */
export type ChunkDeltaEntries = ReadonlyArray<[number, number] | [number, number, number]>;

/** All chunks' edits: chunk key ("cx,cz") -> (voxelIndex -> packed voxel). */
export type WorldDeltas = Map<string, Map<number, number>>;

/** Pack a block id (0..255) + state (0..255) into one number for the in-memory delta map. */
export function packVoxel(id: number, state: number): number {
  return (id & 0xff) | ((state & 0xff) << 8);
}
export function voxelId(v: number): number {
  return v & 0xff;
}
export function voxelState(v: number): number {
  return (v >> 8) & 0xff;
}
