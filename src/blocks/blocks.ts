import type { BlockId } from '../core/types';
import type { TextureSpec, FaceTextures } from './textures';
import { expandFaces, specKey } from './textures';

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
export const COAL_ORE: BlockId = 15;
export const IRON_ORE: BlockId = 16;
export const GOLD_ORE: BlockId = 17;
export const CRYSTAL: BlockId = 18;
export const DEEPSLATE: BlockId = 19;
export const EMERALD_ORE: BlockId = 20;
export const GLOWSTONE: BlockId = 21;
export const BOOKSHELF: BlockId = 22;
export const FURNACE: BlockId = 23;
export const MUD: BlockId = 24;
export const TERRACOTTA: BlockId = 25;
export const GRAVEL: BlockId = 26;
export const STONE_SLAB: BlockId = 27;
export const PLANK_SLAB: BlockId = 28;
export const FLOWER: BlockId = 29;
export const TALL_GRASS: BlockId = 30;
export const STAIRS_STONE: BlockId = 31;
export const STAIRS_PLANK: BlockId = 32;
export const STAIRS_COBBLE: BlockId = 33;
export const STAIRS_BRICK: BlockId = 34;
export const OAK_FENCE: BlockId = 35;
export const COBBLE_WALL: BlockId = 36;
export const STONEBRICK_WALL: BlockId = 37;
export const OAK_FENCE_GATE: BlockId = 38;
export const LADDER: BlockId = 39;
export const OAK_DOOR: BlockId = 40;
/** Static glowing lava used by authored volcanic sites; it intentionally does not enter the water flow ticker. */
export const LAVA: BlockId = 41;
/** Pale cool limestone — Cloudspire primary masonry. */
export const LIMESTONE: BlockId = 42;
/** Carved limestone trim for cornices, buttress caps, and façade detail. */
export const CARVED_LIMESTONE: BlockId = 43;
/** Dark slate used for steep Gothic roofs. */
export const SLATE: BlockId = 44;
export const SLATE_SLAB: BlockId = 45;
export const STAIRS_SLATE: BlockId = 46;
/** Cool cyan stained glass for cathedral and spire windows. */
export const CYAN_GLASS: BlockId = 47;
/** Limited gold / luminous trim for spire and altar accents. */
export const GOLD_TRIM: BlockId = 48;
// Material-family expansion. These IDs are intentionally append-only: shipped saves persist the
// byte value directly, so never reorder or reuse them.
export const WARM_STONE: BlockId = 49;
export const BLUE_STONE: BlockId = 50;
export const GRANITE: BlockId = 51;
export const BASALT: BlockId = 52;
export const SANDSTONE: BlockId = 53;
export const AGED_MASONRY: BlockId = 54;
export const WARM_MASONRY: BlockId = 55;
export const MOSSY_COBBLE: BlockId = 56;
export const CLAY_ROOF: BlockId = 57;
export const GREEN_SLATE: BlockId = 58;
export const BROWN_SLATE: BlockId = 59;
export const RED_DIRT: BlockId = 60;
export const DARK_LOAM: BlockId = 61;
export const OCHRE_EARTH: BlockId = 62;
export const SCREE: BlockId = 63;
export const DIRTY_SNOW: BlockId = 64;
export const BLUE_ICE: BlockId = 65;
export const WARM_MASONRY_SLAB: BlockId = 66;
export const STAIRS_WARM_MASONRY: BlockId = 67;
export const WARM_MASONRY_WALL: BlockId = 68;
export const SANDSTONE_SLAB: BlockId = 69;
export const STAIRS_SANDSTONE: BlockId = 70;
export const SANDSTONE_WALL: BlockId = 71;
export const BASALT_SLAB: BlockId = 72;
export const STAIRS_BASALT: BlockId = 73;
export const BASALT_WALL: BlockId = 74;
export const CLAY_ROOF_SLAB: BlockId = 75;
export const STAIRS_CLAY_ROOF: BlockId = 76;

