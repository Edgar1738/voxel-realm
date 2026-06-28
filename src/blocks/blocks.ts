import type { BlockId } from '../core/types';

/** Stable, append-only block ids. NEVER reorder or reuse (saves store ids). */
export const AIR: BlockId = 0;
export const GRASS: BlockId = 1;
export const DIRT: BlockId = 2;
export const STONE: BlockId = 3;
export const SAND: BlockId = 4;
export const WOOD: BlockId = 5;
export const LEAVES: BlockId = 6;
export const GLASS: BlockId = 7;
export const WATER: BlockId = 8;
export const SNOW: BlockId = 9;
export const CACTUS: BlockId = 10;
export const PLANKS: BlockId = 11;
export const COBBLESTONE: BlockId = 12;
export const BRICK: BlockId = 13;
export const LANTERN: BlockId = 14;

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
  WoodTop: 4,
  WoodSide: 5,
  Leaves: 6,
  Sand: 7,
  Water: 8,
  Snow: 9,
  Cactus: 10,
  Glass: 11,
  Planks: 12,
  Cobblestone: 13,
  Brick: 14,
  Lantern: 15,
} as const;

export const TEXTURE_LAYER_COUNT = 16;

/** Definition of one block type. `faces` lists the texture layer per Face (0..5). */
export interface BlockDef {
  id: BlockId;
  name: string;
  opaque: boolean;
  /** Forward-looking flag (unused in M1; opaque blocks only). */
  transparent: boolean;
  /** Texture layer per face, indexed by Face; empty for air. */
  faces: number[];
  /** Self-emitted light level (0..15); 0/undefined for non-emitters. Drives the lighting pass. */
  light?: number;
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
  {
    id: WOOD,
    name: 'wood',
    opaque: true,
    transparent: false,
    // PosX, NegX, PosY(top), NegY(bottom), PosZ, NegZ
    faces: [
      TextureLayer.WoodSide,
      TextureLayer.WoodSide,
      TextureLayer.WoodTop,
      TextureLayer.WoodTop,
      TextureLayer.WoodSide,
      TextureLayer.WoodSide,
    ],
  },
  {
    id: LEAVES,
    name: 'leaves',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Leaves),
  },
  { id: SAND, name: 'sand', opaque: true, transparent: false, faces: uniform(TextureLayer.Sand) },
  {
    id: WATER,
    name: 'water',
    opaque: false,
    transparent: true,
    faces: uniform(TextureLayer.Water),
  },
  { id: SNOW, name: 'snow', opaque: true, transparent: false, faces: uniform(TextureLayer.Snow) },
  {
    id: CACTUS,
    name: 'cactus',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Cactus),
  },
  {
    id: GLASS,
    name: 'glass',
    opaque: false,
    transparent: true,
    faces: uniform(TextureLayer.Glass),
  },
  {
    id: PLANKS,
    name: 'planks',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Planks),
  },
  {
    id: COBBLESTONE,
    name: 'cobblestone',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Cobblestone),
  },
  {
    id: BRICK,
    name: 'brick',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Brick),
  },
  {
    id: LANTERN,
    name: 'lantern',
    opaque: true,
    transparent: false,
    light: 14,
    faces: uniform(TextureLayer.Lantern),
  },
];
