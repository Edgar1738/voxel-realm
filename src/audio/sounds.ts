import type { BlockId } from '../core/types';
import {
  AIR,
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  LEAVES,
  GLASS,
  WATER,
  SNOW,
  CACTUS,
  PLANKS,
  COBBLESTONE,
  BRICK,
  LANTERN,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  CRYSTAL,
  DEEPSLATE,
  EMERALD_ORE,
  GLOWSTONE,
  BOOKSHELF,
  FURNACE,
  MUD,
  TERRACOTTA,
  GRAVEL,
  STONE_SLAB,
  PLANK_SLAB,
  FLOWER,
  TALL_GRASS,
  STAIRS_STONE,
  STAIRS_PLANK,
  STAIRS_COBBLE,
  STAIRS_BRICK,
  OAK_FENCE,
  COBBLE_WALL,
  STONEBRICK_WALL,
  OAK_FENCE_GATE,
  LAVA,
  MAGMA,
  BASALT,
  OBSIDIAN,
} from '../blocks/blocks';

/**
 * Minecraft-style material sound families. Every audible block maps to one family;
 * dig/place/step are all variations of the family's base sound (pitch-randomized on play).
 */
export type SoundFamily = 'stone' | 'wood' | 'grass' | 'dirt' | 'sand' | 'snow' | 'glass' | 'water';

export type SoundKind = 'break' | 'place' | 'step';

const FAMILY: Partial<Record<BlockId, SoundFamily>> = {
  [GRASS]: 'grass',
  [LEAVES]: 'grass',
  [CACTUS]: 'grass',
  [FLOWER]: 'grass',
  [TALL_GRASS]: 'grass',
  [DIRT]: 'dirt',
  [MUD]: 'dirt',
  [GRAVEL]: 'dirt',
  [SAND]: 'sand',
  [SNOW]: 'snow',
  [STONE]: 'stone',
  [COBBLESTONE]: 'stone',
  [BRICK]: 'stone',
  [DEEPSLATE]: 'stone',
  [TERRACOTTA]: 'stone',
  [FURNACE]: 'stone',
  [COAL_ORE]: 'stone',
  [IRON_ORE]: 'stone',
  [GOLD_ORE]: 'stone',
  [EMERALD_ORE]: 'stone',
  [STONE_SLAB]: 'stone',
  [STAIRS_STONE]: 'stone',
  [STAIRS_COBBLE]: 'stone',
  [STAIRS_BRICK]: 'stone',
  [COBBLE_WALL]: 'stone',
  [STONEBRICK_WALL]: 'stone',
  [MAGMA]: 'stone',
  [BASALT]: 'stone',
  [OBSIDIAN]: 'stone',
  [WOOD]: 'wood',
  [PLANKS]: 'wood',
  [BOOKSHELF]: 'wood',
  [PLANK_SLAB]: 'wood',
  [STAIRS_PLANK]: 'wood',
  [OAK_FENCE]: 'wood',
  [OAK_FENCE_GATE]: 'wood',
  [GLASS]: 'glass',
  [CRYSTAL]: 'glass',
  [LANTERN]: 'glass',
  [GLOWSTONE]: 'glass',
  [WATER]: 'water',
  [LAVA]: 'water',
};

/** Sound family for a block id. AIR is silent; unknown ids fall back to stone. */
export function familyOf(id: BlockId): SoundFamily | undefined {
  if (id === AIR) return undefined;
  return FAMILY[id] ?? 'stone';
}

/**
 * Picks the one representative change to voice for an edit batch: the first break if any
 * voxel was broken, otherwise the first placement. Batches mix both (e.g. replace), and
 * playing one sound per voxel would be a wall of noise — Minecraft-style is one per action.
 */
export function batchSound(
  changes: ReadonlyArray<{ before: BlockId; after: BlockId }>,
): { kind: 'break' | 'place'; family: SoundFamily } | undefined {
  let place: SoundFamily | undefined;
  for (const c of changes) {
    if (c.after === AIR && c.before !== AIR) {
      const family = familyOf(c.before);
      if (family) return { kind: 'break', family };
    } else if (c.after !== AIR && place === undefined) {
      place = familyOf(c.after);
    }
  }
  return place ? { kind: 'place', family: place } : undefined;
}

/** Distance (in blocks) walked between footsteps. */
export const STRIDE_LENGTH = 2.1;

/** Downward speed (blocks/s) below which a landing is silent. */
export const LANDING_MIN_SPEED = 7;
/** Downward speed at which the landing thud reaches full volume. */
export const LANDING_MAX_SPEED = 24;

/** Landing thud volume [0..1] for a downward impact speed; 0 = silent. */
export function landingVolume(impactSpeed: number): number {
  if (impactSpeed < LANDING_MIN_SPEED) return 0;
  const t = (impactSpeed - LANDING_MIN_SPEED) / (LANDING_MAX_SPEED - LANDING_MIN_SPEED);
  return Math.min(1, 0.35 + t * 0.65);
}

/** Parses a persisted volume string to [0..1], or the default when absent/invalid. */
export function parseVolume(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
}