/** Render/collision shape of a block. The block id implies the shape (no save state). */
export type Shape =
  | 'cube'
  | 'slab'
  | 'cross'
  | 'stair'
  | 'fence'
  | 'wall'
  | 'gate'
  | 'ladder'
  | 'door';

/** Biome-tint category for a block's foliage faces. Omitted = untinted. */
export type TintCategory = 'grass' | 'foliage';

/** Cube face directions, indexed 0..5 and used by the mesher. */
export enum Face {
  PosX = 0,
  NegX = 1,
  PosY = 2,
  NegY = 3,
  PosZ = 4,
  NegZ = 5,
}

/** Definition of one block type. `faces` is declarative; AIR omits it. */
export interface BlockDef {
  id: BlockId;
  name: string;
  opaque: boolean;
  transparent: boolean;
  /** Self-emitted light (0..15). */
  light?: number;
  /** Whether the block appears in the creative picker. */
  creative?: boolean;
  /** Render + collision shape. Omitted = 'cube'. */
  shape?: Shape;
  /** Biome-tint category applied to this block's faces (foliage). Omitted = untinted. */
  tint?: TintCategory;
  /** When true, only the top (PosY) face is tinted (e.g. grass — sides are dirt). */
  tintTopOnly?: boolean;
  /** Per-face texture specs (shorthand allowed). Omitted only for AIR. */
  faces?: FaceTextures;
}

const stone = (c: [number, number, number]): TextureSpec => ({ pattern: 'stone', colors: [c] });
const speck = (c: [number, number, number], amp: number): TextureSpec => ({
  pattern: 'speckle',
  colors: [c],
  amp,
});
const ore = (spot: [number, number, number]): TextureSpec => ({ pattern: 'ore', colors: [spot] });

// Shared dirt spec: used for both DIRT's faces and grass's underside so they dedup
// to a single texture layer (the mesher relies on grass-bottom == dirt-top).
const DIRT_TEX: TextureSpec = { pattern: 'dirt', colors: [[134, 96, 62]] };
const SAND_TEX: TextureSpec = { pattern: 'sand', colors: [[206, 190, 140]] };
const GRAVEL_TEX: TextureSpec = { pattern: 'gravel', colors: [[120, 116, 112]] };

