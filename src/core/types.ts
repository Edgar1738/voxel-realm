/** Stable numeric block id (see blocks/blocks.ts). */
export type BlockId = number;

/** World generation seed. */
export type WorldSeed = number;

/** Local voxel coordinate inside a chunk. */
export interface LocalCoord {
  x: number;
  y: number;
  z: number;
}
