import type { BlockId } from '../core/types';

/** Stable, append-only block ids. NEVER reorder or reuse (saves store ids). */
export const AIR: BlockId = 0;
export const GRASS: BlockId = 1;
export const DIRT: BlockId = 2;
export const STONE: BlockId = 3;

/** Cube face directions, indexed 0..5 and used by the mesher. */
export enum Face {
  PosX = 0,
  NegX = 1,
  PosY = 2,
  NegY = 3,
  PosZ = 4,
  NegZ = 5,
}

/** Texture layer indices into the DataArrayTexture (one layer per face texture). */
export const TextureLayer = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
} as const;

export const TEXTURE_LAYER_COUNT = 4;

/** Definition of one block type. `faces` lists the texture layer per Face (0..5). */
export interface BlockDef {
  id: BlockId;
  name: string;
  opaque: boolean;
  /** Forward-looking flag (unused in M1; opaque blocks only). */
  transparent: boolean;
  /** Texture layer per face, indexed by Face; empty for air. */
  faces: number[];
}

function uniform(layer: number): number[] {
  return [layer, layer, layer, layer, layer, layer];
}

/** The block table. Order here does not affect ids — ids are explicit above. */
export const BLOCK_DEFS: BlockDef[] = [
  { id: AIR, name: 'air', opaque: false, transparent: true, faces: [] },
  {
    id: GRASS,
    name: 'grass',
    opaque: true,
    transparent: false,
    // PosX, NegX, PosY(top), NegY(bottom), PosZ, NegZ
    faces: [
      TextureLayer.GrassSide,
      TextureLayer.GrassSide,
      TextureLayer.GrassTop,
      TextureLayer.Dirt,
      TextureLayer.GrassSide,
      TextureLayer.GrassSide,
    ],
  },
  { id: DIRT, name: 'dirt', opaque: true, transparent: false, faces: uniform(TextureLayer.Dirt) },
  {
    id: STONE,
    name: 'stone',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Stone),
  },
];