/** The block table — the single source of truth. Order here does NOT affect ids. */
export const BLOCK_DEFS: BlockDef[] = [
  { id: AIR, name: 'air', opaque: false, transparent: true },
  {
    id: GRASS,
    name: 'grass',
    opaque: true,
    transparent: false,
    creative: true,
    tint: 'grass',
    tintTopOnly: true,
    faces: {
      top: { pattern: 'grassTop', colors: [[86, 152, 60]] },
      side: {
        pattern: 'grassSide',
        colors: [
          [134, 96, 62],
          [86, 152, 60],
        ],
      },
      bottom: DIRT_TEX,
    },
  },
  {
    id: DIRT,
    name: 'dirt',
    opaque: true,
    transparent: false,
    creative: true,
    faces: DIRT_TEX,
  },
  {
    id: STONE,
    name: 'stone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([128, 128, 132]),
  },
  {
    id: WOOD,
    name: 'wood',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      top: { pattern: 'rings', colors: [[160, 130, 85]] },
      side: { pattern: 'bark', colors: [[105, 78, 46]] },
      bottom: { pattern: 'rings', colors: [[160, 130, 85]] },
    },
  },
  {
    id: LEAVES,
    name: 'leaves',
    opaque: true,
    transparent: false,
    creative: true,
    tint: 'foliage',
    faces: { pattern: 'leaves', colors: [[54, 120, 44]] },
  },
  {
    id: SAND,
    name: 'sand',
    opaque: true,
    transparent: false,
    creative: true,
    faces: SAND_TEX,
  },
  { id: WATER, name: 'water', opaque: false, transparent: true, faces: speck([50, 110, 200], 10) },
  {
    id: SNOW,
    name: 'snow',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([236, 240, 245], 6),
  },
  {
    id: CACTUS,
    name: 'cactus',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'ridges', colors: [[60, 110, 60]] },
  },
  {
    id: GLASS,
    name: 'glass',
    opaque: false,
    transparent: true,
    creative: true,
    faces: { pattern: 'glass', colors: [[205, 232, 240]] },
  },
  {
    id: PLANKS,
    name: 'planks',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'planks', colors: [[165, 130, 80]] },
  },
  {
    id: COBBLESTONE,
    name: 'cobblestone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'cobble',
      colors: [
        [118, 118, 122],
        [70, 70, 74],
      ],
    },
  },
  {
    id: BRICK,
    name: 'brick',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'brick',
      colors: [
        [150, 70, 58],
        [198, 182, 162],
      ],
    },
  },
  {
    id: LANTERN,
    name: 'lantern',
    opaque: true,
    transparent: false,
    light: 14,
    creative: true,
    faces: {
      pattern: 'lantern',
      colors: [
        [60, 52, 40],
        [255, 226, 140],
      ],
    },
  },
  { id: COAL_ORE, name: 'coal ore', opaque: true, transparent: false, faces: ore([40, 40, 44]) },
  { id: IRON_ORE, name: 'iron ore', opaque: true, transparent: false, faces: ore([196, 150, 110]) },
  { id: GOLD_ORE, name: 'gold ore', opaque: true, transparent: false, faces: ore([235, 205, 70]) },
  {
    id: CRYSTAL,
    name: 'crystal',
    opaque: true,
    transparent: false,
    light: 7,
    faces: ore([120, 220, 235]),
  },
  {
    id: DEEPSLATE,
    name: 'deepslate',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([62, 62, 70]),
  },
  {
    id: EMERALD_ORE,
    name: 'emerald ore',
    opaque: true,
    transparent: false,
    faces: ore([40, 200, 110]),
  },
  {
    id: GLOWSTONE,
    name: 'glowstone',
    opaque: true,
    transparent: false,
    light: 15,
    creative: true,
    faces: { pattern: 'glow', colors: [[230, 200, 110]] },
  },
  {
    id: BOOKSHELF,
    name: 'bookshelf',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      top: { pattern: 'planks', colors: [[165, 130, 80]] },
      side: { pattern: 'bookshelf', colors: [[150, 116, 70]] },
      bottom: { pattern: 'planks', colors: [[165, 130, 80]] },
    },
  },
  {
    id: FURNACE,
    name: 'furnace',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      top: stone([120, 120, 124]),
      side: {
        pattern: 'furnace',
        colors: [
          [120, 120, 124],
          [60, 48, 44],
        ],
      },
      bottom: stone([120, 120, 124]),
    },
  },
  {
    id: MUD,
    name: 'mud',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([90, 74, 60], 14),
  },
  {
    id: TERRACOTTA,
    name: 'terracotta',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([170, 96, 70], 16),
  },
  {
    id: GRAVEL,
    name: 'gravel',
    opaque: true,
    transparent: false,
    creative: true,
    faces: GRAVEL_TEX,
  },
  {
    id: STONE_SLAB,
    name: 'stone slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: stone([128, 128, 132]),
  },
  {
    id: PLANK_SLAB,
    name: 'plank slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: { pattern: 'planks', colors: [[165, 130, 80]] },
  },
  {
    id: FLOWER,
    name: 'flower',
    opaque: false,
    transparent: false,
    creative: true,
    shape: 'cross',
    faces: {
      pattern: 'flower',
      colors: [
        [60, 140, 60],
        [220, 70, 90],
      ],
    },
  },
  {
    id: TALL_GRASS,
    name: 'tall grass',
    opaque: false,
    transparent: false,
    creative: true,
    shape: 'cross',
    tint: 'foliage',
    faces: { pattern: 'tallGrass', colors: [[70, 150, 64]] },
  },
  {
    id: STAIRS_STONE,
    name: 'stone stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: stone([128, 128, 132]),
  },
  {
    id: STAIRS_PLANK,
    name: 'plank stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: { pattern: 'planks', colors: [[165, 130, 80]] },
  },
  {
    id: STAIRS_COBBLE,
    name: 'cobblestone stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'cobble',
      colors: [
        [118, 118, 122],
        [70, 70, 74],
      ],
    },
  },
  {
    id: STAIRS_BRICK,
    name: 'brick stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'brick',
      colors: [
        [150, 70, 58],
        [198, 182, 162],
      ],
    },
  },
  {
    id: OAK_FENCE,
    name: 'oak fence',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'fence',
    faces: { pattern: 'planks', colors: [[150, 116, 70]] },
  },
  {
    id: COBBLE_WALL,
    name: 'cobblestone wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: {
      pattern: 'cobble',
      colors: [
        [118, 118, 122],
        [70, 70, 74],
      ],
    },
  },
  {
    id: STONEBRICK_WALL,
    name: 'stone brick wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: {
      pattern: 'brick',
      colors: [
        [120, 120, 124],
        [150, 150, 154],
      ],
    },
  },
  {
    id: OAK_FENCE_GATE,
    name: 'oak fence gate',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'gate',
    faces: { pattern: 'planks', colors: [[150, 116, 70]] },
  },
  {
    id: LADDER,
    name: 'ladder',
    opaque: false,
    transparent: false,
    creative: true,
    shape: 'ladder',
    faces: { pattern: 'ladder', colors: [[158, 122, 74]] },
  },
  {
    id: OAK_DOOR,
    name: 'oak door',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'door',
    faces: {
      pattern: 'door',
      colors: [
        [160, 126, 78],
        [110, 84, 50],
      ],
    },
  },
  {
    id: LAVA,
    name: 'lava',
    opaque: false,
    transparent: true,
    light: 12,
    creative: true,
    faces: {
      pattern: 'speckle',
      colors: [
        [232, 74, 20],
        [255, 178, 48],
      ],
      amp: 28,
    },
  },
  {
    id: LIMESTONE,
    name: 'limestone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([198, 200, 204], 10),
  },
  {
    id: CARVED_LIMESTONE,
    name: 'carved limestone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'brick',
      colors: [
        [190, 192, 198],
        [220, 222, 226],
      ],
    },
  },
  {
    id: SLATE,
    name: 'slate',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([52, 58, 72]),
  },
  {
    id: SLATE_SLAB,
    name: 'slate slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: stone([52, 58, 72]),
  },
  {
    id: STAIRS_SLATE,
    name: 'slate stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: stone([52, 58, 72]),
  },
  {
    id: CYAN_GLASS,
    name: 'cyan glass',
    opaque: false,
    transparent: true,
    creative: true,
    faces: { pattern: 'glass', colors: [[120, 210, 230]] },
  },
  {
    id: GOLD_TRIM,
    name: 'gold trim',
    opaque: true,
    transparent: false,
    light: 10,
    creative: true,
    faces: {
      pattern: 'glow',
      colors: [[235, 200, 90]],
    },
  },
  {
    id: WARM_STONE,
    name: 'warm stone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([137, 124, 112]),
  },
  {
    id: BLUE_STONE,
    name: 'blue stone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([105, 118, 132]),
  },
  {
    id: GRANITE,
    name: 'granite',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([151, 139, 136]),
  },
  {
    id: BASALT,
    name: 'basalt',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([55, 61, 64]),
  },
  {
    id: SANDSTONE,
    name: 'sandstone',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([194, 166, 112]),
  },
  {
    id: AGED_MASONRY,
    name: 'aged masonry',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'brick',
      colors: [
        [112, 116, 113],
        [151, 148, 137],
      ],
    },
  },
  {
    id: WARM_MASONRY,
    name: 'warm masonry',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'brick',
      colors: [
        [151, 130, 108],
        [194, 177, 150],
      ],
    },
  },
  {
    id: MOSSY_COBBLE,
    name: 'mossy cobble',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'cobble',
      colors: [
        [103, 112, 91],
        [61, 70, 57],
      ],
    },
  },
  {
    id: CLAY_ROOF,
    name: 'clay roof',
    opaque: true,
    transparent: false,
    creative: true,
    faces: {
      pattern: 'brick',
      colors: [
        [151, 67, 48],
        [100, 48, 39],
      ],
    },
  },
  {
    id: GREEN_SLATE,
    name: 'green slate',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([55, 78, 70]),
  },
  {
    id: BROWN_SLATE,
    name: 'brown slate',
    opaque: true,
    transparent: false,
    creative: true,
    faces: stone([79, 64, 58]),
  },
  {
    id: RED_DIRT,
    name: 'red dirt',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'dirt', colors: [[145, 79, 58]] },
  },
  {
    id: DARK_LOAM,
    name: 'dark loam',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'dirt', colors: [[75, 61, 48]] },
  },
  {
    id: OCHRE_EARTH,
    name: 'ochre earth',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'dirt', colors: [[174, 126, 60]] },
  },
  {
    id: SCREE,
    name: 'scree',
    opaque: true,
    transparent: false,
    creative: true,
    faces: { pattern: 'gravel', colors: [[103, 108, 112]] },
  },
  {
    id: DIRTY_SNOW,
    name: 'dirty snow',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([196, 199, 192], 9),
  },
  {
    id: BLUE_ICE,
    name: 'blue ice',
    opaque: true,
    transparent: false,
    creative: true,
    faces: speck([146, 190, 211], 7),
  },
  {
    id: WARM_MASONRY_SLAB,
    name: 'warm masonry slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: {
      pattern: 'brick',
      colors: [
        [151, 130, 108],
        [194, 177, 150],
      ],
    },
  },
  {
    id: STAIRS_WARM_MASONRY,
    name: 'warm masonry stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'brick',
      colors: [
        [151, 130, 108],
        [194, 177, 150],
      ],
    },
  },
  {
    id: WARM_MASONRY_WALL,
    name: 'warm masonry wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: {
      pattern: 'brick',
      colors: [
        [151, 130, 108],
        [194, 177, 150],
      ],
    },
  },
  {
    id: SANDSTONE_SLAB,
    name: 'sandstone slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: stone([194, 166, 112]),
  },
  {
    id: STAIRS_SANDSTONE,
    name: 'sandstone stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: stone([194, 166, 112]),
  },
  {
    id: SANDSTONE_WALL,
    name: 'sandstone wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: stone([194, 166, 112]),
  },
  {
    id: BASALT_SLAB,
    name: 'basalt slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: stone([55, 61, 64]),
  },
  {
    id: STAIRS_BASALT,
    name: 'basalt stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: stone([55, 61, 64]),
  },
  {
    id: BASALT_WALL,
    name: 'basalt wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: stone([55, 61, 64]),
  },
  {
    id: CLAY_ROOF_SLAB,
    name: 'clay roof slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: {
      pattern: 'brick',
      colors: [
        [151, 67, 48],
        [100, 48, 39],
      ],
    },
  },
  {
    id: STAIRS_CLAY_ROOF,
    name: 'clay roof stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'brick',
      colors: [
        [151, 67, 48],
        [100, 48, 39],
      ],
    },
  },
];

export interface BlockTextures {
  uniqueSpecs: TextureSpec[];
  faceLayers: Map<BlockId, number[]>;
  layerCount: number;
}

/** Dedup all face specs into layers (first-appearance order) and resolve per-block face layers. */
export function buildBlockTextures(defs: BlockDef[]): BlockTextures {
  const uniqueSpecs: TextureSpec[] = [];
  const layerByKey = new Map<string, number>();
  const faceLayers = new Map<BlockId, number[]>();
  for (const def of defs) {
    if (!def.faces) continue;
    const specs = expandFaces(def.faces);
    const layers = specs.map((spec) => {
      const key = specKey(spec);
      let layer = layerByKey.get(key);
      if (layer === undefined) {
        layer = uniqueSpecs.length;
        layerByKey.set(key, layer);
        uniqueSpecs.push(spec);
      }
      return layer;
    });
    faceLayers.set(def.id, layers);
  }
  return { uniqueSpecs, faceLayers, layerCount: uniqueSpecs.length };
}

export const BLOCK_TEXTURES: BlockTextures = buildBlockTextures(BLOCK_DEFS);
export const TEXTURE_LAYER_COUNT = BLOCK_TEXTURES.layerCount;
